import { useEffect, useState, useCallback, useRef } from 'react';

// Loads the Facebook JavaScript SDK on demand and tracks readiness.
// Returns { loadFacebookSDK, sdkReady }:
//   - loadFacebookSDK(): async — ensures the SDK script is injected and
//     window.FB is available. Safe to call multiple times.
//   - sdkReady: boolean — true once window.FB exists.
export function useFacebookSDK() {
  const [sdkReady, setSdkReady] = useState(!!window.FB);
  const loadingRef = useRef(null);

  useEffect(() => {
    if (window.FB) setSdkReady(true);
  }, []);

  const loadFacebookSDK = useCallback(() => {
    if (window.FB) {
      setSdkReady(true);
      return Promise.resolve();
    }
    if (loadingRef.current) return loadingRef.current;

    loadingRef.current = new Promise((resolve) => {
      window.fbAsyncInit = function () {
        // FB.init is called by the caller with the right appId.
        setSdkReady(true);
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.FB) { setSdkReady(true); resolve(); }
      };
      document.head.appendChild(script);
    });

    return loadingRef.current;
  }, []);

  return { loadFacebookSDK, sdkReady };
}
