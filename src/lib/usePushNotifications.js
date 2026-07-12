import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function authedFetch(path, body) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Request failed');
  return res.json();
}

// Returns true if this push endpoint is a known dead/legacy endpoint format
function isDeadEndpoint(endpoint) {
  if (!endpoint) return true;
  // Old FCM legacy endpoint — shut down June 2025
  if (endpoint.includes('fcm.googleapis.com/fcm/send/')) return true;
  return false;
}

// WhatsApp-style push notifications for new inbound messages. Supported on
// Chrome/Edge/Firefox desktop+Android always; on iOS Safari only once the
// site is added to the home screen (Apple's platform restriction, not ours).
export function usePushNotifications(workspaceOwnerId) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
    setSupported(isSupported);
    if (!isSupported || !workspaceOwnerId) return;

    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();

      // If browser has a dead/legacy endpoint cached, force-unsubscribe it now
      if (sub && isDeadEndpoint(sub.endpoint)) {
        console.warn('[push] Dead endpoint detected — unsubscribing stale subscription');
        await sub.unsubscribe().catch(() => {});
        setSubscribed(false);
        return; // will re-subscribe on next user interaction or auto-subscribe below
      }

      if (sub) {
        // Re-save to Supabase (in case DB was cleared or subscription is missing)
        try {
          await authedFetch('/api/team?action=push-subscribe', {
            subscription: sub.toJSON(),
            workspace_id: workspaceOwnerId,
          });
        } catch (_) { /* non-fatal */ }
        setSubscribed(true);
      } else {
        setSubscribed(false);
      }
    }).catch(() => {});
  }, [workspaceOwnerId]);

  const subscribe = useCallback(async () => {
    if (!supported || !workspaceOwnerId) return;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;

      // Unsubscribe any stale subscription first
      let sub = await reg.pushManager.getSubscription();
      if (sub && isDeadEndpoint(sub.endpoint)) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      await authedFetch('/api/team?action=push-subscribe', {
        subscription: sub.toJSON(),
        workspace_id: workspaceOwnerId,
      });
      setSubscribed(true);
    } catch (e) {
      console.error('[usePushNotifications] subscribe failed:', e);
    } finally {
      setLoading(false);
    }
  }, [supported, workspaceOwnerId]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await authedFetch('/api/team?action=push-unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.error('[usePushNotifications] unsubscribe failed:', e);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
