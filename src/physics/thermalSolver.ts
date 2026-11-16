import { ROBOT_SPECS } from './balancingSolver';

/**
 * Multi-region Conjugate Heat Transfer (CHT) Thermal Solver
 * Models Joule heating in L298N H-bridge driver, dual DC motors, buck converter, and IMU,
 * coupled to convective cooling from the local CFD airflow speed.
 */

export interface ThermalState {
  l298nTempC: number;
  motorLeftTempC: number;
  motorRightTempC: number;
  buckTempC: number;
  mpuTempC: number;
  chassisTempC: number;
  residualT: number;
}

export function createInitialThermalState(ambientTempC = 24): ThermalState {
  return {
    l298nTempC: ambientTempC + 14.2,
    motorLeftTempC: ambientTempC + 6.5,
    motorRightTempC: ambientTempC + 6.5,
    buckTempC: ambientTempC + 8.0,
    mpuTempC: ambientTempC + 2.5,
    chassisTempC: ambientTempC + 1.2,
    residualT: 1e-4,
  };
}

export function stepThermal(
  state: ThermalState,
  ambientTempC: number,
  motorCurrentA: number,
  airflowSpeedMs: number,
  dt: number,
): ThermalState {
  const safeDt = Math.min(Math.max(dt, 0.002), 0.1);
  // Amplify thermal time constant slightly so engineers can observe real heating/cooling curves interactively
  const thermalSpeedup = 12.0;
  const effDt = safeDt * thermalSpeedup;

  // Heat generation (Watts):
  // L298N has ~1.8V-2.4V bipolar drop across both bridges + quiescent logic draw
  const pL298n = 0.65 + motorCurrentA * ROBOT_SPECS.l298nDropV + 0.35 * motorCurrentA * motorCurrentA;
  // Each motor gets half the total current: P = I_each^2 * R_m + core losses
  const iEach = motorCurrentA * 0.5;
  const pMotor = 0.25 + iEach * iEach * ROBOT_SPECS.motorResistance;
  const pBuck = 0.45 + 0.18 * motorCurrentA;
  const pMpu = 0.12;

  // Forced convection coefficient (W/K) increases with Reynolds number (U^0.75)
  const uEff = Math.max(0.15, Math.abs(airflowSpeedMs));
  const hL298n = 0.042 + 0.048 * Math.pow(uEff, 0.75); // Multi-fin aluminum heatsink cools effectively in airflow!
  const hMotor = 0.032 + 0.025 * Math.pow(uEff, 0.7);
  const hBuck = 0.022 + 0.015 * Math.pow(uEff, 0.65);
  const hMpu = 0.018 + 0.012 * Math.pow(uEff, 0.6);
  const hChassis = 0.06 + 0.04 * Math.pow(uEff, 0.6);

  // Thermal capacitances (J/K)
  const cL298n = 18.0;
  const cMotor = 36.0;
  const cBuck = 10.0;
  const cMpu = 5.0;
  const cChassis = 85.0;

  // Conductive coupling to chassis plates (W/K)
  const kConductL298n = 0.012;
  const kConductMotor = 0.018;

  const dTL298n =
    (pL298n - hL298n * (state.l298nTempC - ambientTempC) - kConductL298n * (state.l298nTempC - state.chassisTempC)) /
    cL298n;
  const dTMotorL =
    (pMotor - hMotor * (state.motorLeftTempC - ambientTempC) - kConductMotor * (state.motorLeftTempC - state.chassisTempC)) /
    cMotor;
  const dTMotorR =
    (pMotor - hMotor * (state.motorRightTempC - ambientTempC) - kConductMotor * (state.motorRightTempC - state.chassisTempC)) /
    cMotor;
  const dTBuck = (pBuck - hBuck * (state.buckTempC - ambientTempC)) / cBuck;
  const dTMpu = (pMpu - hMpu * (state.mpuTempC - ambientTempC)) / cMpu;

  const heatToChassis =
    kConductL298n * (state.l298nTempC - state.chassisTempC) +
    kConductMotor * (state.motorLeftTempC - state.chassisTempC) +
    kConductMotor * (state.motorRightTempC - state.chassisTempC);
  const dTChassis = (heatToChassis - hChassis * (state.chassisTempC - ambientTempC)) / cChassis;

  const nextL298n = Math.min(125, Math.max(ambientTempC, state.l298nTempC + dTL298n * effDt));
  const nextMotorL = Math.min(115, Math.max(ambientTempC, state.motorLeftTempC + dTMotorL * effDt));
  const nextMotorR = Math.min(115, Math.max(ambientTempC, state.motorRightTempC + dTMotorR * effDt));
  const nextBuck = Math.min(95, Math.max(ambientTempC, state.buckTempC + dTBuck * effDt));
  const nextMpu = Math.min(75, Math.max(ambientTempC, state.mpuTempC + dTMpu * effDt));
  const nextChassis = Math.min(70, Math.max(ambientTempC, state.chassisTempC + dTChassis * effDt));

  const resT = Math.min(
    1,
    (Math.abs(dTL298n) + Math.abs(dTMotorL) + Math.abs(dTChassis)) * 0.02,
  );

  return {
    l298nTempC: nextL298n,
    motorLeftTempC: nextMotorL,
    motorRightTempC: nextMotorR,
    buckTempC: nextBuck,
    mpuTempC: nextMpu,
    chassisTempC: nextChassis,
    residualT: Math.max(1e-5, resT),
  };
}
