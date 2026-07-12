// src/components/GodModeBanner.jsx
// Rendered inside AdminLayout (and optionally the main app layout) when a
// platform admin has entered God Mode — viewing the app AS a workspace owner.
// God Mode is entirely client-side (sessionStorage) — no real session swap.
// The admin remains authenticated as themselves; NyasaAuth just loads the
// target workspace's profile instead of their own.
import { ShieldAlert, X } from 'lucide-react';
import { exitGodMode, getGodModeTarget } from '@/lib/godMode';
import { useNavigate } from 'react-router-dom';

export default function GodModeBanner() {
  const target = getGodModeTarget();
  const navigate = useNavigate();
  if (!target) return null;

  const handleExit = () => {
    exitGodMode();
    navigate('/admin/workspaces');
    window.location.reload(); // force NyasaAuth to re-initialize with real profile
  };

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-3 px-4 py-2 bg-amber-500 text-black text-xs font-semibold">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>God Mode — viewing as <strong>{target.workspaceName || target.workspaceId}</strong></span>
      </div>
      <button
        onClick={handleExit}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-black/15 hover:bg-black/25 transition-colors"
      >
        <X className="w-3.5 h-3.5" /> Exit
      </button>
    </div>
  );
}
