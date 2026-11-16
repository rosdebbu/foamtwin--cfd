import { Battery, ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import type { ControllerMode, TelemetrySample } from '../physics/types';

interface BalanceHorizonWidgetProps {
  telemetry: TelemetrySample;
  controllerMode: ControllerMode;
  targetSpeed: number;
  onDriveStep: (speed: number) => void;
}

export function BalanceHorizonWidget({
  telemetry,
  controllerMode,
  targetSpeed,
  onDriveStep,
}: BalanceHorizonWidgetProps) {
  const pitchClamped = Math.max(-28, Math.min(28, telemetry.pitchDeg));
  const voltPct = Math.max(0, Math.min(100, ((telemetry.batteryVoltage - 9.6) / (11.8 - 9.6)) * 100));
  const lowVolt = telemetry.batteryVoltage < 10.6;

  return (
    <aside
      aria-label="IMU Pitch Horizon and Drive Control"
      className="pointer-events-auto flex items-center gap-2 sm:gap-3 bg-[#17191e]/95 border border-white/[0.10] rounded-md px-2 py-1.5 sm:px-3 sm:py-2 text-[#f1efe9] shadow-xl select-none"
    >
      {/* Crisp Vector Artificial Pitch Horizon Dial */}
      <div className="relative w-9 h-9 sm:w-12 sm:h-12 rounded-sm bg-[#101216] border border-white/[0.10] overflow-hidden shrink-0">
        <svg viewBox="0 0 48 48" className="w-full h-full" aria-hidden="true">
          <g transform={`translate(24, 24) rotate(${pitchClamped.toFixed(2)})`}>
            <rect x="-36" y="-36" width="72" height="36" fill="#1c222d" />
            <rect x="-36" y="0" width="72" height="36" fill="#231c15" />
            <line x1="-30" y1="0" x2="30" y2="0" stroke="#d99b42" strokeWidth="1.25" />
            <line x1="-10" y1="-8" x2="10" y2="-8" stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" />
            <line x1="-10" y1="8" x2="10" y2="8" stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" />
          </g>
          {/* Fixed center chassis reticle */}
          <path
            d="M 10 24 L 18 24 L 21 27 M 38 24 L 30 24 L 27 27"
            fill="none"
            stroke="#f1efe9"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <circle cx="24" cy="24" r="1.4" fill="#d99b42" />
        </svg>
      </div>

      {/* Pitch, Controller Mode & 3S Li-Ion Pack Voltage */}
      <div className="flex flex-col gap-0.5 sm:gap-1 min-w-[92px] sm:min-w-[106px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[#8e8b84]">
            IMU θ
          </span>
          <span className="font-mono-tabular text-xs font-medium text-[#f3c478]">
            {telemetry.pitchDeg >= 0 ? '+' : ''}
            {telemetry.pitchDeg.toFixed(1)}°
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="px-1.5 py-0.5 rounded-xs bg-[#121316] border border-white/[0.08] font-mono-tabular text-[#d6d3cb] uppercase">
            {controllerMode}
          </span>
          <span
            className={`flex items-center gap-1 font-mono-tabular ${
              lowVolt ? 'text-amber-300' : 'text-[#c9c6be]'
            }`}
            title={`3S Li-Ion Pack (${voltPct.toFixed(0)}% headroom)`}
          >
            <Battery className="w-3 h-3 text-[#d99b42]" />
            {telemetry.batteryVoltage.toFixed(1)}V
          </span>
        </div>

        {/* Quick Drive Controls (mirrors W / S keys) */}
        <div className="flex items-center gap-1 pt-0.5">
          <button
            type="button"
            onClick={() => onDriveStep(-0.22)}
            aria-label="Drive backward (S)"
            title="Drive Reverse (S / Down)"
            aria-pressed={targetSpeed < -0.05}
            className={`flex-1 flex items-center justify-center py-0.5 rounded-xs border text-[10px] transition-colors cursor-pointer ${
              targetSpeed < -0.05
                ? 'bg-[#d99b42]/20 border-[#d99b42]/50 text-[#f3c478]'
                : 'bg-[#121316] border-white/[0.08] text-[#a3a098] hover:text-[#f1efe9]'
            }`}
          >
            <ArrowDown className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onDriveStep(0)}
            aria-label="Hold station at zero speed"
            title="Station Hold (0 m/s)"
            aria-pressed={Math.abs(targetSpeed) <= 0.02}
            className={`px-1.5 py-0.5 rounded-xs border font-mono-tabular text-[10px] transition-colors cursor-pointer ${
              Math.abs(targetSpeed) <= 0.02
                ? 'bg-[#22252d] border-white/[0.16] text-[#f1efe9]'
                : 'bg-[#121316] border-white/[0.08] text-[#8e8b84] hover:text-[#f1efe9]'
            }`}
          >
            <RotateCcw className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => onDriveStep(0.22)}
            aria-label="Drive forward (W)"
            title="Drive Forward (W / Up)"
            aria-pressed={targetSpeed > 0.05}
            className={`flex-1 flex items-center justify-center py-0.5 rounded-xs border text-[10px] transition-colors cursor-pointer ${
              targetSpeed > 0.05
                ? 'bg-[#d99b42]/20 border-[#d99b42]/50 text-[#f3c478]'
                : 'bg-[#121316] border-white/[0.08] text-[#a3a098] hover:text-[#f1efe9]'
            }`}
          >
            <ArrowUp className="w-3 h-3" />
          </button>
        </div>
      </div>
    </aside>
  );
}
