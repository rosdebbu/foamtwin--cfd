import { useState } from 'react';
import {
  ChevronLeft,
  Clapperboard,
  Compass,
  Cpu,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  Mountain,
  PanelBottom,
  PanelLeft,
  Pin,
  RotateCw,
  SlidersHorizontal,
  Wind,
} from 'lucide-react';
import type {
  CameraPreset,
  ColormapName,
  FieldVariable,
  LightingPreset,
  PipelineVisibility,
  SimulationParams,
} from '../physics/types';

export type DockPosition = 'sidebar' | 'dock';
type DrawerTab = 'stage' | 'layers' | 'cfd' | 'balance';

interface PipelineDrawerProps {
  open: boolean;
  onToggleOpen: () => void;
  params: SimulationParams;
  onUpdateParams: (patch: Partial<SimulationParams>) => void;
  visibility: PipelineVisibility;
  onToggleLayer: (key: keyof PipelineVisibility) => void;
  onApplyGust: () => void;
  activeCamera: CameraPreset | null;
  lightingPreset: LightingPreset;
  turntable: boolean;
  autoTour: boolean;
  inspecting: boolean;
  probeMode: boolean;
  dockPosition: DockPosition;
  onFlyCamera: (preset: CameraPreset) => void;
  onChangeLighting: (rig: LightingPreset) => void;
  onToggleTurntable: () => void;
  onToggleAutoTour: () => void;
  onToggleInspectTour: () => void;
  onToggleProbeMode: () => void;
  onChangeDockPosition: (pos: DockPosition) => void;
}

const LAYER_LABELS: Array<{ key: keyof PipelineVisibility; label: string }> = [
  { key: 'robotMesh', label: '3-Tier Robot Twin' },
  { key: 'cfdSlice', label: 'Y-Z CFD Cut-Plane' },
  { key: 'xzWakeSlice', label: 'X-Z Wake Cut-Plane' },
  { key: 'streamlines', label: '3D Ribbons & Tracers' },
  { key: 'vectorGlyphs', label: 'Velocity Vector Glyphs' },
  { key: 'openfoamMesh', label: 'Domain Grid Edges' },
  { key: 'thermalOverlay', label: 'L298N Thermal Plume' },
  { key: 'acousticCone', label: 'HC-SR04 Ultrasonic Echo' },
  { key: 'forceVectors', label: 'Free-Body Force Vectors' },
  { key: 'signalPulses', label: 'Wire Signal Pulses' },
];

const SIDEBAR_CAMERAS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'iso', label: 'Iso' },
  { id: 'side', label: 'Side' },
  { id: 'front', label: 'Front' },
  { id: 'top', label: 'Top' },
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

