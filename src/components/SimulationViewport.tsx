import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CfdSolver } from '../physics/cfdSolver';
import {
  applyImpulseGust,
  createInitialBalancingState,
  stepBalancing,
  type BalancingState,
} from '../physics/balancingSolver';
import {
  createInitialThermalState,
  stepThermal,
  type ThermalState,
} from '../physics/thermalSolver';
import { computeStructuralAndAcoustics } from '../physics/acousticsAndStress';
import {
  CAMERA_PRESETS,
  computeResponsiveCameraFov,
  evaluateAutoTourPose,
  type AutoTourPose,
} from '../physics/autoTour';
import { buildCfdCsvExport, buildCfdVtkExport } from '../physics/exportUtils';
import type {
  CameraPreset,
  InspectablePartId,
  LightingPreset,
  PipelineVisibility,
  ProbePinData,
  SimulationParams,
  TelemetrySample,
} from '../physics/types';
import { createProceduralTextures } from '../three/proceduralTextures';
import { buildRobotDigitalTwin, type RobotPartRegion } from '../three/robotBuilder';
import { createParaviewLayers } from '../three/paraviewLayers';
import {
  buildLabEnvironment,
  buildStudioEnvironmentScene,
} from '../three/labEnvironment';

export interface SimulationViewportHandle {
  applyGustNudge: (strength?: number) => void;
  resetSimulation: () => void;
  flyToPreset: (preset: CameraPreset) => void;
  captureScreenshot: () => string | null;
  exportVtk: () => string;
  exportCsv: () => string;
}

export interface HoverProbeInfo {
  part: InspectablePartId | null;
  worldX: number;
  worldY: number;
  worldZ: number;
}

export interface AutoTourStepInfo {
  index: number;
  total: number;
  preset: CameraPreset;
  label: string;
  subtitle: string;
}

interface SimulationViewportProps {
  params: SimulationParams;
  visibility: PipelineVisibility;
  lightingPreset: LightingPreset;
  turntable: boolean;
  autoTour: boolean;
  probeMode: boolean;
  probePin: ProbePinData | null;
  onTelemetry: (sample: TelemetrySample, tippedOver: boolean) => void;
  onHoverProbe?: (info: HoverProbeInfo | null) => void;
  onSelectPart?: (part: InspectablePartId) => void;
  onDropProbe?: (pin: ProbePinData) => void;
  onAutoTourStep?: (info: AutoTourStepInfo) => void;
  onCancelAutoTour?: () => void;
}

const LIGHTING_CONFIGS: Record<
  LightingPreset,
  {
    bgHex: number;
    fogDensity: number;
    exposure: number;
    hemiSky: number;
    hemiGround: number;
    hemiIntensity: number;
    keyColor: number;
    keyIntensity: number;
    rimColor: number;
    rimIntensity: number;
    bounceIntensity: number;
  }
> = {
  bench: {
    bgHex: 0x16181c,
    fogDensity: 0.20,
    exposure: 1.18,
    hemiSky: 0xd6e2f2,
    hemiGround: 0x262420,
    hemiIntensity: 0.72,
    keyColor: 0xfff3e2,
    keyIntensity: 2.25,
    rimColor: 0xa5c8ee,
    rimIntensity: 0.92,
    bounceIntensity: 0.44,
  },
  tunnel: {
    bgHex: 0x0d0f13,
    fogDensity: 0.30,
    exposure: 1.06,
    hemiSky: 0xa4bddc,
    hemiGround: 0x14171d,
    hemiIntensity: 0.48,
    keyColor: 0xfff0d6,
    keyIntensity: 1.95,
    rimColor: 0x8cc8ff,
    rimIntensity: 0.95,
    bounceIntensity: 0.28,
  },
  macro: {
    bgHex: 0x202329,
    fogDensity: 0.14,
    exposure: 1.28,
    hemiSky: 0xf4f6fa,
    hemiGround: 0x333438,
    hemiIntensity: 0.92,
    keyColor: 0xfffaf2,
    keyIntensity: 2.35,
    rimColor: 0xd2e3f5,
    rimIntensity: 1.05,
    bounceIntensity: 0.62,
  },
};

