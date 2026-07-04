import { useEffect, useState } from 'react';

// Loads the Facebook JavaScript SDK and initializes it with the app ID.
// Returns true once the SDK is ready, false while loading.
export function useFacebookSDK(appId) {
  const [ready, setReady] = useState(!!window.FB);

  useEffect(() => {
    if (window.FB) { setReady(true); return; }
    if (!appId) return;

    // Inject the SDK script
    window.fbAsyncInit = function () {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: true,
        version: 'v19.0',
      });
      setReady(true);
    };

    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      // Don't remove the SDK once loaded — it's a singleton
    };
  }, [appId]);

  return ready;
}
