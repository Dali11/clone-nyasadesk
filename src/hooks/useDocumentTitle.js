import { useEffect } from 'react';

// Sets the browser tab title for the lifetime of the mounted page, and
// restores the previous title on unmount. Keeps each page's tab
// identifiable when several are open (Inbox, Dashboard, Settings, etc.)
// instead of every route showing the same static "Nyasadesk — Team Inbox".
export function useDocumentTitle(title) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} · Nyasadesk` : 'Nyasadesk — Team Inbox';
    return () => { document.title = prev; };
  }, [title]);
}