function mapRegionToInspectable(region: RobotPartRegion): InspectablePartId {
  switch (region) {
    case 'l298n':
      return 'l298n';
    case 'hcsr04':
      return 'hcsr04';
    case 'buck':
      return 'buck';
    case 'bt':
      return 'bt';
    case 'mpu':
      return 'mpu';
    case 'motorLeft':
    case 'motorRight':
      return 'motors';
    case 'wheels':
      return 'wheels';
    case 'standoffs':
      return 'standoffs';
    case 'counterweight':
      return 'counterweight';
    case 'plate1':
    case 'plate2':
    case 'plate3':
    default:
      return 'chassis';
  }
}

export function getCameraPresetForPart(part: InspectablePartId): CameraPreset {
  switch (part) {
    case 'l298n':
      return 'l298n';
    case 'hcsr04':
      return 'hcsr04';
    case 'buck':
      return 'tier2';
    case 'bt':
      return 'bt';
    case 'mpu':
      return 'mpu';
    case 'motors':
    case 'wheels':
      return 'motors';
    case 'counterweight':
      return 'counterweight';
    case 'standoffs':
    case 'chassis':
    default:
      return 'iso';
  }
}

const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _benchPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _sliceFallbackPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
const _planeHit = new THREE.Vector3();
const _probeField2D = { uz: 0, uy: 0, pressurePa: 0, vorticity: 0, isSolid: false };
const _probeFlow3D = { ux: 0, uy: 0, uz: 0, speed: 0 };
const _tourPose: AutoTourPose = {
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

export const SimulationViewport = forwardRef<
  SimulationViewportHandle,
  SimulationViewportProps
>(function SimulationViewport(
  {
    params,
    visibility,
    lightingPreset,
    turntable,
    autoTour,
    probeMode,
    probePin,
    onTelemetry,
    onHoverProbe,
    onSelectPart,
    onDropProbe,
    onAutoTourStep,
    onCancelAutoTour,
  },
  ref,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const paramsRef = useRef<SimulationParams>(params);
  const visibilityRef = useRef<PipelineVisibility>(visibility);
  const lightingRef = useRef<LightingPreset>(lightingPreset);
  const turntableRef = useRef<boolean>(turntable);
  const autoTourRef = useRef<boolean>(autoTour);
  const probeModeRef = useRef<boolean>(probeMode);
  const probePinRef = useRef<ProbePinData | null>(probePin);
  const onTelemetryRef = useRef(onTelemetry);
  const onHoverProbeRef = useRef(onHoverProbe);
  const onSelectPartRef = useRef(onSelectPart);
  const onDropProbeRef = useRef(onDropProbe);
  const onAutoTourStepRef = useRef(onAutoTourStep);
  const onCancelAutoTourRef = useRef(onCancelAutoTour);

  paramsRef.current = params;
  visibilityRef.current = visibility;
  lightingRef.current = lightingPreset;
  turntableRef.current = turntable;
  autoTourRef.current = autoTour;
  probeModeRef.current = probeMode;
  probePinRef.current = probePin;
  onTelemetryRef.current = onTelemetry;
  onHoverProbeRef.current = onHoverProbe;
  onSelectPartRef.current = onSelectPart;
  onDropProbeRef.current = onDropProbe;
  onAutoTourStepRef.current = onAutoTourStep;
  onCancelAutoTourRef.current = onCancelAutoTour;

  // Mutable simulation handles accessible to imperative methods
  const simStateRef = useRef<{
    cfd: CfdSolver;
    balance: BalancingState;
    thermal: ThermalState;
    elapsed: number;
    cameraGoal: {
      active: boolean;
      pos: THREE.Vector3;
      target: THREE.Vector3;
    };
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
  }>({
    cfd: new CfdSolver(),
    balance: createInitialBalancingState(3.2),
    thermal: createInitialThermalState(24),
    elapsed: 0,
    cameraGoal: {
      active: false,
      pos: new THREE.Vector3(...CAMERA_PRESETS.iso.pos),
      target: new THREE.Vector3(...CAMERA_PRESETS.iso.target),
    },
  });

  useImperativeHandle(ref, () => ({
    applyGustNudge(strength = 2.0) {
      simStateRef.current.balance = applyImpulseGust(
        simStateRef.current.balance,
        strength,
      );
    },
    resetSimulation() {
      const p = paramsRef.current;
      simStateRef.current.cfd.reset(p.windSpeed);
      simStateRef.current.balance = createInitialBalancingState(3.2);
      simStateRef.current.thermal = createInitialThermalState(p.ambientTemp);
      simStateRef.current.elapsed = 0;
    },
    flyToPreset(preset: CameraPreset) {
      const cfg = CAMERA_PRESETS[preset];
      const zOff = preset === 'wide' ? 0 : simStateRef.current.balance.z;
      simStateRef.current.cameraGoal.pos.set(cfg.pos[0], cfg.pos[1], cfg.pos[2] + zOff);
      simStateRef.current.cameraGoal.target.set(cfg.target[0], cfg.target[1], cfg.target[2] + zOff);
      simStateRef.current.cameraGoal.active = true;
    },
    captureScreenshot() {
      const { renderer, scene, camera } = simStateRef.current;
      if (!renderer || !scene || !camera) return null;
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
    exportVtk() {
      return buildCfdVtkExport(
        simStateRef.current.cfd,
        simStateRef.current.thermal,
        paramsRef.current,
      );
    },
    exportCsv() {
      return buildCfdCsvExport(
        simStateRef.current.cfd,
        simStateRef.current.thermal,
        paramsRef.current,
      );
    },
  }));

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL (SwiftShader / llvmpipe / WARP) for frame pacing & cost guard
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const isMobileDevice =
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches) ||
      width < 768;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      preserveDrawingBuffer: isSoftwareGl,
      powerPreference: 'high-performance',
    });
    const initialLightCfg = LIGHTING_CONFIGS[lightingRef.current];
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = initialLightCfg.exposure;
    renderer.setPixelRatio(
      isSoftwareGl
        ? 1
        : Math.min(window.devicePixelRatio, isMobileDevice ? 1.5 : 2),
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialLightCfg.bgHex);
    scene.fog = new THREE.FogExp2(initialLightCfg.bgHex, initialLightCfg.fogDensity);

    // Macro-capable near plane (3mm) + portrait-adaptive optical lens FOV
    const initAspect = width / Math.max(1, height);
    const camera = new THREE.PerspectiveCamera(
      computeResponsiveCameraFov(initAspect, 40),
      initAspect,
      0.003,
      25,
    );
    camera.position.set(...CAMERA_PRESETS.iso.pos);

    simStateRef.current.renderer = renderer;
    simStateRef.current.scene = scene;
    simStateRef.current.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.iso.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.045;
    controls.maxDistance = 2.6;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotate = turntableRef.current;
    controls.autoRotateSpeed = 1.4;
    controls.update();

    controls.addEventListener('start', () => {
      simStateRef.current.cameraGoal.active = false;
      if (autoTourRef.current) {
        onCancelAutoTourRef.current?.();
      }
    });

    // Procedural Studio Softbox IBL for realistic brass/aluminum/PCB reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const studioEnvScene = buildStudioEnvironmentScene();
    const envRT = pmremGenerator.fromScene(studioEnvScene, 0.03);
    scene.environment = envRT.texture;
    studioEnvScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    pmremGenerator.dispose();

    // 3-Point Laboratory Lighting Rig + Under-Chassis Bench Bounce
    const hemiLight = new THREE.HemisphereLight(
      initialLightCfg.hemiSky,
      initialLightCfg.hemiGround,
      initialLightCfg.hemiIntensity,
    );
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      initialLightCfg.keyColor,
      initialLightCfg.keyIntensity,
    );
    keyLight.position.set(0.65, 1.15, 0.62);
    keyLight.castShadow = !isSoftwareGl;
    const shadowRes = isMobileDevice ? 1024 : 2048;
    keyLight.shadow.mapSize.set(shadowRes, shadowRes);
    keyLight.shadow.camera.near = 0.2;
    keyLight.shadow.camera.far = 3.0;
    const d = 0.38;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.00035;
    keyLight.shadow.normalBias = 0.012;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      initialLightCfg.rimColor,
      initialLightCfg.rimIntensity,
    );
    rimLight.position.set(-0.65, 0.55, -0.75);
    scene.add(rimLight);

    // Subtle fill light angled gently from front-left so coaxial motors stay legible without creating table glare
    const bounceLight = new THREE.DirectionalLight(
      0xe6eef8,
      initialLightCfg.bounceIntensity,
    );
    bounceLight.position.set(-0.45, 0.16, 0.75);
    scene.add(bounceLight);

    // Procedural Textures
    const maxAniso = isSoftwareGl
      ? 1
      : renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextures(maxAniso);

    // Physical Optical Breadboard Workbench + Wind-Tunnel Intake Rig
    const labEnv = buildLabEnvironment(textures);
    scene.add(labEnv.group);

    // Grounded wheel + chassis ambient contact shadow
    const shadowDiscGeo = new THREE.PlaneGeometry(0.28, 0.22);
    shadowDiscGeo.rotateX(-Math.PI / 2);
    const shadowDiscMat = new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
    contactShadow.position.y = 0.0012;
    scene.add(contactShadow);

    // Subtle Coordinate Axis Triad on optical table corner
    const axesHelper = new THREE.AxesHelper(0.075);
    axesHelper.position.set(-0.26, 0.002, 0.42);
    scene.add(axesHelper);

    // Build Hero 3D Robot Digital Twin + ParaView Post-Processing Layers
    const robot = buildRobotDigitalTwin(textures);
    scene.add(robot.root);

    const pvLayers = createParaviewLayers(simStateRef.current.cfd, textures);
    scene.add(pvLayers.group);

    // Pre-warm shaders on GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Warm up CFD solver slightly only when wind or CFD visualization layers are active
    if (
      Math.abs(paramsRef.current.windSpeed) >= 0.05 ||
      visibilityRef.current.cfdSlice ||
      visibilityRef.current.xzWakeSlice ||
      visibilityRef.current.streamlines ||
      visibilityRef.current.vectorGlyphs
    ) {
      for (let w = 0; w < 10; w++) {
        simStateRef.current.cfd.step(
          paramsRef.current.windSpeed,
          0,
          paramsRef.current.viscosity,
          simStateRef.current.balance.theta,
          paramsRef.current.explodedView,
          0.015,
        );
      }
    }

    // Context lost listener
    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    // Resize observer
    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const aspect = w / Math.max(1, h);
      camera.aspect = aspect;
      camera.fov = computeResponsiveCameraFov(aspect, 40);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Pointer click & hover raycasting for hardware inspection
    let downX = 0;
    let downY = 0;
    let lastProbeTime = 0;
    const handlePointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const handlePointerUp = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx * dx + dy * dy > 25) return; // Drag orbit, not a click
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);

      // 1. Virtual Pitot Field Probe Mode (or Alt+Click)
      if (probeModeRef.current || e.altKey) {
        const targets: THREE.Object3D[] = [];
        if (pvLayers.sliceMesh.visible) targets.push(pvLayers.sliceMesh);
        if (pvLayers.xzWakeMesh.visible) targets.push(pvLayers.xzWakeMesh);
        const sliceHits = targets.length > 0 ? _raycaster.intersectObjects(targets, false) : [];
        let gotPoint = false;
        if (sliceHits.length > 0) {
          _planeHit.copy(sliceHits[0].point);
          gotPoint = true;
        } else {
          _sliceFallbackPlane.constant = -paramsRef.current.sliceOffsetX;
          if (_raycaster.ray.intersectPlane(_sliceFallbackPlane, _planeHit)) {
            gotPoint = true;
          }
        }
        if (gotPoint) {
          const cfd = simStateRef.current.cfd;
          const th = simStateRef.current.thermal;
          const p = paramsRef.current;
          const px = Math.max(-0.22, Math.min(0.22, _planeHit.x));
          const py = Math.max(cfd.yMin + 0.01, Math.min(cfd.yMax - 0.01, _planeHit.y));
          const pz = Math.max(cfd.zMin + 0.01, Math.min(cfd.zMax - 0.01, _planeHit.z));
          cfd.sampleField2D(pz, py, _probeField2D);
          cfd.sampleFlow3D(px, py, pz, p.windSpeed, _probeFlow3D);
          const dzWake = Math.max(0, 0.04 - pz);
          const heatSourceTop = Math.exp(-Math.pow((py - 0.19) / 0.055, 2)) * (th.l298nTempC - p.ambientTemp);
          const heatSourceBot = Math.exp(-Math.pow((py - 0.05) / 0.04, 2)) * (th.motorLeftTempC - p.ambientTemp);
          const downstreamDecay = pz < 0.06 ? Math.exp(-dzWake * 3.8) : Math.exp(-Math.pow((pz - 0.06) / 0.04, 2));
          const tempC = _probeField2D.isSolid
            ? th.l298nTempC
            : p.ambientTemp + (heatSourceTop + heatSourceBot * 0.7) * downstreamDecay;
          onDropProbeRef.current?.({
            active: true,
            x: px,
            y: py,
            z: pz,
            speedMs: _probeFlow3D.speed,
            pressurePa: _probeField2D.pressurePa,
            tempC,
          });
          return;
        }
      }

      // 2. Shift+Click physical shove impulse on robot chassis
      const hits = _raycaster.intersectObjects(robot.interactables, false);
      if (hits.length > 0 && e.shiftKey) {
        const pushDir = hits[0].point.z >= simStateRef.current.balance.z ? -2.2 : 2.2;
        simStateRef.current.balance = applyImpulseGust(simStateRef.current.balance, pushDir);
        return;
      }

      // 3. Click-to-inspect hardware subsystem
      if (hits.length > 0) {
        const region = (hits[0].object.userData.partId as RobotPartRegion) ?? 'other';
        const partId = mapRegionToInspectable(region);
        onSelectPartRef.current?.(partId);
        const camPreset = getCameraPresetForPart(partId);
        const cfg = CAMERA_PRESETS[camPreset];
        const robotZ = simStateRef.current.balance.z;
        simStateRef.current.cameraGoal.pos.set(cfg.pos[0], cfg.pos[1], cfg.pos[2] + robotZ);
        simStateRef.current.cameraGoal.target.set(cfg.target[0], cfg.target[1], cfg.target[2] + robotZ);
        simStateRef.current.cameraGoal.active = true;
      }
    };
    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastProbeTime < 55) return;
      lastProbeTime = now;
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);
      const hits = _raycaster.intersectObjects(robot.interactables, false);
      if (hits.length > 0) {
        const h = hits[0];
        const region = (h.object.userData.partId as RobotPartRegion) ?? 'other';
        robot.setHighlightedPart(region);
        onHoverProbeRef.current?.({
          part: mapRegionToInspectable(region),
          worldX: h.point.x,
          worldY: h.point.y,
          worldZ: h.point.z,
        });
      } else {
        robot.setHighlightedPart(null);
        if (onHoverProbeRef.current && _raycaster.ray.intersectPlane(_benchPlane, _planeHit)) {
          onHoverProbeRef.current({
            part: null,
            worldX: _planeHit.x,
            worldY: 0,
            worldZ: _planeHit.z,
          });
        }
      }
    };
    const handlePointerLeave = () => {
      robot.setHighlightedPart(null);
      onHoverProbeRef.current?.(null);
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    // Animation & Coupled Multi-Physics Loop
    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let lastTelemetryPush = 0;
    let smoothedExploded = paramsRef.current.explodedView;
    let activeLighting = lightingRef.current;
    let wasAutoTour = autoTourRef.current;
    let tourElapsed = 0;
    let lastTourStopIdx = -1;
    let cfdGridAccum = 0.05; // Force immediate CFD + layer build on frame 0
    let lastGridKey = '';

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(() => {
            if (!disposed) {
              frameId = requestAnimationFrame(cb);
            }
          }, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const wallDt = Math.max(0.001, (now - lastTime) / 1000);
      const rawDt = Math.min(0.05, wallDt);
      lastTime = now;

      const p = paramsRef.current;
      const vis = visibilityRef.current;
      const sim = simStateRef.current;
      const simDt = p.paused ? 0 : Math.min(0.025, rawDt) * p.timeScale;

      const gridKey = `${p.field}:${p.colormap}:${p.windSpeed}:${p.sliceOffsetX}:${vis.cfdSlice}:${vis.xzWakeSlice}:${vis.streamlines}:${vis.vectorGlyphs}:${vis.thermalOverlay}`;
      const gridParamsChanged = gridKey !== lastGridKey;
      lastGridKey = gridKey;
      cfdGridAccum += rawDt;
      const cfdCadence = isMobileDevice ? 0.032 : 0.0;
      const shouldStepCfd = cfdGridAccum >= cfdCadence || gridParamsChanged;

      const windOrCfdVisible =
        vis.cfdSlice ||
        vis.xzWakeSlice ||
        vis.streamlines ||
        vis.vectorGlyphs ||
        vis.openfoamMesh;
      labEnv.setWindTunnelVisible(windOrCfdVisible);
      const cfdNeeded =
        Math.abs(p.windSpeed) >= 0.05 ||
        vis.cfdSlice ||
        vis.xzWakeSlice ||
        vis.streamlines ||
        vis.vectorGlyphs;

      if (simDt > 0) {
        sim.elapsed += simDt;

        // 1. Step Navier-Stokes CFD Solver (skipped cleanly when calm & CFD layers hidden)
        if (cfdNeeded && shouldStepCfd) {
          const cfdDt = isMobileDevice ? Math.min(0.025, cfdGridAccum * p.timeScale) : simDt;
          sim.cfd.step(
            p.windSpeed,
            sim.balance.v,
            p.viscosity,
            sim.balance.theta,
            smoothedExploded,
            cfdDt,
            isMobileDevice ? 12 : 18,
          );
        } else if (!cfdNeeded) {
          sim.cfd.metrics.aeroForceZ = 0;
          sim.cfd.metrics.dragForceN = 0;
          sim.cfd.metrics.pitchMomentNm = 0;
        }

        // 2. Step Self-Balancing Inverted Pendulum + PID/LQR Controller + Bench Bump
        sim.balance = stepBalancing(
          sim.balance,
          {
            controllerMode: p.controllerMode,
            kp: p.kp,
            ki: p.ki,
            kd: p.kd,
            targetSpeed: p.targetSpeed,
            obstacleDist: p.obstacleDist,
            avoidObstacles: p.preset === 'ultrasonic-nav',
            benchBump: p.benchBump,
          },
          sim.cfd.metrics.aeroForceZ,
          sim.cfd.metrics.pitchMomentNm,
          simDt,
        );

        // 3. Step Conjugate Heat Transfer (CHT) Thermal Solver
        const effectiveAirflow = Math.abs(p.windSpeed + sim.balance.v);
        sim.thermal = stepThermal(
          sim.thermal,
          p.ambientTemp,
          sim.balance.motorCurrent,
          effectiveAirflow,
          simDt,
        );
      }

      // 4. Compute Structural Stress & HC-SR04 Ultrasonic Time-of-Flight
      const structAcoustics = computeStructuralAndAcoustics(
        sim.balance.theta,
        sim.balance.omega,
        sim.balance.torqueNm,
        sim.cfd.metrics.dragForceN,
        sim.balance.z,
        p.obstacleDist,
      );

      // 5. Smoothly damp exploded view & update robot pose + signal pulses
      smoothedExploded = THREE.MathUtils.damp(
        smoothedExploded,
        p.explodedView,
        8,
        rawDt,
      );
      robot.setExploded(smoothedExploded);
      robot.root.visible = vis.robotMesh;
      robot.root.position.y = sim.balance.yOffset;
      robot.root.position.z = sim.balance.z;
      robot.bodyPivot.rotation.x = sim.balance.theta;
      robot.leftWheel.rotation.x = sim.balance.wheelAngle;
      robot.rightWheel.rotation.x = sim.balance.wheelAngle;
      contactShadow.position.y = 0.0012 + sim.balance.yOffset;
      contactShadow.position.z = sim.balance.z;
      const sensorActive = vis.acousticCone;
      const sensorWorking = structAcoustics.sensorWorking && !sim.balance.tippedOver;
      const obstacleDetected = structAcoustics.obstacleDetected && !sim.balance.tippedOver;

      robot.setWireframeVisible(vis.openfoamMesh);
      robot.updateSignalPulses(vis.signalPulses, sim.elapsed, sim.balance.motorCurrent);
      robot.updateHcsrStatus(sensorActive, sensorWorking, obstacleDetected, sim.elapsed);

      robot.applyFieldVisualization(
        p.field,
        p.colormap,
        sim.thermal,
        structAcoustics,
        p.windSpeed,
        p.ambientTemp,
      );

      // 6. Update ParaView 3D Layers (advect wind tracers at 60fps; rebuild grid textures at CFD cadence)
      pvLayers.update(
        sim.cfd,
        sim.thermal,
        p,
        vis,
        sim.balance.z,
        sim.balance.theta,
        sim.balance.torqueNm,
        rawDt,
        sim.elapsed,
        probePinRef.current,
        shouldStepCfd,
        sensorWorking,
        obstacleDetected,
      );
      if (shouldStepCfd) {
        cfdGridAccum = 0;
      }

      // 7. Apply live lighting rig switches, turntable orbit, and smooth camera transitions
      if (lightingRef.current !== activeLighting) {
        activeLighting = lightingRef.current;
        const lc = LIGHTING_CONFIGS[activeLighting];
        scene.background = new THREE.Color(lc.bgHex);
        scene.fog = new THREE.FogExp2(lc.bgHex, lc.fogDensity);
        renderer.toneMappingExposure = lc.exposure;
        hemiLight.color.setHex(lc.hemiSky);
        hemiLight.groundColor.setHex(lc.hemiGround);
        hemiLight.intensity = lc.hemiIntensity;
        keyLight.color.setHex(lc.keyColor);
        keyLight.intensity = lc.keyIntensity;
        rimLight.color.setHex(lc.rimColor);
        rimLight.intensity = lc.rimIntensity;
        bounceLight.intensity = lc.bounceIntensity;
      }

      controls.autoRotate =
        turntableRef.current && !sim.cameraGoal.active && !autoTourRef.current;

      if (autoTourRef.current) {
        const isFirstTourFrame = !wasAutoTour;
        if (isFirstTourFrame) {
          tourElapsed = 0;
          lastTourStopIdx = -1;
          sim.cameraGoal.active = false;
        }
        wasAutoTour = true;
        const tourDt = Math.min(0.25, wallDt);
        tourElapsed += tourDt;
        const isPortrait = camera.aspect < 0.78;
        evaluateAutoTourPose(
          tourElapsed,
          sim.balance.z,
          _tourPose,
          isPortrait ? 1.38 : 1.0,
          isPortrait ? 0.055 : 0.0,
        );

        _camTargetPos.set(_tourPose.posX, _tourPose.posY, _tourPose.posZ);
        _camTargetLook.set(_tourPose.targetX, _tourPose.targetY, _tourPose.targetZ);
        if (isFirstTourFrame && isPortrait) {
          camera.position.copy(_camTargetPos);
          controls.target.copy(_camTargetLook);
        } else {
          const blendAlpha = 1 - Math.exp(-6.5 * tourDt);
          camera.position.lerp(_camTargetPos, blendAlpha);
          controls.target.lerp(_camTargetLook, blendAlpha);
        }

        if (_tourPose.stopIndex !== lastTourStopIdx) {
          lastTourStopIdx = _tourPose.stopIndex;
          onAutoTourStepRef.current?.({
            index: _tourPose.stopIndex,
            total: _tourPose.totalStops,
            preset: _tourPose.preset,
            label: _tourPose.label,
            subtitle: _tourPose.subtitle,
          });
        }
      } else {
        wasAutoTour = false;
        lastTourStopIdx = -1;
        if (sim.cameraGoal.active) {
          const alpha = 1 - Math.exp(-6.5 * rawDt);
          _camTargetPos.copy(sim.cameraGoal.pos);
          _camTargetLook.copy(sim.cameraGoal.target);
          camera.position.lerp(_camTargetPos, alpha);
          controls.target.lerp(_camTargetLook, alpha);
          if (
            camera.position.distanceTo(_camTargetPos) < 0.004 &&
            controls.target.distanceTo(_camTargetLook) < 0.004
          ) {
            sim.cameraGoal.active = false;
          }
        }
      }

      controls.update();
      renderer.render(scene, camera);

      // 8. Push throttled telemetry (~10Hz) to React UI
      if (now - lastTelemetryPush >= 100) {
        lastTelemetryPush = now;
        const wheelRpm = ((sim.balance.v / 0.048) * 60) / (Math.PI * 2);
        onTelemetryRef.current(
          {
            time: sim.elapsed,
            pitchDeg: (sim.balance.theta * 180) / Math.PI,
            wheelRpm,
            positionZ: sim.balance.z,
            motorCurrent: sim.balance.motorCurrent,
            batteryVoltage: sim.balance.batteryVoltage,
            aeroDragMn: sim.cfd.metrics.dragForceN * 1000,
            l298nTempC: sim.thermal.l298nTempC,
            motorTempC: sim.thermal.motorLeftTempC,
            maxStressMpa: structAcoustics.maxStressMpa,
            ultrasonicCm: structAcoustics.ultrasonicMeasuredCm,
            sensorWorking: structAcoustics.sensorWorking && !sim.balance.tippedOver,
            resP: sim.cfd.metrics.residualP,
            resU: sim.cfd.metrics.residualU,
            resT: sim.thermal.residualT,
          },
          sim.balance.tippedOver,
        );
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      // Draw initial frame synchronously on mount, then pace via afterDraw
      tick();
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      controls.dispose();
      robot.dispose();
      pvLayers.dispose();
      labEnv.dispose();
      textures.dispose();
      shadowDiscGeo.dispose();
      shadowDiscMat.dispose();
      envRT.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="simulation-canvas-container"
      className="w-full h-full relative cursor-crosshair"
    />
  );
});
