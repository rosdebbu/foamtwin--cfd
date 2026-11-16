import test from 'node:test';
import assert from 'node:assert/strict';
import { CfdSolver } from '../cfdSolver';
import {
  applyImpulseGust,
  createInitialBalancingState,
  evaluateBenchBump,
  stepBalancing,
} from '../balancingSolver';
import { createInitialThermalState, stepThermal } from '../thermalSolver';
import { computeStructuralAndAcoustics } from '../acousticsAndStress';
import { sampleColormapRgb255 } from '../colormaps';
import { buildCfdCsvExport, buildCfdVtkExport } from '../exportUtils';
import {
  AUTO_TOUR_STOPS,
  AUTO_TOUR_TOTAL_SEC,
  computeResponsiveCameraFov,
  evaluateAutoTourPose,
  type AutoTourPose,
} from '../autoTour';

test('CFD solver maintains finite fields, blocks solid obstacle, and produces positive drag in freestream', () => {
  const cfd = new CfdSolver();
  cfd.reset(5.0);

  let metrics = cfd.metrics;
  for (let i = 0; i < 20; i++) {
    metrics = cfd.step(5.0, 0, 0.00018, 0, 0, 0.015);
  }

  assert.ok(Number.isFinite(metrics.maxVelocity), 'maxVelocity should be finite');
  assert.ok(metrics.maxVelocity > 2.0, `Expected flow acceleration > 2 m/s, got ${metrics.maxVelocity}`);
  assert.ok(metrics.maxVorticity > 1.0, `Expected wake vorticity > 1 s^-1, got ${metrics.maxVorticity}`);
  assert.ok(metrics.dragForceN > 0, `Expected positive drag force against +Z->-Z wind, got ${metrics.dragForceN}`);

  // Sample inside Tier 2 plate solid core (z=0, y=0.048+0.078=0.126)
  const sample = { uz: 0, uy: 0, pressurePa: 0, vorticity: 0, isSolid: false };
  cfd.sampleField2D(0, 0.126, sample);
  assert.equal(sample.isSolid, true, 'Tier 2 chassis core should be marked solid');
});

test('Self-balancing PID controller stabilizes small initial tilt and recovers from gust impulse', () => {
  let state = createInitialBalancingState(4.5);
  const config = {
    controllerMode: 'pid' as const,
    kp: 2.6,
    ki: 0.8,
    kd: 0.24,
    targetSpeed: 0,
    obstacleDist: 0.45,
    avoidObstacles: false,
  };

  // Run 2.5 seconds of simulation
  for (let i = 0; i < 250; i++) {
    state = stepBalancing(state, config, 0, 0, 0.01);
  }
  assert.equal(state.tippedOver, false, 'Robot should remain upright with tuned PID');
  assert.ok(Math.abs(state.theta) < 0.02, `Expected stabilized tilt < 0.02 rad, got ${state.theta}`);

  // Apply impulse gust
  state = applyImpulseGust(state, 1.5);
  for (let i = 0; i < 250; i++) {
    state = stepBalancing(state, config, 0, 0, 0.01);
  }
  assert.equal(state.tippedOver, false, 'Robot should recover from gust impulse');
  assert.ok(Math.abs(state.theta) < 0.02, `Expected recovery tilt < 0.02 rad, got ${state.theta}`);
});

test('LQR optimal controller stabilizes gust and models 3S battery voltage sag under torque load', () => {
  let state = createInitialBalancingState(6.0);
  const lqrConfig = {
    controllerMode: 'lqr' as const,
    kp: 0,
    ki: 0,
    kd: 0,
    targetSpeed: 0,
    obstacleDist: 0.45,
    avoidObstacles: false,
  };

  state = applyImpulseGust(state, 1.8);
  const firstStep = stepBalancing(state, lqrConfig, 0, 0, 0.01);
  assert.ok(firstStep.batteryVoltage < 11.8, 'Battery voltage should sag under motor load');

  let cur = firstStep;
  for (let i = 0; i < 300; i++) {
    cur = stepBalancing(cur, lqrConfig, 0, 0, 0.01);
  }
  assert.equal(cur.tippedOver, false, 'LQR mode should remain upright');
  assert.ok(Math.abs(cur.theta) < 0.025, `Expected LQR recovery tilt < 0.025 rad, got ${cur.theta}`);
});

