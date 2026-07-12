// src/lib/godMode.js
// God Mode: platform admin impersonation of a workspace, client-side only.
// The admin stays authenticated as themselves — NyasaAuth reads this key and
// loads the target workspace's profile row instead of the admin's own.
// SessionStorage: auto-clears when the tab/browser is closed.

const KEY = 'nyasa_god_mode';

export function enterGodMode({ workspaceId, workspaceName }) {
  sessionStorage.setItem(KEY, JSON.stringify({ workspaceId, workspaceName }));
}

export function exitGodMode() {
  sessionStorage.removeItem(KEY);
}

export function getGodModeTarget() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isInGodMode() {
  return !!getGodModeTarget();
}
