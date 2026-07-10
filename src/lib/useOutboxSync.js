/**
 * useOutboxSync — flushes queued offline messages when back online.
 * Call this once at the top of the app (e.g. in Inbox or App.jsx).
 */
import { useEffect, useRef } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { getOutbox, deleteOutboxItem } from './offlineDb';
import { sendMessage } from './channels';

export function useOutboxSync(workspaceOwnerId) {
  const { isOnline } = useOnlineStatus();
  const flushing = useRef(false);

  useEffect(() => {
    if (!isOnline || !workspaceOwnerId || flushing.current) return;

    async function flush() {
      flushing.current = true;
      try {
        const queue = await getOutbox();
        if (!queue.length) return;
        console.log(`[Outbox] Flushing ${queue.length} queued message(s)…`);

        for (const item of queue) {
          try {
            await sendMessage(
              item.workspaceId,
              item.conversationId,
              item.body,
              item.senderName,
              item.attachments || null,
              item.senderId || null,
              item.replyTo || null,
            );
            await deleteOutboxItem(item.localId);
          } catch (e) {
            console.warn('[Outbox] Failed to send queued message:', e.message);
            // Leave in queue — will retry next reconnect
          }
        }
      } finally {
        flushing.current = false;
      }
    }

    flush();
  }, [isOnline, workspaceOwnerId]);
}