test('Bench calibration bump returns physical elevation and zero height when disabled', () => {
  const off = evaluateBenchBump(0.16, false);
  assert.equal(off.height, 0);
  assert.equal(off.slope, 0);

  const peak = evaluateBenchBump(0.16, true);
  assert.ok(peak.height > 0.008, 'Bump crest at z=0.16 should lift axle');
  assert.ok(Math.abs(peak.slope) < 1e-6, 'Slope at Gaussian crest should be ~0');
});

test('Uncontrolled robot (zero PID gains) tips over under gravity', () => {
  let state = createInitialBalancingState(5.0);
  const zeroConfig = {
    controllerMode: 'pid' as const,
    kp: 0,
    ki: 0,
    kd: 0,
    targetSpeed: 0,
    obstacleDist: 0.45,
    avoidObstacles: false,
  };

  for (let i = 0; i < 200; i++) {
    state = stepBalancing(state, zeroConfig, 0, 0, 0.01);
  }
  assert.equal(state.tippedOver, true, 'Robot with zero control torque must tip over');
});

test('Thermal CHT solver heats L298N under load and cools faster at higher wind speed', () => {
  let calmState = createInitialThermalState(24);
  let windyState = createInitialThermalState(24);

  for (let i = 0; i < 120; i++) {
    calmState = stepThermal(calmState, 24, 2.2, 0.2, 0.05);
    windyState = stepThermal(windyState, 24, 2.2, 10.0, 0.05);
  }

  assert.ok(calmState.l298nTempC > 40, `Expected L298N heating > 40C in calm air, got ${calmState.l298nTempC}`);
  assert.ok(
    windyState.l298nTempC < calmState.l298nTempC,
    `Expected forced convection (10 m/s) to cool L298N below calm air (${windyState.l298nTempC} vs ${calmState.l298nTempC})`,
  );
});

test('Structural stress and HC-SR04 ultrasonic acoustics respond physically', () => {
  const nominal = computeStructuralAndAcoustics(0, 0, 0.05, 0.02, 0, 0.45);
  const closeWall = computeStructuralAndAcoustics(0.02, 0.1, 0.1, 0, 0, 0.25);
  const excessiveTilt = computeStructuralAndAcoustics(0.50, 1.0, 0.5, 0, 0, 0.25);
  const loaded = computeStructuralAndAcoustics(0.25, 2.0, 0.75, 0.8, 0, 0.45);

  assert.ok(loaded.maxStressMpa > nominal.maxStressMpa, 'Loaded state should have higher Von Mises stress');
  assert.ok(nominal.ultrasonicMeasuredCm > 30 && nominal.ultrasonicMeasuredCm < 45, 'Expected HC-SR04 distance ~37.6cm');
  assert.equal(nominal.sensorWorking, true, 'Sensor should report working within beam cone');
  assert.equal(closeWall.obstacleDetected, true, 'Obstacle within 30cm should trigger obstacleDetected');
  assert.equal(excessiveTilt.sensorWorking, false, 'Excessive tilt > 18 deg loses reflected echo');

  // Verify ultrasonic obstacle avoidance reverses forward velocity near wall
  let state = createInitialBalancingState(0);
  const avoidConfig = {
    controllerMode: 'pid' as const,
    kp: 2.6,
    ki: 0.8,
    kd: 0.24,
    targetSpeed: 0.15,
    obstacleDist: 0.23,
    avoidObstacles: true,
  };
  for (let i = 0; i < 140; i++) {
    state = stepBalancing(state, avoidConfig, 0, 0, 0.01);
  }
  assert.equal(state.tippedOver, false, 'Robot should remain upright during sonar avoidance');
  assert.ok(state.z < 0.01, `Expected robot to back away from close obstacle at 0.23m, got z=${state.z}`);
});

