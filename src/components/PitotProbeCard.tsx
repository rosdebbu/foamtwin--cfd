import { Crosshair, X } from 'lucide-react';
import type { ProbePinData } from '../physics/types';

interface PitotProbeCardProps {
  probePin: ProbePinData | null;
  probeMode: boolean;
  onClear: () => void;
}

export function PitotProbeCard({ probePin, probeMode, onClear }: PitotProbeCardProps) {
  if (!probePin?.active && !probeMode) return null;

  return (
    <aside
      aria-label="3D Pitot Field Probe"
      className="pointer-events-auto w-[min(236px,calc(100vw-68px))] sm:w-[238px] bg-[#17191e]/95 border border-[#d99b42]/45 rounded-md text-[#f1efe9] shadow-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 bg-[#121316] border-b border-white/[0.08]">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold font-display text-[#f3c478]">
          <Crosshair className="w-3.5 h-3.5 text-[#d99b42]" />
          <span>Pitot Field Probe</span>
        </div>
        {probePin?.active && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear field probe pin"
            className="p-0.5 rounded text-[#9a9891] hover:text-[#f1efe9] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {probePin?.active ? (
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-[#121316] border border-white/[0.06] rounded-sm px-2 py-1.5">
              <div className="text-[10px] text-[#8e8b84]">|U|</div>
              <div className="font-mono-tabular text-xs font-medium text-[#f3c478]">
                {probePin.speedMs.toFixed(2)}
                <span className="text-[10px] text-[#8e8b84] ml-0.5">m/s</span>
              </div>
            </div>
            <div className="bg-[#121316] border border-white/[0.06] rounded-sm px-2 py-1.5">
              <div className="text-[10px] text-[#8e8b84]">p</div>
              <div className="font-mono-tabular text-xs font-medium text-[#f1efe9]">
                {probePin.pressurePa.toFixed(1)}
                <span className="text-[10px] text-[#8e8b84] ml-0.5">Pa</span>
              </div>
            </div>
            <div className="bg-[#121316] border border-white/[0.06] rounded-sm px-2 py-1.5">
              <div className="text-[10px] text-[#8e8b84]">T</div>
              <div className="font-mono-tabular text-xs font-medium text-[#f1efe9]">
                {probePin.tempC.toFixed(1)}
                <span className="text-[10px] text-[#8e8b84] ml-0.5">°C</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#9a9891] pt-0.5">
            <span>Coordinates</span>
            <span className="font-mono-tabular text-[#d6d3cb]">
              ({Math.round(probePin.x * 1000) || 0}, {Math.round(probePin.y * 1000) || 0},{' '}
              {Math.round(probePin.z * 1000) || 0}) mm
            </span>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2.5 text-[11px] text-[#b5b2aa] leading-relaxed">
          Click anywhere on the CFD cut-plane slice to pin a virtual Pitot probe.
        </div>
      )}
    </aside>
  );
}
