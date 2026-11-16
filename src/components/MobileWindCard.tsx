import { Wind } from 'lucide-react';

interface MobileWindCardProps {
  windSpeed: number;
  onChangeWindSpeed: (speed: number) => void;
}

export function MobileWindCard({
  windSpeed,
  onChangeWindSpeed,
}: MobileWindCardProps) {
  return (
    <aside
      aria-label="Mobile Wind Speed Control"
      className="pointer-events-auto md:hidden flex flex-col gap-1.5 w-[156px] bg-[#17191e]/95 border border-white/[0.10] rounded-md px-2.5 py-2 text-[#f1efe9] shadow-xl select-none"
    >
      <div className="flex items-center justify-between gap-1.5 text-[11px]">
        <span className="flex items-center gap-1 text-[#9a9891] font-medium">
          <Wind className="w-3 h-3 text-[#d99b42]" />
          <span>Wind U∞</span>
        </span>
        <span className="font-mono-tabular text-xs font-medium text-[#f3c478]">
          {windSpeed.toFixed(1)}
          <span className="text-[10px] text-[#8e8b84] ml-0.5">m/s</span>
        </span>
      </div>

      <input
        aria-label="Inlet wind velocity"
        type="range"
        min={0.5}
        max={14.0}
        step={0.5}
        value={windSpeed}
        onChange={(e) => onChangeWindSpeed(parseFloat(e.target.value))}
        className="w-full sci-range"
      />
    </aside>
  );
}
