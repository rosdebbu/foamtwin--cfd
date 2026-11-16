import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Pause,
  Play,
  RotateCcw,
  Wind,
} from 'lucide-react';
import {
  SimulationViewport,
  getCameraPresetForPart,
  type AutoTourStepInfo,
  type HoverProbeInfo,
  type SimulationViewportHandle,
} from './components/SimulationViewport';
import { PipelineDrawer, type DockPosition } from './components/PipelineDrawer';
import { ScalarBarLegend } from './components/ScalarBarLegend';
import {
  ComponentInspector,
  getPartTitle,
  INSPECTABLE_ORDER,
} from './components/ComponentInspector';
import { StudioDock } from './components/StudioDock';
import { PitotProbeCard } from './components/PitotProbeCard';
import { BalanceHorizonWidget } from './components/BalanceHorizonWidget';
import { MobileWindCard } from './components/MobileWindCard';
import type {
  CameraPreset,
  FieldVariable,
  InspectablePartId,
  LightingPreset,
  PipelineVisibility,
  ProbePinData,
  SimulationParams,
  SolverPreset,
  TelemetrySample,
} from './physics/types';

const INITIAL_PARAMS: SimulationParams = {
  preset: 'wind-tunnel',
  field: 'physical',
  colormap: 'turbo',
  windSpeed: 6.0,
  viscosity: 0.00035,
  ambientTemp: 24,
  controllerMode: 'pid',
  kp: 2.6,
  ki: 0.8,
  kd: 0.24,
  targetSpeed: 0,
  obstacleDist: 0.40,
  benchBump: false,
  explodedView: 0,
  sliceOffsetX: 0,
  timeScale: 1.0,
  paused: false,
};

const INITIAL_VISIBILITY: PipelineVisibility = {
  robotMesh: true,
  cfdSlice: true,
  xzWakeSlice: false,
  streamlines: true,
  vectorGlyphs: false,
  openfoamMesh: false,
  thermalOverlay: false,
  acousticCone: false,
  forceVectors: false,
  signalPulses: true,
};

const INITIAL_TELEMETRY: TelemetrySample = {
  time: 0,
  pitchDeg: 3.2,
  wheelRpm: 0,
  positionZ: 0,
  motorCurrent: 0.42,
  batteryVoltage: 11.7,
  aeroDragMn: 145,
  l298nTempC: 38.2,
  motorTempC: 30.5,
  maxStressMpa: 0.85,
  ultrasonicCm: 17.6,
  sensorWorking: true,
  resP: 1.2e-3,
  resU: 4.5e-4,
  resT: 2.1e-4,
};

const PRESET_DEFS: Array<{ id: SolverPreset; label: string }> = [
  { id: 'wind-tunnel', label: 'Wind Tunnel' },
  { id: 'self-balance', label: 'Self-Balance' },
  { id: 'cht-thermal', label: 'Thermal CHT' },
  { id: 'ultrasonic-nav', label: 'Acoustic Nav' },
];

function triggerTextDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const MOBILE_PRESENTATION_PARAMS: SimulationParams = {
  ...INITIAL_PARAMS,
  preset: 'ultrasonic-nav',
  field: 'physical',
  windSpeed: 0,
  targetSpeed: 0.14,
  obstacleDist: 0.24,
  paused: false,
};

const MOBILE_PRESENTATION_VISIBILITY: PipelineVisibility = {
  robotMesh: true,
  cfdSlice: false,
  xzWakeSlice: false,
  streamlines: false,
  vectorGlyphs: false,
  openfoamMesh: false,
  thermalOverlay: false,
  acousticCone: true,
  forceVectors: false,
  signalPulses: true,
};

