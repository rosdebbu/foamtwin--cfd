/**
 * Nonlinear 2-Wheeled Inverted Pendulum Multibody, LQR/PID Controller,
 * Bench Calibration Ramp Contact & 3S Li-Ion Battery Sag Model.
 */
import type { ControllerMode } from './types';

export interface BalancingState {
  z: number; // linear position along Z (m)
  yOffset: number; // wheel vertical elevation over bench bump (m)
  v: number; // linear velocity dz/dt (m/s)
  theta: number; // chassis pitch angle (rad), >0 tilts forward (+Z)
  omega: number; // pitch angular velocity d(theta)/dt (rad/s)
  wheelAngle: number; // cumulative wheel rotation (rad)
  integralError: number;
  prevError: number;
  motorCurrent: number; // total current drawn by both motors (A)
  batteryVoltage: number; // 3S Li-Ion terminal voltage under load (V)
  torqueNm: number; // applied wheel torque (N*m)
  tippedOver: boolean;
  disturbanceTimer: number;
}

export interface BalancingConfig {
  controllerMode?: ControllerMode;
  kp: number;
  ki: number;
  kd: number;
  targetSpeed: number; // desired linear velocity (m/s)
  obstacleDist: number; // obstacle wall distance (m)
  avoidObstacles: boolean;
  benchBump?: boolean; // calibrated aluminum bump at z = +0.16 m
}

export const ROBOT_SPECS = {
  wheelRadius: 0.048,
  wheelMass: 0.22,
  wheelInertia: 0.5 * 0.22 * 0.048 * 0.048,
  bodyMass: 0.92,
  comHeight: 0.105,
  bodyInertia: 0.92 * 0.105 * 0.105 * 0.42,
  gravity: 9.81,
  maxTorqueNm: 1.35, // dual 12V geared motors stall limit at nominal 11.1V
  motorKt: 0.18, // effective torque constant at wheel (N*m / A)
  motorResistance: 3.2, // ohms
  supplyVoltage: 11.8, // charged 3S Li-ion open-circuit
  packInternalRes: 0.26, // ohms combined pack + wiring ESR
  l298nDropV: 1.8, // bipolar junction voltage drop
  dampingWheel: 0.045,
  dampingBody: 0.025,
  bumpCenterZ: 0.16,
  bumpHeightM: 0.0085,
  bumpHalfWidthM: 0.024,
};

/**
 * Computes bench calibration bump height h(z) and surface slope dh/dz at position z.
 */
export function evaluateBenchBump(z: number, enabled: boolean): { height: number; slope: number } {
  if (!enabled) return { height: 0, slope: 0 };
  const dz = z - ROBOT_SPECS.bumpCenterZ;
  const w = ROBOT_SPECS.bumpHalfWidthM;
  const gauss = Math.exp(-(dz * dz) / (w * w));
  const height = ROBOT_SPECS.bumpHeightM * gauss;
  const slope = height * (-2 * dz) / (w * w);
  return { height, slope };
}

export function createInitialBalancingState(initialTiltDeg = 3.5): BalancingState {
  return {
    z: 0,
    yOffset: 0,
    v: 0,
    theta: (initialTiltDeg * Math.PI) / 180,
    omega: 0,
    wheelAngle: 0,
    integralError: 0,
    prevError: 0,
    motorCurrent: 0,
    batteryVoltage: ROBOT_SPECS.supplyVoltage,
    torqueNm: 0,
    tippedOver: false,
    disturbanceTimer: 0,
  };
}

export function applyImpulseGust(
  state: BalancingState,
  deltaOmegaRadPerSec = 2.2,
): BalancingState {
  return {
    ...state,
    omega: state.omega + deltaOmegaRadPerSec,
    disturbanceTimer: 0.4,
  };
}

/**
 * Advances the coupled cart-pendulum equations of motion with aerodynamic drag,
 * pitching moment, optional bench bump contact, and 3S battery voltage sag.
 */
