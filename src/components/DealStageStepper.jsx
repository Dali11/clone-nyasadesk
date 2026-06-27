import { Check } from 'lucide-react';

const STAGES = ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost'];

const stageColors = {
  'Closed Won': 'bg-emerald-500 border-emerald-500 text-white',
  'Closed Lost': 'bg-red-400 border-red-400 text-white',
};

export default function DealStageStepper({ currentStage, onChange, compact = false }) {
  const currentIndex = STAGES.indexOf(currentStage);
  const isLost = currentStage === 'Closed Lost';

  const activeStages = STAGES.filter(s => s !== 'Closed Lost');

  return (
    <div className="w-full">
      {/* Main pipeline stages */}
      <div className="flex items-center gap-0">
        {activeStages.map((stage, i) => {
          const isActive = stage === currentStage;
          const isPast = !isLost && currentIndex > activeStages.indexOf(stage);
          const isClosedWon = stage === 'Closed Won';

          return (
            <button
              key={stage}
              onClick={() => onChange && onChange(stage)}
              title={stage}
              className={`flex-1 relative flex items-center justify-center py-1.5 text-[10px] font-semibold
                transition-all duration-200 first:rounded-l-full last:rounded-r-full
                ${compact ? 'text-[9px]' : ''}
                ${isActive
                  ? isClosedWon
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-[#5C6CF7] text-white shadow-sm'
                  : isPast
                    ? 'bg-[#5C6CF7]/20 text-[#5C6CF7]'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }
              `}
            >
              {isPast ? (
                <Check className="w-3 h-3" />
              ) : (
                <span className="truncate px-1">{compact ? stage.split(' ')[0] : stage}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Closed Lost option */}
      <button
        onClick={() => onChange && onChange('Closed Lost')}
        className={`mt-1.5 w-full py-1 text-[10px] font-semibold rounded-full transition-all duration-200
          ${isLost ? 'bg-red-400 text-white' : 'bg-red-50 text-red-400 hover:bg-red-100'}
        `}
      >
        Closed Lost
      </button>
    </div>
  );
}