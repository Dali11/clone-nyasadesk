/**
 * usePhoneContacts.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the device phone book integration for Nyasadesk.
 *
 * - Requests the Contact Picker API permission on demand (user gesture required)
 * - Pulls names, phones, and photos from the device address book
 * - Stores the lookup table in localStorage so it survives app restarts
 * - Provides a fast O(1) lookup: normalised phone → { name, photoUrl }
 *
 * Browser support:
 *   ✅ Chrome on Android 80+  (Contact Picker API)
 *   ✅ Samsung Internet
 *   ❌ iOS Safari — not supported (Apple blocks this API)
 *   ❌ Desktop Chrome — not supported
 *
 * The hook degrades gracefully on unsupported browsers — it never throws.
 */

import { useState, useEffect, useCallback } from 'react';

const LS_KEY        = 'nyasa-phone-book-v1';      // localStorage key
const LS_SYNCED_KEY = 'nyasa-phone-book-synced';  // timestamp of last sync

// ── Phone normalisation ──────────────────────────────────────────────────────
function normalisePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  return digits || null;
}

function phonesMatch(a, b) {
  if (!a || !b) return false;
  const na = normalisePhone(a);
  const nb = normalisePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Suffix match — last 9 digits (handles 0999... vs 265999... vs +265999...)
  const suffix = 9;
  if (na.length >= suffix && nb.length >= suffix) {
    return na.slice(-suffix) === nb.slice(-suffix);
  }
  return false;
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeCache(map) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch {}
}

// ── Convert a File/Blob to a data URL ────────────────────────────────────────
function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror   = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// ── Check if Contact Picker API is available ─────────────────────────────────
export function hasContactPickerAPI() {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof navigator.contacts.select === 'function'
  );
}

// ── Main hook ────────────────────────────────────────────────────────────────
export function usePhoneContacts() {
  const [phoneBook, setPhoneBook] = useState(() => readCache());
  const [status, setStatus]       = useState('idle'); // idle | requesting | syncing | done | unsupported | error
  const [count, setCount]         = useState(() => Object.keys(readCache()).length);
  const [lastSynced, setLastSynced] = useState(() => {
    try { return localStorage.getItem(LS_SYNCED_KEY) || null; } catch { return null; }
  });

  // Load cache on mount
  useEffect(() => {
    const cached = readCache();
    setPhoneBook(cached);
    setCount(Object.keys(cached).length);
  }, []);

  // ── Request + sync contacts from device ─────────────────────────────────────
  const syncContacts = useCallback(async () => {
    if (!hasContactPickerAPI()) {
      setStatus('unsupported');
      return { success: false, reason: 'unsupported' };
    }

    setStatus('requesting');

    try {
      // The Contact Picker API supports: name, tel, icon (photo), email, address
      const available = await navigator.contacts.getProperties?.() ||
        ['name', 'tel', 'icon'];

      const wantProps = ['name', 'tel'];
      if (available.includes('icon')) wantProps.push('icon');

      const raw = await navigator.contacts.select(wantProps, { multiple: true });

      if (!raw || raw.length === 0) {
        setStatus('idle');
        return { success: true, synced: 0, reason: 'none_selected' };
      }

      setStatus('syncing');

      // Build phone → { name, photoUrl } lookup
      const newMap = {};
      for (const entry of raw) {
        const name = (entry.name || [])[0] || '';
        const tels = (entry.tel || []);
        const icons = (entry.icon || []);

        // Convert first icon blob to data URL (for offline-safe avatar)
        let photoUrl = null;
        if (icons.length > 0) {
          try {
            const blob = icons[0];
            if (blob && blob instanceof Blob) {
              photoUrl = await blobToDataUrl(blob);
            }
          } catch { /* photo failed, continue */ }
        }

        for (const tel of tels) {
          const norm = normalisePhone(tel);
          if (!norm) continue;
          newMap[norm] = { name: name || tel, photoUrl, tel };
        }

        // Also index by last 9 digits for fuzzy matching
        for (const tel of tels) {
          const norm = normalisePhone(tel);
          if (!norm || norm.length < 9) continue;
          const suffix = norm.slice(-9);
          if (!newMap[suffix]) {
            newMap[suffix] = { name: name || tel, photoUrl, tel };
          }
        }
      }

      // Merge with existing cache (don't lose previous syncs)
      const merged = { ...readCache(), ...newMap };
      writeCache(merged);
      try { localStorage.setItem(LS_SYNCED_KEY, new Date().toISOString()); } catch {}

      setPhoneBook(merged);
      setCount(Object.keys(merged).length);
      setLastSynced(new Date().toISOString());
      setStatus('done');

      return { success: true, synced: raw.length, total: Object.keys(merged).length };
    } catch (err) {
      // User cancelled = AbortError — not an error we should surface as error
      if (err.name === 'AbortError' || err.message?.toLowerCase().includes('abort')) {
        setStatus('idle');
        return { success: false, reason: 'cancelled' };
      }
      console.warn('[usePhoneContacts] sync failed:', err);
      setStatus('error');
      return { success: false, reason: err.message || 'unknown' };
    }
  }, []);

  // ── Lookup a phone number in the local phone book ─────────────────────────
  const lookup = useCallback((phone) => {
    if (!phone || Object.keys(phoneBook).length === 0) return null;
    const norm = normalisePhone(phone);
    if (!norm) return null;

    // Direct match
    if (phoneBook[norm]) return phoneBook[norm];

    // Suffix match
    if (norm.length >= 9) {
      const suffix = norm.slice(-9);
      if (phoneBook[suffix]) return phoneBook[suffix];
    }

    // Brute-force match (for edge cases)
    for (const [key, val] of Object.entries(phoneBook)) {
      if (phonesMatch(key, phone)) return val;
    }

    return null;
  }, [phoneBook]);

  // ── Clear the local cache ─────────────────────────────────────────────────
  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_SYNCED_KEY);
    } catch {}
    setPhoneBook({});
    setCount(0);
    setLastSynced(null);
    setStatus('idle');
  }, []);

  return {
    phoneBook,
    count,
    lastSynced,
    status,
    isSupported: hasContactPickerAPI(),
    syncContacts,
    lookup,
    clearCache,
  };
}

// ── Standalone lookup (no hook — for use outside React) ──────────────────────
export function lookupPhoneContact(phone) {
  try {
    const cache = readCache();
    if (!phone || Object.keys(cache).length === 0) return null;
    const norm = normalisePhone(phone);
    if (!norm) return null;
    if (cache[norm]) return cache[norm];
    if (norm.length >= 9) {
      const suffix = norm.slice(-9);
      if (cache[suffix]) return cache[suffix];
    }
    for (const [key, val] of Object.entries(cache)) {
      if (phonesMatch(key, phone)) return val;
    }
    return null;
  } catch { return null; }
}
