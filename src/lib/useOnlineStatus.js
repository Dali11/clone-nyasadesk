/**
 * useOnlineStatus — tracks browser online/offline state
 * Returns { isOnline, wasOffline } where wasOffline is true for 3s after
 * coming back online, letting the UI show "Back online — syncing…"
 */
import { useState, useEffect, useRef } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setWasOffline(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(false);
      clearTimeout(timer.current);
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(timer.current);
    };
  }, []);

  return { isOnline, wasOffline };
}