export function PipelineDrawer({
  open,
  onToggleOpen,
  params,
  onUpdateParams,
  visibility,
  onToggleLayer,
  onApplyGust,
  activeCamera,
  lightingPreset,
  turntable,
  autoTour,
  inspecting,
  probeMode,
  dockPosition,
  onFlyCamera,
  onChangeLighting,
  onToggleTurntable,
  onToggleAutoTour,
  onToggleInspectTour,
  onToggleProbeMode,
  onChangeDockPosition,
}: PipelineDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>('stage');

  if (!open) {
    return (
      <nav
        aria-label="Compact Studio Side Rail"
        className="pointer-events-auto max-h-full overflow-y-auto sci-scroll flex flex-col items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5 bg-[#17191e]/95 border border-white/[0.10] rounded-md shadow-xl"
      >
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label="Open solver and layers panel"
          title="Expand Studio Sidebar (Stage, Layers, Solver)"
          className="p-2 rounded-sm text-[#e7e4dc] hover:text-[#f3c478] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#d99b42]" />
        </button>

        <button
          type="button"
          onClick={() => {
            setTab('stage');
            onToggleOpen();
          }}
          aria-label="Open camera and stage sidebar"
          title="Camera Presets & Stage Lighting"
          className="p-2 rounded-sm text-[#b5b2aa] hover:text-[#f3c478] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <Compass className="w-4 h-4" />
        </button>

        <span className="w-5 h-px bg-white/[0.09] my-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={onToggleAutoTour}
          aria-pressed={autoTour}
          aria-label="Toggle cinematic camera Auto-Tour"
          title="Cinematic Auto-Tour (T)"
          className={`p-2 rounded-sm transition-colors cursor-pointer ${
            autoTour
              ? 'bg-[#d99b42]/20 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <Clapperboard className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onUpdateParams({ benchBump: !params.benchBump })}
          aria-pressed={params.benchBump}
          aria-label="Toggle optical bench calibration bump"
          title="Bench Calibration Bump"
          className={`p-2 rounded-sm transition-colors cursor-pointer ${
            params.benchBump
              ? 'bg-[#d99b42]/20 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <Mountain className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleProbeMode}
          aria-pressed={probeMode}
          aria-label="Toggle Pitot field probe pin mode"
          title="Pitot Field Probe (Alt+Click)"
          className={`p-2 rounded-sm transition-colors cursor-pointer ${
            probeMode
              ? 'bg-[#d99b42]/20 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <Pin className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleTurntable}
          aria-pressed={turntable}
          aria-label="Toggle 360 degree turntable orbit"
          title="360° Turntable Orbit"
          className={`p-2 rounded-sm transition-colors cursor-pointer ${
            turntable
              ? 'bg-[#d99b42]/20 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <RotateCw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleInspectTour}
          aria-pressed={inspecting}
          aria-label="Inspect robot hardware subsystems"
          title="Inspect Hardware Subsystems"
          className={`p-2 rounded-sm transition-colors cursor-pointer ${
            inspecting
              ? 'bg-[#d99b42]/20 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#b5b2aa] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <Crosshair className="w-4 h-4" />
        </button>

        <span className="w-5 h-px bg-white/[0.09] my-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={() =>
            onChangeDockPosition(dockPosition === 'sidebar' ? 'dock' : 'sidebar')
          }
          aria-pressed={dockPosition === 'dock'}
          aria-label="Toggle bottom studio dock bar"
          title={
            dockPosition === 'sidebar'
              ? 'Show Bottom Camera Dock'
              : 'Hide Bottom Dock (Sidebar Only)'
          }
          className={`p-2 rounded-sm transition-colors cursor-pointer ${
            dockPosition === 'dock'
              ? 'bg-[#d99b42]/20 text-[#f3c478] border border-[#d99b42]/45'
              : 'text-[#8e8b84] hover:text-[#f1efe9] hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          <PanelBottom className="w-4 h-4" />
        </button>
      </nav>
    );
  }

  return (
    <aside
      aria-label="Solver parameters and visualization layers"
      className="pointer-events-auto w-[min(296px,calc(100vw-20px))] sm:w-[300px] max-h-full flex flex-col bg-[#17191e]/95 border border-white/[0.10] rounded-md text-[#f1efe9] overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold font-display tracking-tight text-[#f1efe9]">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#d99b42]" />
          <span>Studio Sidebar</span>
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label="Collapse solver panel"
          className="p-1 rounded text-[#9a9891] hover:text-[#f1efe9] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* 4-Tab Segmented Navigation */}
      <div className="grid grid-cols-4 gap-1 p-1.5 bg-[#121316] border-b border-white/[0.08] shrink-0">
        <button
          type="button"
          onClick={() => setTab('stage')}
          aria-pressed={tab === 'stage'}
          className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
            tab === 'stage'
              ? 'bg-[#22252d] text-[#f3c478]'
              : 'text-[#8e8b84] hover:text-[#e7e4dc]'
          }`}
        >
          <Compass className="w-3 h-3" />
          <span>Stage</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('layers')}
          aria-pressed={tab === 'layers'}
          className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
            tab === 'layers'
              ? 'bg-[#22252d] text-[#f3c478]'
              : 'text-[#8e8b84] hover:text-[#e7e4dc]'
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>Layers</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('cfd')}
          aria-pressed={tab === 'cfd'}
          className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
            tab === 'cfd'
              ? 'bg-[#22252d] text-[#f3c478]'
              : 'text-[#8e8b84] hover:text-[#e7e4dc]'
          }`}
        >
          <Wind className="w-3 h-3" />
          <span>Flow</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('balance')}
          aria-pressed={tab === 'balance'}
          className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-sm transition-colors cursor-pointer whitespace-nowrap ${
            tab === 'balance'
              ? 'bg-[#22252d] text-[#f3c478]'
              : 'text-[#8e8b84] hover:text-[#e7e4dc]'
          }`}
        >
          <Cpu className="w-3 h-3" />
          <span>Balance</span>
        </button>
      </div>

      <div className="overflow-y-auto sci-scroll px-3.5 py-3 space-y-3.5">
        {tab === 'stage' && (
          <div className="space-y-3.5">
            {/* Cinematic Auto-Tour Primary Showcase Card */}
            <div className="space-y-1.5">
              <span className="block text-[10px] text-[#8e8b84]">
                Cinematic Camera Choreography
              </span>
              <button
                type="button"
                onClick={onToggleAutoTour}
                aria-pressed={autoTour}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-sm border text-xs font-medium transition-colors cursor-pointer ${
                  autoTour
                    ? 'bg-[#d99b42]/20 text-[#f3c478] border-[#d99b42]/50'
                    : 'bg-[#121316] text-[#e7e4dc] border-white/[0.10] hover:border-[#d99b42]/40 hover:text-[#f3c478]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Clapperboard className="w-3.5 h-3.5 text-[#d99b42]" />
                  <span>{autoTour ? 'Stop Auto-Tour' : 'Start Cinematic Auto-Tour'}</span>
                </span>
                <span className="font-mono-tabular text-[10px] text-[#8e8b84]">T</span>
              </button>
            </div>

            {/* Camera Viewpoint Presets */}
            <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
              <span className="block text-[10px] text-[#8e8b84]">Camera Angles</span>
              <div className="grid grid-cols-4 gap-1">
                {SIDEBAR_CAMERAS.map((cam) => {
                  const active = activeCamera === cam.id;
                  return (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() => onFlyCamera(cam.id)}
                      aria-pressed={active}
                      className={`py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#d99b42]/18 text-[#f3c478] border-[#d99b42]/45'
                          : 'bg-[#121316] text-[#b5b2aa] border-white/[0.06] hover:text-[#f1efe9] hover:border-white/[0.14]'
                      }`}
                    >
                      {cam.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive Stage Tools */}
            <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
              <span className="block text-[10px] text-[#8e8b84]">Stage &amp; Probes</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateParams({ benchBump: !params.benchBump })}
                  aria-pressed={params.benchBump}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer ${
                    params.benchBump
                      ? 'bg-[#d99b42]/18 text-[#f3c478] border-[#d99b42]/45'
                      : 'bg-[#121316] text-[#b5b2aa] border-white/[0.08] hover:text-[#f1efe9]'
                  }`}
                >
                  <Mountain className="w-3.5 h-3.5" />
                  <span>Bench Bump</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleProbeMode}
                  aria-pressed={probeMode}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer ${
                    probeMode
                      ? 'bg-[#d99b42]/18 text-[#f3c478] border-[#d99b42]/45'
                      : 'bg-[#121316] text-[#b5b2aa] border-white/[0.08] hover:text-[#f1efe9]'
                  }`}
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>Pitot Probe</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleTurntable}
                  aria-pressed={turntable}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer ${
                    turntable
                      ? 'bg-[#d99b42]/18 text-[#f3c478] border-[#d99b42]/45'
                      : 'bg-[#121316] text-[#b5b2aa] border-white/[0.08] hover:text-[#f1efe9]'
                  }`}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>360° Orbit</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleInspectTour}
                  aria-pressed={inspecting}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer ${
                    inspecting
                      ? 'bg-[#d99b42]/18 text-[#f3c478] border-[#d99b42]/45'
                      : 'bg-[#121316] text-[#b5b2aa] border-white/[0.08] hover:text-[#f1efe9]'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Inspect Parts</span>
                </button>
              </div>
            </div>

            {/* Studio Lighting Rig */}
            <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
              <span className="block text-[10px] text-[#8e8b84]">Studio Lighting Rig</span>
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#121316] border border-white/[0.08] rounded-sm">
                {LIGHTING_OPTIONS.map((rig) => {
                  const active = lightingPreset === rig.id;
                  return (
                    <button
                      key={rig.id}
                      type="button"
                      onClick={() => onChangeLighting(rig.id)}
                      aria-pressed={active}
                      className={`py-1 text-[11px] font-medium rounded-xs transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#22252d] text-[#f3c478]'
                          : 'text-[#8e8b84] hover:text-[#f1efe9]'
                      }`}
                    >
                      {rig.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.07]">
              <SliderRow
                id="stage-exploded-slider"
                label="Exploded Tier Separation"
                value={params.explodedView}
                min={0}
                max={1}
                step={0.02}
                unit="%"
                displayVal={Math.round(params.explodedView * 100).toString()}
                onChange={(v) => onUpdateParams({ explodedView: v })}
              />
            </div>

            {/* Dock Layout Switcher */}
            <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
              <span className="block text-[10px] text-[#8e8b84]">Camera Bar Layout</span>
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#121316] border border-white/[0.08] rounded-sm">
                <button
                  type="button"
                  onClick={() => onChangeDockPosition('sidebar')}
                  aria-pressed={dockPosition === 'sidebar'}
                  className={`flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium rounded-xs transition-colors cursor-pointer ${
                    dockPosition === 'sidebar'
                      ? 'bg-[#22252d] text-[#f3c478]'
                      : 'text-[#8e8b84] hover:text-[#e7e4dc]'
                  }`}
                >
                  <PanelLeft className="w-3 h-3" />
                  <span>Sidebar</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDockPosition('dock')}
                  aria-pressed={dockPosition === 'dock'}
                  className={`flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium rounded-xs transition-colors cursor-pointer ${
                    dockPosition === 'dock'
                      ? 'bg-[#22252d] text-[#f3c478]'
                      : 'text-[#8e8b84] hover:text-[#e7e4dc]'
                  }`}
                >
                  <PanelBottom className="w-3 h-3" />
                  <span>Bottom Dock</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'layers' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="drawer-field-select"
                  className="block text-[10px] text-[#8e8b84] mb-1"
                >
                  Scalar Field
                </label>
                <select
                  id="drawer-field-select"
                  value={params.field}
                  onChange={(e) =>
                    onUpdateParams({ field: e.target.value as FieldVariable })
                  }
                  className="w-full bg-[#121316] border border-white/[0.10] rounded-sm px-2 py-1 text-[11px] text-[#f1efe9] focus:outline-none focus:border-[#d99b42] cursor-pointer"
                >
                  <option value="physical">Physical PBR</option>
                  <option value="velocity">Velocity |U|</option>
                  <option value="pressure">Pressure p</option>
                  <option value="temperature">Temp T (°C)</option>
                  <option value="vorticity">Vorticity |ω|</option>
                  <option value="stress">Stress σ_vM</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="drawer-map-select"
                  className="block text-[10px] text-[#8e8b84] mb-1"
                >
                  Colormap
                </label>
                <select
                  id="drawer-map-select"
                  value={params.colormap}
                  onChange={(e) =>
                    onUpdateParams({ colormap: e.target.value as ColormapName })
                  }
                  className="w-full bg-[#121316] border border-white/[0.10] rounded-sm px-2 py-1 text-[11px] text-[#f1efe9] focus:outline-none focus:border-[#d99b42] cursor-pointer"
                >
                  <option value="coolwarm">Cool-Warm</option>
                  <option value="viridis">Viridis</option>
                  <option value="plasma">Plasma</option>
                  <option value="turbo">Turbo</option>
                </select>
              </div>
            </div>

            <div className="space-y-1 pt-2 border-t border-white/[0.07]">
              {LAYER_LABELS.map((item) => {
                const active = visibility[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onToggleLayer(item.key)}
                    aria-pressed={active}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#22252d] text-[#f1efe9] border border-[#d99b42]/35'
                        : 'bg-transparent text-[#8e8b84] border border-transparent hover:bg-white/[0.04] hover:text-[#e7e4dc]'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {active ? (
                      <Eye className="w-3.5 h-3.5 text-[#d99b42] shrink-0" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-[#64625c] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-white/[0.07] space-y-2.5">
              <SliderRow
                id="slice-offset-slider"
                label="Y-Z Slice Plane Offset X"
                value={params.sliceOffsetX}
                min={-0.12}
                max={0.12}
                step={0.005}
                unit="m"
                displayVal={params.sliceOffsetX.toFixed(3)}
                onChange={(v) => onUpdateParams({ sliceOffsetX: v })}
              />
            </div>
          </>
        )}

        {tab === 'cfd' && (
          <div className="space-y-3">
            <SliderRow
              id="wind-speed-slider"
              label="Inlet Velocity U∞"
              value={params.windSpeed}
              min={0.5}
              max={14.0}
              step={0.25}
              unit="m/s"
              displayVal={params.windSpeed.toFixed(2)}
              onChange={(v) => onUpdateParams({ windSpeed: v })}
            />
            <SliderRow
              id="viscosity-slider"
              label="Kinematic Viscosity ν"
              value={params.viscosity * 10000}
              min={0.1}
              max={8.0}
              step={0.1}
              unit="×10⁻⁴"
              displayVal={(params.viscosity * 10000).toFixed(1)}
              onChange={(v) => onUpdateParams({ viscosity: v / 10000 })}
            />
            <SliderRow
              id="ambient-temp-slider"
              label="Ambient Temp T∞"
              value={params.ambientTemp}
              min={15}
              max={45}
              step={1}
              unit="°C"
              displayVal={params.ambientTemp.toFixed(0)}
              onChange={(v) => onUpdateParams({ ambientTemp: v })}
            />
            <SliderRow
              id="obstacle-dist-slider"
              label="Acoustic Target Wall Z"
              value={params.obstacleDist}
              min={0.18}
              max={0.60}
              step={0.01}
              unit="m"
              displayVal={params.obstacleDist.toFixed(2)}
              onChange={(v) => onUpdateParams({ obstacleDist: v })}
            />
            <SliderRow
              id="timescale-slider"
              label="Solver Time Scale"
              value={params.timeScale}
              min={0.25}
              max={2.0}
              step={0.05}
              unit="×"
              displayVal={params.timeScale.toFixed(2)}
              onChange={(v) => onUpdateParams({ timeScale: v })}
            />
          </div>
        )}

        {tab === 'balance' && (
          <div className="space-y-3">
            {/* Controller Mode: Manual PID vs Optimal LQR */}
            <div className="space-y-1.5 pb-2 border-b border-white/[0.07]">
              <span className="block text-[10px] text-[#8e8b84]">Control Law</span>
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#121316] border border-white/[0.08] rounded-sm">
                <button
                  type="button"
                  onClick={() => onUpdateParams({ controllerMode: 'pid' })}
                  aria-pressed={params.controllerMode === 'pid'}
                  className={`py-1 text-[11px] font-medium rounded-xs transition-colors cursor-pointer ${
                    params.controllerMode === 'pid'
                      ? 'bg-[#22252d] text-[#f3c478]'
                      : 'text-[#8e8b84] hover:text-[#e7e4dc]'
                  }`}
                >
                  Manual PID
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateParams({ controllerMode: 'lqr' })}
                  aria-pressed={params.controllerMode === 'lqr'}
                  className={`py-1 text-[11px] font-medium rounded-xs transition-colors cursor-pointer ${
                    params.controllerMode === 'lqr'
                      ? 'bg-[#22252d] text-[#f3c478]'
                      : 'text-[#8e8b84] hover:text-[#e7e4dc]'
                  }`}
                >
                  LQR Optimal
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.07]">
              <button
                type="button"
                onClick={() => onUpdateParams({ benchBump: !params.benchBump })}
                aria-pressed={params.benchBump}
                className={`flex-1 py-1 text-[11px] font-medium rounded-sm border transition-colors cursor-pointer ${
                  params.benchBump
                    ? 'bg-[#d99b42]/18 text-[#f3c478] border-[#d99b42]/45'
                    : 'bg-[#121316] text-[#a3a098] border-white/[0.08] hover:text-[#f1efe9]'
                }`}
              >
                {params.benchBump ? 'Bench Bump: On' : 'Bench Bump: Off'}
              </button>
              <button
                type="button"
                onClick={onApplyGust}
                className="px-2.5 py-1 text-[11px] font-medium bg-[#d99b42]/18 text-[#f3c478] border border-[#d99b42]/45 rounded-sm hover:bg-[#d99b42]/28 transition-colors cursor-pointer"
              >
                Impulse Gust
              </button>
            </div>

            <div className={params.controllerMode === 'lqr' ? 'opacity-50 space-y-3' : 'space-y-3'}>
              <SliderRow
                id="pid-kp-slider"
                label="Proportional Kp"
                value={params.kp}
                min={0}
                max={6.0}
                step={0.1}
                unit=""
                displayVal={params.kp.toFixed(1)}
                onChange={(v) => onUpdateParams({ kp: v })}
              />
              <SliderRow
                id="pid-ki-slider"
                label="Integral Ki"
                value={params.ki}
                min={0}
                max={3.0}
                step={0.1}
                unit=""
                displayVal={params.ki.toFixed(1)}
                onChange={(v) => onUpdateParams({ ki: v })}
              />
              <SliderRow
                id="pid-kd-slider"
                label="Derivative Kd"
                value={params.kd}
                min={0}
                max={0.6}
                step={0.02}
                unit=""
                displayVal={params.kd.toFixed(2)}
                onChange={(v) => onUpdateParams({ kd: v })}
              />
            </div>

            <SliderRow
              id="target-speed-slider"
              label="Target Drive Speed (W / S)"
              value={params.targetSpeed}
              min={-0.35}
              max={0.35}
              step={0.05}
              unit="m/s"
              displayVal={params.targetSpeed.toFixed(2)}
              onChange={(v) => onUpdateParams({ targetSpeed: v })}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

interface SliderRowProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  displayVal: string;
  onChange: (val: number) => void;
}

function SliderRow({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  displayVal,
  onChange,
}: SliderRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <label htmlFor={id} className="text-[#d6d3cb]">
          {label}
        </label>
        <span className="font-mono-tabular text-[#f3c478]">
          {displayVal}
          {unit ? <span className="text-[#8e8b84] ml-1">{unit}</span> : null}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full sci-range"
      />
    </div>
  );
}
