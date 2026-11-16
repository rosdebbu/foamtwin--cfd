import type { CameraPreset } from './types';

export const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  iso: { pos: [0.34, 0.23, 0.34], target: [0.0, 0.11, 0.0] },
  side: { pos: [0.46, 0.14, 0.0], target: [0.0, 0.115, 0.0] },
  front: { pos: [0.0, 0.15, 0.42], target: [0.0, 0.11, 0.0] },
  top: { pos: [0.0, 0.52, 0.04], target: [0.0, 0.10, 0.0] },
  l298n: { pos: [0.115, 0.235, 0.088], target: [0.024, 0.184, -0.004] },
  tier2: { pos: [0.085, 0.158, 0.115], target: [0.0, 0.128, 0.010] },
  hcsr04: { pos: [0.105, 0.122, 0.168], target: [0.0, 0.082, 0.092] },
  wide: { pos: [0.62, 0.35, 0.66], target: [0.0, 0.12, 0.0] },
  bt: { pos: [0.095, 0.172, 0.105], target: [0.036, 0.132, 0.014] },
  mpu: { pos: [-0.055, 0.235, 0.095], target: [-0.006, 0.184, 0.022] },
  motors: { pos: [-0.175, 0.085, 0.145], target: [-0.045, 0.048, -0.004] },
  counterweight: { pos: [0.095, 0.255, -0.115], target: [0.006, 0.190, -0.042] },
};

export interface AutoTourStop {
  preset: CameraPreset;
  label: string;
  subtitle: string;
  durationSec: number;
  transitionSec: number;
  driftYawRad: number;
}

export const AUTO_TOUR_STOPS: AutoTourStop[] = [
  {
    preset: 'iso',
    label: 'Isometric CFD',
    subtitle: '3D streamribbons & cut-plane wake',
    durationSec: 4.0,
    transitionSec: 1.3,
    driftYawRad: 0.22,
  },
  {
    preset: 'side',
    label: 'Side Wake Profile',
    subtitle: 'Vortex shedding & inverted pendulum balance',
    durationSec: 3.8,
    transitionSec: 1.35,
    driftYawRad: 0.14,
  },
  {
    preset: 'hcsr04',
    label: 'HC-SR04 Acoustic Array',
    subtitle: '40 kHz rangefinder & reflected echo pulses',
    durationSec: 3.8,
    transitionSec: 1.35,
    driftYawRad: -0.18,
  },
  {
    preset: 'tier2',
    label: 'Tier-2 Power & RF',
    subtitle: 'LM2596S regulator, HC-05 link & signal pulses',
    durationSec: 3.6,
    transitionSec: 1.3,
    driftYawRad: 0.18,
  },
  {
    preset: 'l298n',
    label: 'L298N Thermal Stage',
    subtitle: 'H-bridge heatsink & buoyant CHT plume',
    durationSec: 3.8,
    transitionSec: 1.35,
    driftYawRad: -0.18,
  },
  {
    preset: 'top',
    label: 'Top-Down Wake',
    subtitle: 'Orthogonal X-Z wake & standoff geometry',
    durationSec: 3.8,
    transitionSec: 1.4,
    driftYawRad: 0.16,
  },
  {
    preset: 'wide',
    label: 'Optical Bench Rig',
    subtitle: 'Full wind-tunnel & dual-wheel testbed',
    durationSec: 4.2,
    transitionSec: 1.45,
    driftYawRad: 0.24,
  },
];

export const AUTO_TOUR_TOTAL_SEC = AUTO_TOUR_STOPS.reduce(
  (acc, s) => acc + s.durationSec,
  0,
);

