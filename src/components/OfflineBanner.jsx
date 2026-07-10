/**
 * OfflineBanner — WhatsApp-style "Waiting for connection…" amber bar
 * and "Back online — syncing…" green flash.
 * 
 * The banner is fixed at top-0, z-9999. A sibling <OfflineSpacer /> must
 * be placed at the top of every layout that has a sticky/fixed header so the
 * header doesn't get hidden behind the banner.
 */
import { useOnlineStatus } from '@/lib/useOnlineStatus';

const BANNER_H = 32; // px — keep in sync with py-1.5 + text-xs (≈32px total)

export default function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();
  if (isOnline && !wasOffline) return null;

  return (
    <>
      {/* Fixed banner */}
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2
                   px-4 py-1.5 text-xs font-semibold text-white"
        style={{
          background: wasOffline && isOnline ? '#25D366' : '#795B00',
          animation: 'slideDown 0.25s ease-out',
          height: BANNER_H,
        }}
      >
        {isOnline && wasOffline ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
            Back online — syncing…
          </>
        ) : (
          <>
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            Waiting for connection…
          </>
        )}
        <style>{`@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`}</style>
      </div>

      {/* Spacer so content below doesn't get hidden behind the fixed banner */}
      <div style={{ height: BANNER_H }} aria-hidden="true" />
    </>
  );
}
