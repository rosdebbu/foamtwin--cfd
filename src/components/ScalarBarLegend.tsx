import { getColormapCssGradient } from '../physics/colormaps';
import { getFieldRange, type SimulationParams } from '../physics/types';

interface ScalarBarLegendProps {
  params: SimulationParams;
  visible: boolean;
}

export function ScalarBarLegend({ params, visible }: ScalarBarLegendProps) {
  if (!visible) return null;

  const activeField = params.field === 'physical' ? 'velocity' : params.field;
  const range = getFieldRange(activeField, params);
  const gradient = getColormapCssGradient(params.colormap, true);

  const ticks = [1, 0.75, 0.5, 0.25, 0].map((frac) => {
    const val = range.min + (range.max - range.min) * frac;
    return Math.abs(val) >= 100
      ? val.toFixed(0)
      : Math.abs(val) >= 10
        ? val.toFixed(1)
        : val.toFixed(2);
  });

  return (
    <aside
      aria-label="Field color scale legend"
      className="pointer-events-none select-none bg-[#17191e]/95 border border-white/[0.10] rounded-md px-2 py-1.5 sm:px-3 sm:py-2.5 text-[#f1efe9] shadow-lg"
    >
      <div className="text-[10px] sm:text-[11px] font-medium text-[#e7e4dc] mb-1.5 sm:mb-2 whitespace-nowrap">
        <span>{range.symbol}</span>
        <span className="text-[#9a9891] ml-1 sm:ml-1.5 font-mono-tabular">[{range.unit}]</span>
      </div>

      <div className="flex items-stretch gap-1.5 sm:gap-2.5">
        <div
          className="w-2.5 h-20 sm:w-3 sm:h-32 rounded-xs border border-white/[0.14] shrink-0"
          style={{ background: gradient }}
        />
        <div className="flex flex-col justify-between h-20 sm:h-32 text-[10px] sm:text-[11px] font-mono-tabular text-[#d6d3cb] leading-none">
          {ticks.map((tick, idx) => (
            <div key={idx} className="flex items-center gap-1 sm:gap-1.5">
              <span className="w-1 sm:w-1.5 h-px bg-white/30 inline-block" aria-hidden="true" />
              <span>{tick}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden sm:block mt-2 pt-1.5 border-t border-white/[0.08] text-[10px] text-[#9a9891] whitespace-nowrap">
        {range.label}
      </div>
    </aside>
  );
}
