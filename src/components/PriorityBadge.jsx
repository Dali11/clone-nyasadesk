const priorityConfig = {
  low: { label: 'Low', cls: 'bg-gray-100 text-gray-500' },
  normal: { label: 'Normal', cls: 'bg-blue-50 text-blue-500' },
  high: { label: 'High', cls: 'bg-amber-100 text-amber-600' },
  urgent: { label: 'Urgent', cls: 'bg-red-100 text-[#E11D48]' },
};

export default function PriorityBadge({ priority }) {
  const cfg = priorityConfig[priority] || priorityConfig.normal;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}