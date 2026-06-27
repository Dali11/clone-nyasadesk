import { X } from 'lucide-react';

const tagColors = [
  'bg-purple-100 text-purple-700',
  'bg-indigo-100 text-indigo-700',
  'bg-cyan-100 text-cyan-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

function tagColorIndex(tag) {
  let hash = 0;
  for (let c of tag) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffff;
  return hash % tagColors.length;
}

export default function TagChip({ tag, onRemove }) {
  const colorClass = tagColors[tagColorIndex(tag)];
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {tag}
      {onRemove && (
        <button onClick={() => onRemove(tag)} className="ml-0.5 hover:opacity-70 transition-opacity">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}