test('Scientific colormaps and VTK/CSV exporters produce valid formatted output', () => {
  const low = sampleColormapRgb255('coolwarm', 0);
  const high = sampleColormapRgb255('coolwarm', 1);
  assert.ok(low[2] > low[0], 'Coolwarm low end should be blue-dominant');
  assert.ok(high[0] > high[2], 'Coolwarm high end should be red-dominant');

  const cfd = new CfdSolver();
  const thermal = createInitialThermalState(24);
  const params = {
    preset: 'wind-tunnel' as const,
    field: 'velocity' as const,
    colormap: 'coolwarm' as const,
    windSpeed: 6,
    viscosity: 0.00035,
    ambientTemp: 24,
    controllerMode: 'pid' as const,
    kp: 2.6,
    ki: 0.8,
    kd: 0.24,
    targetSpeed: 0,
    obstacleDist: 0.4,
    benchBump: false,
    explodedView: 0,
    sliceOffsetX: 0,
    timeScale: 1,
    paused: false,
  };
  const vtk = buildCfdVtkExport(cfd, thermal, params);
  const csv = buildCfdCsvExport(cfd, thermal, params);
  assert.ok(vtk.includes('DATASET STRUCTURED_POINTS') && vtk.includes('VECTORS U float'));
  assert.ok(csv.startsWith('z_m,y_m,u_z_ms') && csv.split('\n').length > 100);
});

test('Auto-Tour choreography transitions smoothly across presets and loops continuously', () => {
  const pose: AutoTourPose = {
    stopIndex: 0,
    totalStops: 0,
    preset: 'iso',
    label: '',
    subtitle: '',
    posX: 0,
    posY: 0,
    posZ: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };

  evaluateAutoTourPose(0, 0, pose);
  assert.equal(pose.stopIndex, 0);
  assert.equal(pose.totalStops, AUTO_TOUR_STOPS.length);
  assert.ok(Number.isFinite(pose.posX) && Number.isFinite(pose.posY) && Number.isFinite(pose.posZ));

  // Verify continuity at loop boundary (t = total - 0.001 vs t = 0)
  const endPose: AutoTourPose = { ...pose };
  evaluateAutoTourPose(AUTO_TOUR_TOTAL_SEC - 0.001, 0, endPose);
  assert.equal(endPose.stopIndex, AUTO_TOUR_STOPS.length - 1);

  const startPose: AutoTourPose = { ...pose };
  evaluateAutoTourPose(0.001, 0, startPose);
  const boundaryJump = Math.hypot(
    startPose.posX - endPose.posX,
    startPose.posY - endPose.posY,
    startPose.posZ - endPose.posZ,
  );
  assert.ok(boundaryJump < 0.05, `Expected smooth loop wrap-around, got jump ${boundaryJump}`);

  // Verify mid-tour visits later stops (e.g. side, hcsr04, l298n, top)
  const midPose: AutoTourPose = { ...pose };
  evaluateAutoTourPose(AUTO_TOUR_TOTAL_SEC * 0.5, 0.05, midPose);
  assert.ok(midPose.stopIndex >= 2 && midPose.stopIndex <= 5);
  assert.ok(midPose.targetZ !== 0 || midPose.preset === 'wide');
});

test('Responsive camera FOV adapts for portrait phone screens while preserving desktop FOV', () => {
  const desktopFov = computeResponsiveCameraFov(1280 / 800);
  const phoneFov = computeResponsiveCameraFov(390 / 800);
  assert.equal(desktopFov, 40);
  assert.ok(phoneFov > 48 && phoneFov <= 54, `Expected wider portrait FOV, got ${phoneFov}`);
});

