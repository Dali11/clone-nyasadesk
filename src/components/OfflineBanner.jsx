/**
 * OfflineBanner — WhatsApp-style "Waiting for connection…" amber bar
 * and "Back online — syncing…" green flash.
 * Sits at the very top of the app (above everything).
 */
import { useOnlineStatus } from '@/lib/useOnlineStatus';

export default function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();

  if (isOnline && !wasOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2
                 px-4 py-2 text-xs font-semibold text-white transition-all duration-300"
      style={{
        background: wasOffline && isOnline ? '#25D366' : '#856404',
        // Slide down from top
        animation: 'slideDown 0.25s ease-out',
      }}
    >
      {isOnline && wasOffline ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
          Back online — syncing…
        </>
      ) : (
        <>
          {/* Spinning dot */}
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          Waiting for connection…
        </>
      )}
      <style>{`@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}
