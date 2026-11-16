export type FieldVariable =
  | 'physical'
  | 'velocity'
  | 'pressure'
  | 'temperature'
  | 'vorticity'
  | 'stress';

export type ColormapName = 'coolwarm' | 'viridis' | 'plasma' | 'turbo';

export type SolverPreset =
  | 'wind-tunnel'
  | 'self-balance'
  | 'cht-thermal'
  | 'ultrasonic-nav';

export type LightingPreset = 'bench' | 'tunnel' | 'macro';

export type ControllerMode = 'pid' | 'lqr';

export type InspectablePartId =
  | 'l298n'
  | 'hcsr04'
  | 'buck'
  | 'bt'
  | 'mpu'
  | 'motors'
  | 'wheels'
  | 'standoffs'
  | 'counterweight'
  | 'chassis';

export type CameraPreset =
  | 'iso'
  | 'side'
  | 'front'
  | 'top'
  | 'l298n'
  | 'tier2'
  | 'hcsr04'
  | 'wide'
  | 'bt'
  | 'mpu'
  | 'motors'
  | 'counterweight';

export interface PipelineVisibility {
  robotMesh: boolean;
  cfdSlice: boolean;
  xzWakeSlice: boolean;
  streamlines: boolean;
  vectorGlyphs: boolean;
  openfoamMesh: boolean;
  thermalOverlay: boolean;
  acousticCone: boolean;
  forceVectors: boolean;
  signalPulses: boolean;
}

export interface SimulationParams {
  preset: SolverPreset;
  field: FieldVariable;
  colormap: ColormapName;
  windSpeed: number; // m/s freestream inlet velocity (+Z -> -Z)
  viscosity: number; // kinematic viscosity nu (m^2/s)
  ambientTemp: number; // deg C
  controllerMode: ControllerMode;
  kp: number; // PID proportional gain
  ki: number; // PID integral gain
  kd: number; // PID derivative gain
  targetSpeed: number; // m/s robot cruise target
  obstacleDist: number; // m distance of acoustic wall ahead (+Z)
  benchBump: boolean; // machined calibration ramp at z = +0.16 m
  explodedView: number; // 0..1 vertical separation of the 3 chassis tiers
  sliceOffsetX: number; // -0.15..0.15 m lateral position of Y-Z slice plane
  timeScale: number; // 0.25..2.0
  paused: boolean;
}

export interface TelemetrySample {
  time: number;
  pitchDeg: number;
  wheelRpm: number;
  positionZ: number;
  motorCurrent: number;
  batteryVoltage: number;
  aeroDragMn: number;
  l298nTempC: number;
  motorTempC: number;
  maxStressMpa: number;
  ultrasonicCm: number;
  sensorWorking: boolean;
  resP: number;
  resU: number;
  resT: number;
}

export interface ProbePinData {
  active: boolean;
  x: number;
  y: number;
  z: number;
  speedMs: number;
  pressurePa: number;
  tempC: number;
}

export interface FieldRange {
  label: string;
  symbol: string;
  unit: string;
  min: number;
  max: number;
}

export function getFieldRange(field: FieldVariable, params: SimulationParams): FieldRange {
  switch (field) {
    case 'velocity':
      return {
        label: 'Velocity Magnitude',
        symbol: '|U|',
        unit: 'm/s',
        min: 0,
        max: Math.max(2.0, Number((params.windSpeed * 1.45 + 1.5).toFixed(1))),
      };
    case 'pressure':
      return {
        label: 'Kinematic Pressure',
        symbol: 'p / ρ',
        unit: 'Pa',
        min: -Math.max(12, Math.round(0.7 * 1.225 * params.windSpeed * params.windSpeed)),
        max: Math.max(12, Math.round(0.7 * 1.225 * params.windSpeed * params.windSpeed)),
      };
    case 'temperature':
      return {
        label: 'Surface Temperature',
        symbol: 'T',
        unit: '°C',
        min: Math.round(params.ambientTemp),
        max: 95,
      };
    case 'vorticity':
      return {
        label: 'Vorticity Magnitude',
        symbol: '|ω|',
        unit: 's⁻¹',
        min: 0,
        max: Math.max(40, Math.round(params.windSpeed * 18 + 20)),
      };
    case 'stress':
      return {
        label: 'Von Mises Stress',
        symbol: 'σ_vM',
        unit: 'MPa',
        min: 0,
        max: 12,
      };
    case 'physical':
    default:
      return {
        label: 'Velocity Magnitude',
        symbol: '|U|',
        unit: 'm/s',
        min: 0,
        max: Math.max(2.0, Number((params.windSpeed * 1.45 + 1.5).toFixed(1))),
      };
  }
}
