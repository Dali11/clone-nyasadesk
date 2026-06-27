export default function Avatar({ name = '', size = 'md', color = null, src = null, status = null }) {
  const sizes = { xs: 'w-6 h-6 text-[9px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-16 h-16 text-xl' };
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const colors = ['bg-green-500','bg-blue-500','bg-purple-500','bg-orange-500','bg-pink-500','bg-teal-500','bg-indigo-500','bg-red-500'];
  const bg = color || colors[(name.charCodeAt(0) || 0) % colors.length];
  const statusColors = { online: 'bg-green-400', away: 'bg-yellow-400', offline: 'bg-gray-400' };

  return (
    <div className="relative inline-flex shrink-0">
      {src ? (
        <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover`} />
      ) : (
        <div className={`${sizes[size]} ${bg} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}>
          {initials}
        </div>
      )}
      {status && (
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#111B21] ${statusColors[status] || 'bg-gray-400'}`} />
      )}
    </div>
  );
}