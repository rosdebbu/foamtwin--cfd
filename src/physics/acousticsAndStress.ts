/**
 * Structural Von Mises Stress Proxy & HC-SR04 Ultrasonic Acoustic Time-of-Flight Model
 */

export interface StructuralAndAcousticMetrics {
  standoffStressMpa: number;
  plateBendingMpa: number;
  maxStressMpa: number;
  ultrasonicMeasuredCm: number;
  echoRoundTripMs: number;
  sensorWorking: boolean;
  obstacleDetected: boolean;
}

export function computeStructuralAndAcoustics(
  pitchRad: number,
  omegaRadPerSec: number,
  torqueNm: number,
  aeroDragN: number,
  robotZ: number,
  obstacleWallZ: number,
): StructuralAndAcousticMetrics {
  // Static gravity + dynamic inertial bending on the 4 M3 brass standoffs (diameter 5mm)
  const totalUpperMassKg = 0.64;
  const gForce = totalUpperMassKg * 9.81;
  const lateralLoadN = Math.abs(gForce * Math.sin(pitchRad)) + Math.abs(aeroDragN) + Math.abs(torqueNm) * 4.2 + Math.abs(omegaRadPerSec) * 0.85;

  // Bending moment on 4 parallel cantilever standoffs (length ~0.11m, section modulus W = pi*d^3/32)
  const d = 0.005;
  const sectionModulus = (Math.PI * Math.pow(d, 3)) / 32;
  const momentPerStandoff = (lateralLoadN * 0.055) / 4;
  const bendingStressPa = momentPerStandoff / sectionModulus;
  const axialStressPa = (gForce * Math.cos(pitchRad)) / (4 * Math.PI * 0.0025 * 0.0025);
  const standoffStressMpa = Math.min(14, (bendingStressPa + axialStressPa) / 1e6 + 0.45);

  const plateBendingMpa = Math.min(10, 0.35 + Math.abs(torqueNm) * 2.4 + Math.abs(Math.sin(pitchRad)) * 2.8);
  const maxStressMpa = Math.max(standoffStressMpa, plateBendingMpa);

  // HC-SR04 sensor sits at local z = +0.074m, y = +0.036m above axle
  const sensorWorldZ = robotZ + 0.074 * Math.cos(pitchRad) + 0.036 * Math.sin(pitchRad);
  const rawDistM = Math.max(0.02, obstacleWallZ - sensorWorldZ);
  // Speed of sound in air ~ 343 m/s; beam misses reflector if tilted beyond +-18 deg
  const beamAligned = Math.abs(pitchRad) <= 0.32;
  const inRange = rawDistM >= 0.02 && rawDistM <= 4.0;
  const sensorWorking = beamAligned && inRange;
  const tiltAttenuation = !beamAligned ? 1.45 : 1.0 / Math.max(0.7, Math.cos(pitchRad));
  const effectiveDistM = Math.min(4.0, rawDistM * tiltAttenuation);
  const echoRoundTripMs = ((2 * effectiveDistM) / 343.0) * 1000;
  const obstacleDetected = sensorWorking && effectiveDistM <= 0.30;

  return {
    standoffStressMpa,
    plateBendingMpa,
    maxStressMpa,
    ultrasonicMeasuredCm: effectiveDistM * 100,
    echoRoundTripMs,
    sensorWorking,
    obstacleDetected,
  };
}
