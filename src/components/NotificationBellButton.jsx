/**
 * NotificationBellButton — standalone header button for push notifications.
 *
 * Replaces the buried ProfileMenu toggle: a single Bell/BellOff icon button
 * that lives in the app header (mobile top bar + desktop/tablet sidebar) so
 * enabling notifications is one visible tap, not a menu dive.
 *
 * Behavior (same engine as the old toggle — usePushNotifications):
 *  - Off → tap: requests permission, creates the browser push subscription,
 *    persists it to push_subscriptions, toasts success.
 *  - On  → tap: unsubscribes (DB row + browser), toasts muted.
 *  - Permission 'denied' → toast explaining how to unblock in browser settings.
 */
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { usePushNotifications } from '@/lib/usePushNotifications';
import { useToast } from '@/components/ui/use-toast';

export default function NotificationBellButton({ className = '' }) {
  const { workspaceOwnerId } = useNyasaAuth();
  const { toast } = useToast();
  const {
    supported, permission, subscribed, loading,
    subscribe, unsubscribe,
  } = usePushNotifications(workspaceOwnerId);

  const handleToggle = async () => {
    if (loading || !workspaceOwnerId) {
      if (!workspaceOwnerId) toast({ title: 'Not ready', description: 'Workspace is still loading — try again in a moment.', variant: 'destructive' });
      return;
    }
    if (subscribed) {
      await unsubscribe();
      toast({ title: 'Notifications muted', description: 'You will no longer receive push alerts.' });
      return;
    }
    const result = await subscribe();
    if (result?.ok) {
      toast({ title: '🔔 Notifications on', description: 'You will receive alerts for new messages.' });
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      toast({
        title: 'Notifications blocked',
        description: 'Your browser has them turned off for this site. Open your browser’s site settings and allow Notifications, then tap the bell again.',
        variant: 'destructive',
        duration: 6000,
      });
    } else if (result?.error) {
      toast({ title: 'Notifications failed', description: result.error, variant: 'destructive' });
    }
  };

  if (!supported) return null;

  const icon = loading
    ? <Loader2 className="w-5 h-5 animate-spin" />
    : subscribed ? <Bell className="w-5 h-5 text-[#00A884]" />
    : <BellOff className="w-5 h-5 text-[#8696A0]" />;

  return (
    <button
      onClick={handleToggle}
      title={subscribed ? 'Notifications on — tap to mute' : 'Notifications off — tap to enable'}
      aria-label="Toggle push notifications"
      className={`relative shrink-0 transition-colors ${className}`}
    >
      {icon}
    </button>
  );
}
