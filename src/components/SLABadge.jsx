import { Clock } from 'lucide-react';

export default function SLABadge({ slaBreachAt }) {
  if (!slaBreachAt) return null;
  const diffMins = Math.floor((new Date(slaBreachAt) - new Date()) / 60000);
  if (diffMins < 0) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-500 bg-red-900/30 px-1.5 py-0.5 rounded-full"><Clock className="w-2.5 h-2.5" />BREACHED</span>;
  if (diffMins < 60) return <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-orange-400 bg-orange-900/20 px-1.5 py-0.5 rounded-full"><Clock className="w-2.5 h-2.5" />{diffMins}m</span>;
  const hrs = Math.floor(diffMins / 60);
  if (hrs < 8) return <span className="inline-flex items-center gap-0.5 text-[9px] text-gray-600 px-1 py-0.5 rounded-full"><Clock className="w-2.5 h-2.5" />{hrs}h</span>;
  return null;
}