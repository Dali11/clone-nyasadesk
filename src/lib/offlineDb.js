/**
 * offlineDb.js — IndexedDB layer for offline-first data
 *
 * Stores:
 *  - conversations   : latest list per workspace (replaces full re-fetch when offline)
 *  - messages        : recent messages per conversation (up to MSG_LIMIT per conv)
 *  - outbox          : messages queued while offline, flushed on reconnect
 *
 * Uses the `idb` wrapper for a clean Promise API over IndexedDB.
 */
import { openDB } from 'idb';

const DB_NAME    = 'nyasadesk-offline';
const DB_VERSION = 1;
const MSG_LIMIT  = 80; // messages to keep per conversation

let _db = null;

async function db() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // conversations: keyed by id
      if (!db.objectStoreNames.contains('conversations')) {
        const cs = db.createObjectStore('conversations', { keyPath: 'id' });
        cs.createIndex('workspace_id', 'workspace_id');
        cs.createIndex('last_message_at', 'last_message_at');
      }
      // messages: keyed by id, indexed by conversation
      if (!db.objectStoreNames.contains('messages')) {
        const ms = db.createObjectStore('messages', { keyPath: 'id' });
        ms.createIndex('conversation_id', 'conversation_id');
        ms.createIndex('created_at', 'created_at');
      }
      // outbox: queued unsent messages
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'localId', autoIncrement: true });
      }
    },
  });
  return _db;
}

// ── Conversations ──────────────────────────────────────────────────────────

export async function cacheConversations(convs) {
  const d = await db();
  const tx = d.transaction('conversations', 'readwrite');
  await Promise.all(convs.map(c => tx.store.put(c)));
  await tx.done;
}

export async function getCachedConversations(workspaceId) {
  const d = await db();
  const all = await d.getAllFromIndex('conversations', 'workspace_id', workspaceId);
  return all.sort((a, b) =>
    new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
  );
}

export async function upsertCachedConversation(conv) {
  const d = await db();
  await d.put('conversations', conv);
}

// Purge a deleted conversation (and its cached messages) from the offline
// cache. Without this, the cache-first render in loadConversations() shows
// DELETED chats again for a few seconds ("flash back") until the fresh
// network fetch lands — exactly what users saw after deleting all chats.
export async function deleteCachedConversation(id) {
  if (!id) return;
  const d = await db();
  await d.delete('conversations', id);
  // Best-effort purge of its cached messages via the conversation_id index
  try {
    const keys = await d.getAllKeysFromIndex('messages', 'conversation_id', id);
    const tx = d.transaction('messages', 'readwrite');
    for (const k of keys) await tx.store.delete(k);
    await tx.done;
  } catch { /* non-fatal */ }
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function cacheMessages(conversationId, msgs) {
  const d = await db();
  const tx = d.transaction('messages', 'readwrite');
  for (const m of msgs) await tx.store.put(m);
  await tx.done;

  // Prune to MSG_LIMIT to keep storage bounded
  await pruneMessages(conversationId);
}

export async function getCachedMessages(conversationId) {
  const d = await db();
  const all = await d.getAllFromIndex('messages', 'conversation_id', conversationId);
  return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export async function upsertCachedMessage(msg) {
  const d = await db();
  await d.put('messages', msg);
}

async function pruneMessages(conversationId) {
  const d = await db();
  const all = await d.getAllFromIndex('messages', 'conversation_id', conversationId);
  if (all.length <= MSG_LIMIT) return;
  // Delete oldest beyond limit
  const sorted = all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const toDelete = sorted.slice(0, sorted.length - MSG_LIMIT);
  const tx = d.transaction('messages', 'readwrite');
  for (const m of toDelete) await tx.store.delete(m.id);
  await tx.done;
}

// ── Outbox ─────────────────────────────────────────────────────────────────

export async function enqueueOutbox(item) {
  // item: { workspaceId, conversationId, body, senderName, senderId, replyTo,
  //          attachments, channel, createdAt }
  const d = await db();
  await d.add('outbox', { ...item, createdAt: item.createdAt || new Date().toISOString() });
}

export async function getOutbox() {
  const d = await db();
  return d.getAll('outbox');
}

export async function deleteOutboxItem(localId) {
  const d = await db();
  await d.delete('outbox', localId);
}

export async function clearOutbox() {
  const d = await db();
  await d.clear('outbox');
}