export function stepBalancing(
  state: BalancingState,
  config: BalancingConfig,
  aeroDragForceZ: number,
  aeroPitchMomentX: number,
  dt: number,
): BalancingState {
  const safeDt = Math.min(Math.max(dt, 0.0005), 0.03);
  const substeps = 8;
  const h = safeDt / substeps;

  let z = state.z;
  let yOffset = state.yOffset;
  let v = state.v;
  let theta = state.theta;
  let omega = state.omega;
  let integralError = state.integralError;
  let prevError = state.prevError;
  let tippedOver = state.tippedOver;
  let motorCurrent = state.motorCurrent;
  let batteryVoltage = state.batteryVoltage;
  let torqueNm = state.torqueNm;
  let disturbanceTimer = Math.max(0, state.disturbanceTimer - safeDt);

  const {
    wheelRadius: R,
    wheelMass: Mw,
    wheelInertia: Iw,
    bodyMass: Mb,
    comHeight: l,
    bodyInertia: Ib,
    gravity: g,
    maxTorqueNm,
    motorKt,
    supplyVoltage,
    packInternalRes,
    l298nDropV,
    dampingWheel,
    dampingBody,
  } = ROBOT_SPECS;

  const Mtot = Mw + Mb + Iw / (R * R);
  const mode = config.controllerMode ?? 'pid';
  const hasBump = Boolean(config.benchBump);

  for (let s = 0; s < substeps; s++) {
    if (Math.abs(theta) > 1.08) {
      tippedOver = true;
      theta = Math.sign(theta) * 1.08;
      omega = 0;
      v *= 0.85;
      motorCurrent = 0;
      batteryVoltage = supplyVoltage;
      torqueNm = 0;
      break;
    }

    // HC-SR04 ultrasonic collision avoidance velocity override
    let effectiveTargetV = config.targetSpeed;
    if (config.avoidObstacles) {
      const clearance = config.obstacleDist - z;
      if (clearance < 0.29) {
        effectiveTargetV = Math.min(
          effectiveTargetV,
          -0.28 * Math.min(1, Math.max(0, (0.29 - clearance) / 0.14)),
        );
      }
    }

    const centeringVel = Math.abs(effectiveTargetV) < 0.01 ? -0.45 * z : 0;
    const desiredVel = effectiveTargetV + centeringVel;
    const speedErr = desiredVel - v;

    let rawCmd = 0;
    if (mode === 'lqr') {
      // Optimal full-state LQR feedback: u = -K*(x - x_ref)
      const zErr = Math.abs(effectiveTargetV) < 0.01 ? z : 0;
      const refTheta = Math.max(-0.12, Math.min(0.12, 0.065 * speedErr));
      rawCmd =
        3.1 * (theta - refTheta) +
        0.31 * omega -
        0.38 * (v - effectiveTargetV) -
        0.22 * zErr;
      integralError *= 0.96;
      prevError = theta - refTheta;
    } else {
      const targetTheta = Math.max(-0.14, Math.min(0.14, 0.08 * speedErr));
      const err = theta - targetTheta;
      integralError = Math.max(-0.5, Math.min(0.5, integralError + err * h));
      const deriv = (err - prevError) / h;
      prevError = err;
      rawCmd = config.kp * err + config.ki * integralError + config.kd * deriv;
    }

    // Couple 3S Li-Ion voltage sag & L298N junction drop into achievable stall torque
    const voltageHeadroom = Math.max(0.4, (batteryVoltage - l298nDropV) / (supplyVoltage - l298nDropV));
    const effectiveMaxTorque = maxTorqueNm * voltageHeadroom;
    const wheelOmega = v / R;
    const backEmfTorqueReduction = wheelOmega * 0.012;
    torqueNm = Math.max(
      -effectiveMaxTorque,
      Math.min(effectiveMaxTorque, rawCmd - backEmfTorqueReduction),
    );
    motorCurrent = Math.abs(torqueNm) / motorKt;
    batteryVoltage = Math.max(9.0, supplyVoltage - motorCurrent * packInternalRes);

    // Terrain elevation & slope contact over optional optical bench bump
    const bump = evaluateBenchBump(z, hasBump);
    yOffset = bump.height;
    const terrainSlopeForce = -Mtot * g * bump.slope * 0.55;
    const terrainPitchKick = bump.slope * Math.abs(v) * 0.42;

    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    const a11 = Mtot;
    const a12 = Mb * l * cosT;
    const a21 = Mb * l * cosT;
    const a22 = Ib + Mb * l * l;

    const centeringForce =
      Math.abs(effectiveTargetV) < 0.01 ? -0.45 * z - 0.12 * v : 0;

    const rhs1 =
      torqueNm / R +
      aeroDragForceZ +
      terrainSlopeForce +
      centeringForce -
      dampingWheel * v +
      Mb * l * sinT * omega * omega;
    const rhs2 =
      Mb * g * l * sinT -
      torqueNm +
      aeroPitchMomentX +
      terrainPitchKick -
      dampingBody * omega;

    const det = a11 * a22 - a12 * a21;
    const az = (rhs1 * a22 - rhs2 * a12) / det;
    const alpha = (a11 * rhs2 - a21 * rhs1) / det;

    v += az * h;
    z += v * h;
    omega += alpha * h;
    theta += omega * h;

    if (z > 0.30) {
      z = 0.30;
      if (v > 0) v = -v * 0.2;
    } else if (z < -0.30) {
      z = -0.30;
      if (v < 0) v = -v * 0.2;
    }
  }

  return {
    z,
    yOffset,
    v,
    theta,
    omega,
    wheelAngle: state.wheelAngle + (v / R) * safeDt,
    integralError,
    prevError,
    motorCurrent,
    batteryVoltage,
    torqueNm,
    tippedOver,
    disturbanceTimer,
  };
}
