import { Clapperboard, Compass, Crosshair, Mountain, Pin, RotateCw, Sun } from 'lucide-react';
import type { CameraPreset, LightingPreset } from '../physics/types';

interface StudioDockProps {
  activeCamera: CameraPreset | null;
  explodedView: number;
  turntable: boolean;
  autoTour: boolean;
  lightingPreset: LightingPreset;
  inspecting: boolean;
  benchBump: boolean;
  probeMode: boolean;
  onFlyCamera: (preset: CameraPreset) => void;
  onChangeExploded: (val: number) => void;
  onToggleTurntable: () => void;
  onToggleAutoTour: () => void;
  onChangeLighting: (rig: LightingPreset) => void;
  onToggleInspectTour: () => void;
  onToggleBump: () => void;
  onToggleProbeMode: () => void;
}

const DOCK_CAMERAS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'iso', label: 'Iso' },
  { id: 'side', label: 'Side' },
  { id: 'wide', label: 'Lab' },
  { id: 'tier2', label: 'Tier 2' },
  { id: 'hcsr04', label: 'HC-SR04' },
  { id: 'l298n', label: 'L298N' },
];

const LIGHTING_OPTIONS: Array<{ id: LightingPreset; label: string }> = [
  { id: 'bench', label: 'Bench' },
  { id: 'tunnel', label: 'Tunnel' },
  { id: 'macro', label: 'Macro' },
];

export function StudioDock({
  activeCamera,
  explodedView,
  turntable,
  autoTour,
  lightingPreset,
  inspecting,
  benchBump,
  probeMode,
  onFlyCamera,
  onChangeExploded,
  onToggleTurntable,
  onToggleAutoTour,
  onChangeLighting,
  onToggleInspectTour,
  onToggleBump,
  onToggleProbeMode,
}: StudioDockProps) {
  return (
    <nav
      aria-label="Viewport camera, explode, lighting, and inspection controls"
      className="pointer-events-auto max-w-[calc(100vw-24px)] flex items-center gap-2 px-2.5 py-1.5 bg-[#17191e]/95 border border-white/[0.10] rounded-md shadow-xl overflow-x-auto sci-scroll"
    >
      {/* Camera Viewpoint Switcher */}
      <div className="flex items-center gap-1 shrink-0">
        <Compass className="w-3.5 h-3.5 text-[#9a9891] mr-0.5 hidden sm:block shrink-0" />
        {DOCK_CAMERAS.map((cam) => {
          const active = activeCamera === cam.id;
          return (
            <button
              key={cam.id}
              type="button"
              onClick={() => onFlyCamera(cam.id)}
              aria-pressed={active}
              className={`px-2 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#d99b42]/18 text-[#f3c478] border border-[#d99b42]/45'
                  : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              {cam.label}
            </button>
          );
        })}
      </div>

      <span className="w-px h-5 bg-white/[0.09] shrink-0 hidden lg:block" aria-hidden="true" />

      {/* Inline Exploded Assembly Slider */}
      <div className="hidden lg:flex items-center gap-2 px-1 shrink-0">
        <label
          htmlFor="dock-explode-slider"
          className="text-[11px] text-[#a3a098] whitespace-nowrap"
        >
          Explode
        </label>
        <input
          id="dock-explode-slider"
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={explodedView}
          onChange={(e) => onChangeExploded(parseFloat(e.target.value))}
          className="w-16 sci-range"
        />
        <span className="font-mono-tabular text-[11px] text-[#d99b42] w-8 text-right">
          {Math.round(explodedView * 100)}%
        </span>
      </div>

      <span className="w-px h-5 bg-white/[0.09] shrink-0 hidden sm:block" aria-hidden="true" />

      {/* Studio Lighting Rig Switcher */}
      <div className="hidden sm:flex items-center gap-0.5 bg-[#111216] border border-white/[0.07] rounded-sm p-0.5 shrink-0">
        <Sun className="w-3 h-3 text-[#9a9891] mx-1.5 shrink-0" />
        {LIGHTING_OPTIONS.map((rig) => {
          const active = lightingPreset === rig.id;
          return (
            <button
              key={rig.id}
              type="button"
              onClick={() => onChangeLighting(rig.id)}
              aria-pressed={active}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#252831] text-[#f3c478]'
                  : 'text-[#8e8b84] hover:text-[#f1efe9]'
              }`}
            >
              {rig.label}
            </button>
          );
        })}
      </div>

      <span className="w-px h-5 bg-white/[0.09] shrink-0" aria-hidden="true" />

      {/* Interactive Physics & Inspection Tools */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleBump}
          aria-pressed={benchBump}
          title="Toggle Machined Optical Bench Calibration Bump"
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            benchBump
              ? 'bg-[#d99b42]/18 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <Mountain className="w-3 h-3" />
          <span>Bump</span>
        </button>

        <button
          type="button"
          onClick={onToggleProbeMode}
          aria-pressed={probeMode}
          title="Pin 3D Pitot Field Probe on CFD Slice (or Alt+Click)"
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            probeMode
              ? 'bg-[#d99b42]/18 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <Pin className="w-3 h-3" />
          <span>Probe</span>
        </button>

        <button
          type="button"
          onClick={onToggleTurntable}
          aria-pressed={turntable}
          title="Toggle 360° Turntable Orbit"
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            turntable
              ? 'bg-[#d99b42]/18 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <RotateCw className="w-3 h-3" />
          <span>Orbit</span>
        </button>

        <button
          type="button"
          onClick={onToggleAutoTour}
          aria-pressed={autoTour}
          aria-label="Toggle cinematic camera Auto-Tour"
          title="Cinematic Auto-Tour across camera presets (T)"
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            autoTour
              ? 'bg-[#d99b42]/18 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <Clapperboard className="w-3 h-3" />
          <span>Auto-Tour</span>
        </button>

        <button
          type="button"
          onClick={onToggleInspectTour}
          aria-pressed={inspecting}
          title="Inspect Robot Subsystems (or click directly on the 3D robot)"
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            inspecting
              ? 'bg-[#d99b42]/18 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <Crosshair className="w-3 h-3" />
          <span>Inspect</span>
        </button>
      </div>
    </nav>
  );
}