export interface AutoTourPose {
  stopIndex: number;
  totalStops: number;
  preset: CameraPreset;
  label: string;
  subtitle: string;
  posX: number;
  posY: number;
  posZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

function smootherstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

function shortestAngleDiff(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function getStopOffsetPolar(
  stop: AutoTourStop,
  driftPhase: number, // -0.5 .. +0.5
): { r: number; dy: number; angle: number; target: [number, number, number] } {
  const cfg = CAMERA_PRESETS[stop.preset];
  const dx = cfg.pos[0] - cfg.target[0];
  const dy = cfg.pos[1] - cfg.target[1];
  const dz = cfg.pos[2] - cfg.target[2];
  const r = Math.hypot(dx, dz);
  const baseAngle = Math.atan2(dx, dz);
  return {
    r,
    dy,
    angle: baseAngle + stop.driftYawRad * driftPhase,
    target: cfg.target,
  };
}

/**
 * Evaluates a smooth, cylindrical-arc cinematic camera pose along AUTO_TOUR_STOPS.
 * Zero heap allocations in the render loop when passing a pre-allocated `out` object.
 */
export function evaluateAutoTourPose(
  elapsedSec: number,
  robotZ: number,
  out: AutoTourPose,
  distScale = 1,
  focusBiasZ = 0,
): AutoTourPose {
  const total = AUTO_TOUR_TOTAL_SEC;
  const wrapped = ((elapsedSec % total) + total) % total;

  let accum = 0;
  let idx = 0;
  let localT = 0;
  for (let i = 0; i < AUTO_TOUR_STOPS.length; i++) {
    const dur = AUTO_TOUR_STOPS[i].durationSec;
    if (wrapped < accum + dur || i === AUTO_TOUR_STOPS.length - 1) {
      idx = i;
      localT = wrapped - accum;
      break;
    }
    accum += dur;
  }

  const prevIdx = (idx - 1 + AUTO_TOUR_STOPS.length) % AUTO_TOUR_STOPS.length;
  const prevStop = AUTO_TOUR_STOPS[prevIdx];
  const curStop = AUTO_TOUR_STOPS[idx];
  const transDur = Math.min(curStop.transitionSec, curStop.durationSec * 0.6);

  // Follow robot Z except on wide rig shot
  const prevZOff = prevStop.preset === 'wide' ? 0 : robotZ + focusBiasZ;
  const curZOff = curStop.preset === 'wide' ? 0 : robotZ + focusBiasZ;

  if (localT < transDur) {
    const blend = smootherstep(localT / transDur);
    const p0 = getStopOffsetPolar(prevStop, 0.5);
    const p1 = getStopOffsetPolar(curStop, -0.5);

    const r = (p0.r + (p1.r - p0.r) * blend) * distScale;
    const dy = (p0.dy + (p1.dy - p0.dy) * blend) * distScale;
    const angle = p0.angle + shortestAngleDiff(p0.angle, p1.angle) * blend;

    const tx = p0.target[0] + (p1.target[0] - p0.target[0]) * blend;
    const ty = p0.target[1] + (p1.target[1] - p0.target[1]) * blend;
    const tz =
      p0.target[2] +
      prevZOff +
      (p1.target[2] + curZOff - (p0.target[2] + prevZOff)) * blend;

    out.targetX = tx;
    out.targetY = ty;
    out.targetZ = tz;
    out.posX = tx + Math.sin(angle) * r;
    out.posY = ty + dy;
    out.posZ = tz + Math.cos(angle) * r;
  } else {
    const dwellSpan = Math.max(0.001, curStop.durationSec - transDur);
    const dwellFrac = (localT - transDur) / dwellSpan; // 0 .. 1
    const driftPhase = -0.5 + dwellFrac;
    const p = getStopOffsetPolar(curStop, driftPhase);

    out.targetX = p.target[0];
    out.targetY = p.target[1];
    out.targetZ = p.target[2] + curZOff;
    out.posX = out.targetX + Math.sin(p.angle) * (p.r * distScale);
    out.posY = out.targetY + p.dy * distScale;
    out.posZ = out.targetZ + Math.cos(p.angle) * (p.r * distScale);
  }

  out.stopIndex = idx;
  out.totalStops = AUTO_TOUR_STOPS.length;
  out.preset = curStop.preset;
  out.label = curStop.label;
  out.subtitle = curStop.subtitle;
  return out;
}

/**
 * Widens vertical FOV gently on portrait phone screens (aspect < 0.72)
 * so the 3-tier robot and CFD streamlines stay full-sized and uncropped.
 */
export function computeResponsiveCameraFov(
  aspect: number,
  baseFovDeg = 40,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  if (safeAspect >= 0.72) return baseFovDeg;
  const clampedAspect = Math.max(0.42, safeAspect);
  const halfRad = Math.atan(
    Math.tan((baseFovDeg * Math.PI) / 360) * (0.72 / clampedAspect),
  );
  return Math.min(54, (halfRad * 360) / Math.PI);
}