export default function App() {
  const viewportRef = useRef<SimulationViewportHandle | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const [mobileTourActive, setMobileTourActive] = useState<boolean>(true);
  const [params, setParams] = useState<SimulationParams>(INITIAL_PARAMS);
  const [visibility, setVisibility] = useState<PipelineVisibility>(INITIAL_VISIBILITY);
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('bench');
  const [turntable, setTurntable] = useState<boolean>(false);
  const [autoTour, setAutoTour] = useState<boolean>(false);
  const [tourStep, setTourStep] = useState<AutoTourStepInfo | null>(null);
  const [activeCamera, setActiveCamera] = useState<CameraPreset | null>('iso');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [dockPosition, setDockPosition] = useState<DockPosition>('sidebar');
  const [hudHidden, setHudHidden] = useState<boolean>(false);
  const [tippedOver, setTippedOver] = useState<boolean>(false);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetrySample>(INITIAL_TELEMETRY);
  const [selectedPart, setSelectedPart] = useState<InspectablePartId | null>(null);
  const [hoverProbe, setHoverProbe] = useState<HoverProbeInfo | null>(null);
  const [probeMode, setProbeMode] = useState<boolean>(false);
  const [probePin, setProbePin] = useState<ProbePinData | null>(null);
  const [exportOpen, setExportOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (mobile) {
        setMobileTourActive(true);
      }
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const handleUpdateParams = useCallback((patch: Partial<SimulationParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleToggleLayer = useCallback((key: keyof PipelineVisibility) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSelectPreset = useCallback((preset: SolverPreset) => {
    if (preset === 'wind-tunnel') {
      setParams((prev) => ({
        ...prev,
        preset,
        field: 'velocity',
        colormap: 'coolwarm',
        windSpeed: 7.5,
        targetSpeed: 0,
      }));
      setVisibility((prev) => ({
        ...prev,
        robotMesh: true,
        cfdSlice: true,
        xzWakeSlice: true,
        streamlines: true,
        vectorGlyphs: true,
        openfoamMesh: false,
        thermalOverlay: false,
        acousticCone: false,
        forceVectors: false,
      }));
    } else if (preset === 'self-balance') {
      setParams((prev) => ({
        ...prev,
        preset,
        field: 'physical',
        colormap: 'viridis',
        windSpeed: 2.0,
        kp: 2.6,
        ki: 0.8,
        kd: 0.24,
        targetSpeed: 0,
      }));
      setVisibility((prev) => ({
        ...prev,
        robotMesh: true,
        cfdSlice: false,
        xzWakeSlice: false,
        streamlines: true,
        vectorGlyphs: false,
        openfoamMesh: false,
        thermalOverlay: false,
        acousticCone: false,
        forceVectors: true,
      }));
      viewportRef.current?.applyGustNudge(1.7);
    } else if (preset === 'cht-thermal') {
      setParams((prev) => ({
        ...prev,
        preset,
        field: 'temperature',
        colormap: 'plasma',
        windSpeed: 2.5,
        targetSpeed: 0.15,
      }));
      setVisibility((prev) => ({
        ...prev,
        robotMesh: true,
        cfdSlice: true,
        xzWakeSlice: false,
        streamlines: true,
        vectorGlyphs: false,
        openfoamMesh: false,
        thermalOverlay: true,
        acousticCone: false,
        forceVectors: false,
      }));
    } else if (preset === 'ultrasonic-nav') {
      setParams((prev) => ({
        ...prev,
        preset,
        field: 'physical',
        colormap: 'turbo',
        windSpeed: 0,
        targetSpeed: 0.16,
        obstacleDist: 0.30,
      }));
      setVisibility((prev) => ({
        ...prev,
        robotMesh: true,
        cfdSlice: false,
        xzWakeSlice: false,
        streamlines: false,
        vectorGlyphs: false,
        openfoamMesh: false,
        thermalOverlay: false,
        acousticCone: true,
        forceVectors: true,
      }));
    }
  }, []);

  const handleTelemetry = useCallback((sample: TelemetrySample, tipped: boolean) => {
    setLatestTelemetry(sample);
    setTippedOver(tipped);
  }, []);

  const handleApplyGust = useCallback(() => {
    viewportRef.current?.applyGustNudge(2.0);
  }, []);

  const handleReset = useCallback(() => {
    viewportRef.current?.resetSimulation();
    setTippedOver(false);
    setActiveCamera('iso');
    viewportRef.current?.flyToPreset('iso');
  }, []);

  const handleFlyCamera = useCallback((cam: CameraPreset) => {
    setAutoTour(false);
    setTourStep(null);
    setActiveCamera(cam);
    viewportRef.current?.flyToPreset(cam);
  }, []);

  const handleToggleAutoTour = useCallback(() => {
    setAutoTour((prev) => {
      const next = !prev;
      if (next) {
        setTurntable(false);
        setSelectedPart(null);
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
          setDrawerOpen(false);
        }
      } else {
        setTourStep(null);
      }
      return next;
    });
  }, []);

  const handleAutoTourStep = useCallback((info: AutoTourStepInfo) => {
    setTourStep(info);
    setActiveCamera(info.preset);
  }, []);

  const handleCancelAutoTour = useCallback(() => {
    if (isMobile) {
      setMobileTourActive(false);
    } else {
      setAutoTour(false);
      setTourStep(null);
    }
  }, [isMobile]);

  const handleSelectInspectPart = useCallback((part: InspectablePartId) => {
    setAutoTour(false);
    setTourStep(null);
    setSelectedPart(part);
    const cam = getCameraPresetForPart(part);
    setActiveCamera(cam);
    viewportRef.current?.flyToPreset(cam);
  }, []);

  const handleToggleInspectTour = useCallback(() => {
    setAutoTour(false);
    setTourStep(null);
    if (selectedPart) {
      setSelectedPart(null);
      setActiveCamera('iso');
      viewportRef.current?.flyToPreset('iso');
    } else {
      handleSelectInspectPart(INSPECTABLE_ORDER[0]);
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setDrawerOpen(false);
      }
    }
  }, [selectedPart, handleSelectInspectPart]);

  const handleExportPng = useCallback(() => {
    setExportOpen(false);
    const dataUrl = viewportRef.current?.captureScreenshot();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `foamtwin-${params.preset}-${params.field}.png`;
    link.href = dataUrl;
    link.click();
  }, [params.preset, params.field]);

  const handleExportVtk = useCallback(() => {
    setExportOpen(false);
    const vtk = viewportRef.current?.exportVtk();
    if (!vtk) return;
    triggerTextDownload(
      vtk,
      `foamtwin-${params.preset}.vtk`,
      'application/octet-stream',
    );
  }, [params.preset]);

  const handleExportCsv = useCallback(() => {
    setExportOpen(false);
    const csv = viewportRef.current?.exportCsv();
    if (!csv) return;
    triggerTextDownload(
      csv,
      `foamtwin-${params.preset}-field.csv`,
      'text/csv;charset=utf-8',
    );
  }, [params.preset]);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [exportOpen]);

  // Keyboard shortcuts including W/S or ArrowUp/ArrowDown robot drive
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setParams((prev) => ({ ...prev, paused: !prev.paused }));
      } else if (e.key === 'h' || e.key === 'H') {
        setHudHidden((h) => !h);
      } else if (e.key === 'g' || e.key === 'G') {
        viewportRef.current?.applyGustNudge(2.0);
      } else if (e.key === 'r' || e.key === 'R') {
        handleReset();
      } else if (e.key === 't' || e.key === 'T') {
        handleToggleAutoTour();
      } else if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        e.preventDefault();
        setParams((prev) => ({ ...prev, targetSpeed: 0.25 }));
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        e.preventDefault();
        setParams((prev) => ({ ...prev, targetSpeed: -0.25 }));
      } else if (e.key === 'Escape') {
        if (exportOpen) setExportOpen(false);
        else if (autoTour) handleCancelAutoTour();
        else if (probeMode) setProbeMode(false);
        else if (selectedPart) setSelectedPart(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (
        e.key === 'w' ||
        e.key === 'W' ||
        e.key === 's' ||
        e.key === 'S' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        setParams((prev) => ({ ...prev, targetSpeed: 0 }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleReset, handleToggleAutoTour, handleCancelAutoTour, selectedPart, exportOpen, probeMode, autoTour]);

  const showScalarLegend =
    params.field !== 'physical' ||
    visibility.cfdSlice ||
    visibility.xzWakeSlice ||
    visibility.streamlines ||
    visibility.vectorGlyphs;

  const effectiveParams = isMobile ? MOBILE_PRESENTATION_PARAMS : params;
  const effectiveVisibility = isMobile ? MOBILE_PRESENTATION_VISIBILITY : visibility;
  const effectiveAutoTour = isMobile ? mobileTourActive : autoTour;

  return (
    <div
      className="w-full h-full flex flex-col bg-[#121316] text-[#f1efe9] overflow-hidden"
      data-state={effectiveParams.paused ? 'paused' : 'running'}
    >
      {/* Top Architectural Studio Command Bar (Desktop/Laptop only; Mobile uses clean full-screen presentation) */}
      {!isMobile && !hudHidden && (
        <header className="h-11 shrink-0 bg-[#16181c] border-b border-white/[0.08] px-2.5 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 z-30">
          {/* Zone 1: Brand Title */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="font-display text-sm font-semibold tracking-tight text-[#f1efe9] whitespace-nowrap">
              FoamTwin
            </span>
          </div>

          {/* Zone 2: Physics Mode Switcher + Field Selector */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <select
              aria-label="Physics solver mode"
              value={params.preset}
              onChange={(e) => handleSelectPreset(e.target.value as SolverPreset)}
              className="sm:hidden max-w-[116px] bg-[#111216] border border-white/[0.10] rounded-sm px-1.5 py-1 text-[11px] text-[#f3c478] focus:outline-none focus:border-[#d99b42] cursor-pointer truncate"
            >
              {PRESET_DEFS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label="Physics solver modes"
              className="hidden sm:flex items-center bg-[#111216] border border-white/[0.08] rounded-sm p-0.5 shrink-0"
            >
              {PRESET_DEFS.map((p) => {
                const active = params.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p.id)}
                    aria-pressed={active}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#d99b42]/18 text-[#f3c478] border border-[#d99b42]/45'
                        : 'text-[#9a9891] hover:text-[#f1efe9] border border-transparent'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
              <label
                htmlFor="field-select"
                className="text-[11px] text-[#8e8b84] whitespace-nowrap"
              >
                Field
              </label>
              <select
                id="field-select"
                value={params.field}
                onChange={(e) =>
                  handleUpdateParams({ field: e.target.value as FieldVariable })
                }
                className="bg-[#111216] border border-white/[0.10] rounded-sm px-2 py-1 text-[11px] text-[#f1efe9] focus:outline-none focus:border-[#d99b42] cursor-pointer"
              >
                <option value="physical">Physical PBR</option>
                <option value="velocity">Velocity |U|</option>
                <option value="pressure">Pressure p</option>
                <option value="temperature">Temperature T</option>
                <option value="vorticity">Vorticity |ω|</option>
                <option value="stress">Stress σ_vM</option>
              </select>
            </div>
          </div>

          {/* Zone 3: Transport, Export & Clean View Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleApplyGust}
              aria-label="Apply aerodynamic impulse gust"
              title="Apply Gust (G)"
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium bg-[#d99b42]/15 hover:bg-[#d99b42]/25 text-[#f3c478] border border-[#d99b42]/40 rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Wind className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gust</span>
            </button>

            <button
              type="button"
              onClick={() => handleUpdateParams({ paused: !params.paused })}
              aria-label={params.paused ? 'Resume simulation' : 'Pause simulation'}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#22252d] hover:bg-[#2b2f39] text-[#f1efe9] border border-white/[0.12] rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {params.paused ? (
                <>
                  <Play className="w-3.5 h-3.5 text-[#d99b42]" />
                  <span>Run</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-[#d99b42]" />
                  <span>Pause</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset simulation"
              title="Reset Simulation (R)"
              className="p-1.5 bg-[#1b1d23] hover:bg-[#242730] border border-white/[0.10] rounded-sm text-[#c9c6be] hover:text-[#f1efe9] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Export Menu (.png, .vtk, .csv) */}
            <div ref={exportMenuRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setExportOpen((o) => !o)}
                aria-expanded={exportOpen}
                aria-label="Export snapshot or ParaView dataset"
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#1b1d23] hover:bg-[#242730] border border-white/[0.10] rounded-sm text-[#c9c6be] hover:text-[#f1efe9] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#d99b42]" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 text-[#8e8b84]" />
              </button>

              {exportOpen && (
                <div
                  role="menu"
                  aria-label="Export formats"
                  className="absolute right-0 mt-1.5 w-56 bg-[#17191e] border border-white/[0.12] rounded-md shadow-2xl py-1 z-30"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportPng}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-[#e7e4dc] hover:bg-white/[0.06] hover:text-[#f3c478] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#d99b42] shrink-0" />
                    <span>Viewport Snapshot (.png)</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportVtk}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-[#e7e4dc] hover:bg-white/[0.06] hover:text-[#f3c478] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#d99b42] shrink-0" />
                    <span>ParaView Mesh (.vtk)</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportCsv}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-[#e7e4dc] hover:bg-white/[0.06] hover:text-[#f3c478] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#d99b42] shrink-0" />
                    <span>CFD Field Table (.csv)</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setHudHidden(true)}
              aria-label="Hide interface overlays"
              title="Clean View (H)"
              className="hidden md:flex p-1.5 bg-[#1b1d23] hover:bg-[#242730] border border-white/[0.10] rounded-sm text-[#c9c6be] hover:text-[#f1efe9] transition-colors cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>
      )}

      {/* Full-Viewport 3D Optical Bench Stage */}
      <main
        className="relative flex-1 min-h-0 w-full overflow-hidden"
        onDoubleClick={() => {
          if (isMobile) setMobileTourActive(true);
        }}
      >
        <SimulationViewport
          ref={viewportRef}
          params={effectiveParams}
          visibility={effectiveVisibility}
          lightingPreset={lightingPreset}
          turntable={isMobile ? false : turntable}
          autoTour={effectiveAutoTour}
          probeMode={isMobile ? false : probeMode}
          probePin={isMobile ? null : probePin}
          onTelemetry={handleTelemetry}
          onHoverProbe={isMobile ? undefined : setHoverProbe}
          onDropProbe={isMobile ? undefined : setProbePin}
          onAutoTourStep={isMobile ? undefined : handleAutoTourStep}
          onCancelAutoTour={handleCancelAutoTour}
          onSelectPart={(part) => {
            if (isMobile) return;
            setAutoTour(false);
            setTourStep(null);
            setSelectedPart(part);
            setActiveCamera(getCameraPresetForPart(part));
          }}
        />

        {/* Mobile-only Ultra-Clean Sonar Working Readout (zero OpenFOAM UI clutter) */}
        {isMobile && !tippedOver && (
          <div
            data-testid="mobile-sonar-status"
            className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100vw-24px)] flex items-center gap-2 bg-[#12141a]/80 backdrop-blur-xs border border-cyan-400/30 rounded-full px-3 py-1 text-[11px] shadow-lg whitespace-nowrap"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                latestTelemetry.sensorWorking
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span className="font-semibold tracking-wide text-[#f1efe9]">
              HC-SR04 SONAR
            </span>
            <span
              className={`font-medium ${
                latestTelemetry.sensorWorking ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {latestTelemetry.sensorWorking
                ? latestTelemetry.ultrasonicCm < 29
                  ? 'DETECTED'
                  : 'ACTIVE'
                : 'NO ECHO'}
            </span>
            <span className="font-mono-tabular text-cyan-300">
              {latestTelemetry.ultrasonicCm.toFixed(1)} cm
            </span>
          </div>
        )}

        {!isMobile && (!hudHidden ? (
          <>
            {/* Mobile Tap-Outside Scrim when Studio Sidebar is expanded on small screens */}
            {drawerOpen && (
              <button
                type="button"
                aria-label="Close studio sidebar"
                onClick={() => setDrawerOpen(false)}
                className="md:hidden absolute inset-0 z-20 bg-black/50 cursor-pointer"
              />
            )}

            {/* Left Studio Sidebar Rail & Expandable Workbench Drawer */}
            <div
              className={`pointer-events-none absolute top-2.5 sm:top-3 left-2.5 sm:left-3 bottom-2.5 sm:bottom-3 flex flex-col items-start ${
                drawerOpen ? 'z-30' : 'z-20'
              }`}
            >
              <PipelineDrawer
                open={drawerOpen}
                onToggleOpen={() => setDrawerOpen((o) => !o)}
                params={params}
                onUpdateParams={handleUpdateParams}
                visibility={visibility}
                onToggleLayer={handleToggleLayer}
                onApplyGust={handleApplyGust}
                activeCamera={activeCamera}
                lightingPreset={lightingPreset}
                turntable={turntable}
                autoTour={autoTour}
                inspecting={selectedPart !== null}
                probeMode={probeMode}
                dockPosition={dockPosition}
                onFlyCamera={handleFlyCamera}
                onChangeLighting={setLightingPreset}
                onToggleTurntable={() => {
                  setAutoTour(false);
                  setTourStep(null);
                  setTurntable((t) => !t);
                }}
                onToggleAutoTour={handleToggleAutoTour}
                onToggleInspectTour={handleToggleInspectTour}
                onToggleProbeMode={() => {
                  setProbeMode((m) => {
                    const next = !m;
                    if (next && typeof window !== 'undefined' && window.innerWidth < 768) {
                      setDrawerOpen(false);
                    }
                    return next;
                  });
                }}
                onChangeDockPosition={setDockPosition}
              />
            </div>

            {/* Right Stack: Selected Hardware Inspector + Pitot Probe + Field Color Legend */}
            <div className="pointer-events-none absolute top-2.5 sm:top-3 right-2.5 sm:right-3 z-10 flex flex-col items-end gap-2 sm:gap-2.5">
              <ComponentInspector
                part={selectedPart}
                telemetry={latestTelemetry}
                onSelectPart={handleSelectInspectPart}
                onClose={() => {
                  setSelectedPart(null);
                  setActiveCamera('iso');
                  viewportRef.current?.flyToPreset('iso');
                }}
              />
              <PitotProbeCard
                probePin={probePin}
                probeMode={probeMode}
                onClear={() => {
                  setProbePin(null);
                  setProbeMode(false);
                }}
              />
              <ScalarBarLegend params={params} visible={showScalarLegend} />
            </div>

            {/* Mobile Quick Wind Speed Slider (bottom-left, collision-free) */}
            {!(autoTour && tourStep) && (
              <div
                className={`pointer-events-none absolute left-2.5 z-10 md:hidden ${
                  dockPosition === 'dock' ? 'bottom-14' : 'bottom-2.5'
                }`}
              >
                <MobileWindCard
                  windSpeed={params.windSpeed}
                  onChangeWindSpeed={(spd) => handleUpdateParams({ windSpeed: spd })}
                />
              </div>
            )}

            {/* Bottom-Right Compact IMU Pitch Horizon & Drive Micro-Instrument (collision-free) */}
            <div
              className={`pointer-events-none absolute right-2.5 sm:right-3 z-10 flex flex-col items-end gap-1.5 ${
                dockPosition === 'dock'
                  ? 'bottom-14 sm:bottom-16'
                  : autoTour && tourStep
                    ? 'bottom-14 sm:bottom-3.5'
                    : 'bottom-2.5 sm:bottom-3.5'
              }`}
            >
              {hoverProbe && (
                <div className="hidden lg:flex items-center gap-2 text-[11px] text-[#c9c6be]/85 select-none">
                  {probeMode ? (
                    <span className="text-[#f3c478] font-medium">
                      Pitot Probe · Click CFD slice to pin
                    </span>
                  ) : hoverProbe.part ? (
                    <span className="text-[#f3c478] font-medium">
                      {getPartTitle(hoverProbe.part)} · Click inspect / Shift+Click shove
                    </span>
                  ) : (
                    <span className="font-mono-tabular text-[#8e8b84]">
                      ({Math.round(hoverProbe.worldX * 1000) || 0},{' '}
                      {Math.round(hoverProbe.worldZ * 1000) || 0}) mm
                    </span>
                  )}
                </div>
              )}
              <BalanceHorizonWidget
                telemetry={latestTelemetry}
                controllerMode={params.controllerMode}
                targetSpeed={params.targetSpeed}
                onDriveStep={(spd) => handleUpdateParams({ targetSpeed: spd })}
              />
            </div>

            {/* Cinematic Auto-Tour Waypoint Caption */}
            {autoTour && tourStep && (
              <div
                role="status"
                aria-live="polite"
                className={`pointer-events-auto absolute left-1/2 -translate-x-1/2 z-10 max-w-[calc(100vw-20px)] flex items-center gap-2 sm:gap-2.5 bg-[#17191e]/95 border border-[#d99b42]/45 rounded-md px-2.5 sm:px-3 py-1.5 text-xs shadow-xl whitespace-nowrap ${
                  dockPosition === 'dock' ? 'bottom-14 sm:bottom-16' : 'bottom-2.5 sm:bottom-3.5'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#d99b42] animate-pulse shrink-0" />
                <span className="font-mono-tabular text-[11px] text-[#d99b42] shrink-0">
                  {tourStep.index + 1}/{tourStep.total}
                </span>
                <span className="font-display font-medium text-[#f1efe9] truncate">
                  {tourStep.label}
                </span>
                <span className="hidden sm:inline text-[11px] text-[#9a9891]">
                  · {tourStep.subtitle}
                </span>
                <button
                  type="button"
                  onClick={handleCancelAutoTour}
                  aria-label="Stop Auto-Tour"
                  className="ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-[#121316] border border-white/[0.10] rounded-xs text-[#b5b2aa] hover:text-[#f3c478] transition-colors cursor-pointer shrink-0"
                >
                  Stop
                </button>
              </div>
            )}

            {/* Optional Bottom-Center Floating Studio Hardware Dock */}
            {dockPosition === 'dock' && (
              <div className="pointer-events-none absolute bottom-3.5 left-1/2 -translate-x-1/2 z-10 flex justify-center w-full px-3">
                <StudioDock
                  activeCamera={activeCamera}
                  explodedView={params.explodedView}
                  turntable={turntable}
                  autoTour={autoTour}
                  lightingPreset={lightingPreset}
                  inspecting={selectedPart !== null}
                  benchBump={params.benchBump}
                  probeMode={probeMode}
                  onFlyCamera={handleFlyCamera}
                  onChangeExploded={(val) => handleUpdateParams({ explodedView: val })}
                  onToggleTurntable={() => {
                    setAutoTour(false);
                    setTourStep(null);
                    setTurntable((t) => !t);
                  }}
                  onToggleAutoTour={handleToggleAutoTour}
                  onChangeLighting={setLightingPreset}
                  onToggleInspectTour={handleToggleInspectTour}
                  onToggleBump={() => handleUpdateParams({ benchBump: !params.benchBump })}
                  onToggleProbeMode={() => setProbeMode((m) => !m)}
                />
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setHudHidden(false)}
            aria-label="Restore studio controls"
            className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-[#17191e]/90 border border-white/[0.12] rounded-sm text-xs font-medium text-[#e7e4dc] hover:text-[#f3c478] transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#d99b42]" />
            <span>Show Controls (H)</span>
          </button>
        ))}

        {/* Tip-over recovery banner */}
        {tippedOver && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-[#1e1516]/95 border border-rose-500/50 rounded-md px-4 py-2 flex items-center gap-3 text-xs">
            <span className="text-rose-200 font-medium">
              Critical tilt limit exceeded (±62°). Restore PID gains or reset upright.
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 border border-rose-400/40 rounded-sm font-medium cursor-pointer"
            >
              Reset Upright
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
