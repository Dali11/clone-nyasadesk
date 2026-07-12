import { useState, useEffect, useCallback } from 'react';
import { Download, Bell, X, Smartphone, CheckCircle2, Users } from 'lucide-react';
import { usePhoneContacts, hasContactPickerAPI } from '@/lib/usePhoneContacts';
import { usePushNotifications } from '@/lib/usePushNotifications';

// ── Constants ──────────────────────────────────────────────────────────────
const INSTALL_DISMISSED_KEY    = 'nyasa-install-dismissed';
const NOTIF_DISMISSED_KEY      = 'nyasa-notif-dismissed';
const CONTACTS_DISMISSED_KEY   = 'nyasa-contacts-dismissed';
const CONTACTS_DELAY_MS        = 1500; // show contacts prompt 1.5s after notif done
const DELAY_AFTER_LOAD_MS    = 4000;   // wait 4s before showing anything
const NOTIF_DELAY_MS         = 2000;   // show notif prompt 2s after install dismissed/done
const REDISPLAY_DAYS         = 3;      // re-show install prompt after N days if dismissed

function wasDismissedRecently(key) {
  try {
    const ts = localStorage.getItem(key);
    if (!ts) return false;
    const age = Date.now() - parseInt(ts, 10);
    return age < REDISPLAY_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

function setDismissed(key) {
  try { localStorage.setItem(key, String(Date.now())); } catch {}
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function InstallPrompt({ workspaceOwnerId }) {
  const [deferredPrompt, setDeferredPrompt]     = useState(null);
  const [showInstall, setShowInstall]           = useState(false);
  const [showNotif, setShowNotif]               = useState(false);
  const [notifGranted, setNotifGranted]         = useState(false);
  const [isIOS, setIsIOS]                       = useState(false);
  const [installing, setInstalling]             = useState(false);
  const [showContacts, setShowContacts]         = useState(false);
  const [contactsSynced, setContactsSynced]     = useState(false);
  const { syncContacts, count: contactCount }   = usePhoneContacts();
  const { subscribe: subscribePush } = usePushNotifications(workspaceOwnerId);

  // Detect iOS (needs different install UX — no beforeinstallprompt)
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
    setIsIOS(ios);
  }, []);

  // Capture the beforeinstallprompt event (Chrome/Edge/Android)
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Decide when to show the install prompt
  useEffect(() => {
    if (isStandalone()) return; // already installed
    if (wasDismissedRecently(INSTALL_DISMISSED_KEY)) {
      // Dismissed recently — skip install, check notif instead
      maybeShowNotif();
      return;
    }

    const timer = setTimeout(() => {
      // Show if: native prompt captured (Android) OR iOS Safari
      const ua = navigator.userAgent;
      const ios = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
      const canInstall = deferredPrompt || ios;
      if (canInstall) setShowInstall(true);
      else maybeShowNotif(); // no install possible, go straight to notif
    }, DELAY_AFTER_LOAD_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredPrompt]);

  function maybeShowNotif() {
    if (wasDismissedRecently(NOTIF_DISMISSED_KEY)) {
      maybeShowContacts();
      return;
    }
    if (typeof Notification === 'undefined') { maybeShowContacts(); return; }
    if (Notification.permission === 'granted') { maybeShowContacts(); return; }
    if (Notification.permission === 'denied')  { maybeShowContacts(); return; }
    setTimeout(() => setShowNotif(true), NOTIF_DELAY_MS);
  }

  function maybeShowContacts() {
    // Only on Android Chrome (Contact Picker API) — skip on iOS/desktop
    if (!hasContactPickerAPI()) return;
    if (wasDismissedRecently(CONTACTS_DISMISSED_KEY)) return;
    if (localStorage.getItem('nyasa-phone-book-synced')) return; // already synced
    setTimeout(() => setShowContacts(true), CONTACTS_DELAY_MS);
  }

  // ── Install handlers ────────────────────────────────────────────────────
  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      setInstalling(true);
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setInstalling(false);
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setShowInstall(false);
        // Don't show notif prompt immediately after install — OS will ask
      } else {
        setDismissed(INSTALL_DISMISSED_KEY);
        setShowInstall(false);
        maybeShowNotif();
      }
    }
  }, [deferredPrompt]);

  const dismissInstall = useCallback(() => {
    setDismissed(INSTALL_DISMISSED_KEY);
    setShowInstall(false);
    maybeShowNotif();
  }, []);

  // ── Notification handlers ───────────────────────────────────────────────
  const handleEnableNotif = useCallback(async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setNotifGranted(true);
        // Register SW + store push subscription so backend can actually deliver pushes
        subscribePush().catch(() => {});
        setTimeout(() => {
          setShowNotif(false);
          maybeShowContacts();
        }, 1800);
      } else {
        setDismissed(NOTIF_DISMISSED_KEY);
        setShowNotif(false);
        maybeShowContacts();
      }
    } catch {
      setShowNotif(false);
      maybeShowContacts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissNotif = useCallback(() => {
    setDismissed(NOTIF_DISMISSED_KEY);
    setShowNotif(false);
    maybeShowContacts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSyncContacts = useCallback(async () => {
    const result = await syncContacts();
    if (result.success) {
      setContactsSynced(true);
      setTimeout(() => setShowContacts(false), 2000);
    } else if (result.reason === 'cancelled') {
      // User dismissed the picker — don't penalise, let them try again later
    } else {
      setDismissed(CONTACTS_DISMISSED_KEY);
      setShowContacts(false);
    }
  }, [syncContacts]);

  const dismissContacts = useCallback(() => {
    setDismissed(CONTACTS_DISMISSED_KEY);
    setShowContacts(false);
  }, []);

  // ── Nothing to show ─────────────────────────────────────────────────────
  if (!showInstall && !showNotif && !showContacts) return null;

  // ── Install prompt ───────────────────────────────────────────────────────
  if (showInstall) {
    return (
      <div className="fixed bottom-20 md:bottom-6 left-0 right-0 z-[200] flex justify-center px-3 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden"
          style={{
            background: 'var(--nyasa-surface-2)',
            borderColor: 'var(--nyasa-border)',
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(24px); opacity: 0; }
              to   { transform: translateY(0);    opacity: 1; }
            }
          `}</style>

          {/* Dismiss */}
          <button
            onClick={dismissInstall}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 transition-colors"
            style={{ color: 'var(--nyasa-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-4 flex items-start gap-3">
            {/* Icon */}
            <div className="w-12 h-12 rounded-xl shrink-0 overflow-hidden shadow">
              <img src="/icon-192.png" alt="Nyasadesk" className="w-full h-full object-cover" />
            </div>

            <div className="min-w-0 flex-1 pr-4">
              <p className="font-bold text-sm" style={{ color: 'var(--nyasa-text)' }}>
                Install Nyasadesk
              </p>

              {isIOS ? (
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--nyasa-text-muted)' }}>
                  Tap <strong style={{ color: 'var(--nyasa-text)' }}>Share →</strong> then{' '}
                  <strong style={{ color: 'var(--nyasa-text)' }}>Add to Home Screen</strong> to install
                  the app — works offline and gets push notifications.
                </p>
              ) : (
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--nyasa-text-muted)' }}>
                  Install for faster access, offline use, and WhatsApp-style push notifications — no app store needed.
                </p>
              )}

              {!isIOS && (
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-black transition-all disabled:opacity-60 active:scale-95"
                  style={{ background: '#25D366' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  {installing ? 'Installing…' : 'Install App'}
                </button>
              )}
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className="flex items-center gap-2 px-4 py-2.5 text-[11px]"
            style={{ background: 'var(--nyasa-surface-3)', color: 'var(--nyasa-text-muted)' }}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            Works on Android & iOS · No Play Store required
          </div>
        </div>
      </div>
    );
  }

  // ── Notification prompt ──────────────────────────────────────────────────
  if (showNotif) {
    return (
      <div className="fixed bottom-20 md:bottom-6 left-0 right-0 z-[200] flex justify-center px-3 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden"
          style={{
            background: 'var(--nyasa-surface-2)',
            borderColor: 'var(--nyasa-border)',
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(24px); opacity: 0; }
              to   { transform: translateY(0);    opacity: 1; }
            }
          `}</style>

          <button
            onClick={dismissNotif}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 transition-colors"
            style={{ color: 'var(--nyasa-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-4 flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center"
              style={{ background: notifGranted ? 'rgba(37,211,102,0.15)' : 'rgba(37,211,102,0.10)' }}
            >
              {notifGranted
                ? <CheckCircle2 className="w-6 h-6" style={{ color: '#25D366' }} />
                : <Bell className="w-6 h-6" style={{ color: '#25D366' }} />
              }
            </div>

            <div className="min-w-0 flex-1 pr-4">
              {notifGranted ? (
                <>
                  <p className="font-bold text-sm" style={{ color: '#25D366' }}>Notifications enabled!</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--nyasa-text-muted)' }}>
                    You'll get notified instantly for new messages.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-sm" style={{ color: 'var(--nyasa-text)' }}>
                    Enable notifications
                  </p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--nyasa-text-muted)' }}>
                    Get instant alerts for new customer messages — even when the app isn't open.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleEnableNotif}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-black transition-all active:scale-95"
                      style={{ background: '#25D366' }}
                    >
                      <Bell className="w-3.5 h-3.5" />
                      Enable
                    </button>
                    <button
                      onClick={dismissNotif}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all"
                      style={{
                        color: 'var(--nyasa-text-muted)',
                        borderColor: 'var(--nyasa-border)',
                        background: 'var(--nyasa-surface-3)',
                      }}
                    >
                      Not now
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;

  // ── Contacts permission prompt ───────────────────────────────────────────
  if (showContacts) {
    return (
      <div className="fixed bottom-20 md:bottom-6 left-0 right-0 z-[200] flex justify-center px-3 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden"
          style={{
            background: 'var(--nyasa-surface-2)',
            borderColor: 'var(--nyasa-border)',
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(24px); opacity: 0; }
              to   { transform: translateY(0);    opacity: 1; }
            }
          `}</style>

          <button
            onClick={dismissContacts}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 transition-colors"
            style={{ color: 'var(--nyasa-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-4 flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center"
              style={{ background: contactsSynced ? 'rgba(37,211,102,0.15)' : 'rgba(37,211,102,0.10)' }}
            >
              {contactsSynced
                ? <CheckCircle2 className="w-6 h-6" style={{ color: '#25D366' }} />
                : <Users className="w-6 h-6" style={{ color: '#25D366' }} />
              }
            </div>

            <div className="min-w-0 flex-1 pr-4">
              {contactsSynced ? (
                <>
                  <p className="font-bold text-sm" style={{ color: '#25D366' }}>
                    Phone contacts synced!
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--nyasa-text-muted)' }}>
                    WhatsApp senders are now identified by name — just like WhatsApp.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-sm" style={{ color: 'var(--nyasa-text)' }}>
                    See contact names in inbox
                  </p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--nyasa-text-muted)' }}>
                    Allow access to your phone contacts so Nyasadesk can show names and photos for WhatsApp senders — just like the WhatsApp app does.
                  </p>
                  <button
                    onClick={handleSyncContacts}
                    className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-black transition-all active:scale-95"
                    style={{ background: '#25D366' }}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Allow contacts access
                  </button>
                  <button
                    onClick={dismissContacts}
                    className="mt-2 text-xs"
                    style={{ color: 'var(--nyasa-text-muted)' }}
                  >
                    Not now
                  </button>
                </>
              )}
            </div>
          </div>

          <div
            className="flex items-center gap-2 px-4 py-2.5 text-[11px]"
            style={{ background: 'var(--nyasa-surface-3)', color: 'var(--nyasa-text-muted)' }}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            Your contacts stay on this device — they're never uploaded to our servers
          </div>
        </div>
      </div>
    );
  }

}
