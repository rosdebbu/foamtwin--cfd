import * as THREE from 'three';
import type { CfdSolver } from '../physics/cfdSolver';
import { sampleColormapNormalized, sampleColormapRgb255 } from '../physics/colormaps';
import type { ColormapName, FieldVariable, PipelineVisibility, ProbePinData, SimulationParams } from '../physics/types';
import { getFieldRange } from '../physics/types';
import type { ThermalState } from '../physics/thermalSolver';
import type { ProceduralTextureSet } from './proceduralTextures';

export interface ParaviewLayers {
  group: THREE.Group;
  sliceMesh: THREE.Mesh;
  xzWakeMesh: THREE.Mesh;
  update: (
    cfd: CfdSolver,
    thermal: ThermalState,
    params: SimulationParams,
    visibility: PipelineVisibility,
    robotZ: number,
    robotPitchRad: number,
    motorTorqueNm: number,
    dt: number,
    elapsedTime: number,
    probePin?: ProbePinData | null,
    rebuildGridLayers?: boolean,
    sensorWorking?: boolean,
    obstacleDetected?: boolean,
  ) => void;
  dispose: () => void;
}

// Pre-allocated scratch objects (Zero GC in render loop)
const _dummy = new THREE.Object3D();
const _velOut = { ux: 0, uy: 0, uz: 0, speed: 0 };
const _field2D = { uz: 0, uy: 0, pressurePa: 0, vorticity: 0, isSolid: false };
const _rgb255: [number, number, number] = [0, 0, 0];
const _rgbNorm: [number, number, number] = [0, 0, 0];
const _color = new THREE.Color();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

interface VectorArrow3D {
  group: THREE.Group;
  shaft: THREE.Mesh;
  head: THREE.Mesh;
  setLengthAndDir: (dirX: number, dirY: number, dirZ: number, len: number) => void;
}

export function createParaviewLayers(
  cfd: CfdSolver,
  textures: ProceduralTextureSet,
): ParaviewLayers {
  const group = new THREE.Group();
  group.name = 'ParaViewLayers';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // =========================================================================
  // 1. CFD CUT-PLANE SLICE (Y-Z plane DataTexture with crisp contour bands)
  // =========================================================================
  const slicePixels = new Uint8Array(cfd.nx * cfd.ny * 4);
  const sliceTex = new THREE.DataTexture(
    slicePixels,
    cfd.nx,
    cfd.ny,
    THREE.RGBAFormat,
  );
  sliceTex.magFilter = THREE.LinearFilter;
  sliceTex.minFilter = THREE.LinearFilter;
  sliceTex.colorSpace = THREE.SRGBColorSpace;
  sliceTex.needsUpdate = true;

  const domainLenZ = cfd.zMax - cfd.zMin;
  const domainHeightY = cfd.yMax - cfd.yMin;
  const sliceGeo = trackGeo(new THREE.PlaneGeometry(domainLenZ, domainHeightY));
  sliceGeo.rotateY(Math.PI / 2);
  const sliceMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: sliceTex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  const sliceMesh = new THREE.Mesh(sliceGeo, sliceMat);
  sliceMesh.position.set(0, (cfd.yMin + cfd.yMax) * 0.5, (cfd.zMin + cfd.zMax) * 0.5);
  sliceMesh.renderOrder = 2;
  group.add(sliceMesh);

  // =========================================================================
  // 1b. ORTHOGONAL HORIZONTAL X-Z WAKE CUT PLANE (at y = 0.088 m)
  // =========================================================================
  const xzNx = 36;
  const xzNz = 64;
  const xzPixels = new Uint8Array(xzNx * xzNz * 4);
  const xzTex = new THREE.DataTexture(xzPixels, xzNx, xzNz, THREE.RGBAFormat);
  xzTex.magFilter = THREE.LinearFilter;
  xzTex.minFilter = THREE.LinearFilter;
  xzTex.colorSpace = THREE.SRGBColorSpace;
  xzTex.needsUpdate = true;

  const xzSpanX = 0.42;
  const xzGeo = trackGeo(new THREE.PlaneGeometry(xzSpanX, domainLenZ));
  xzGeo.rotateX(-Math.PI / 2);
  const xzMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: xzTex,
      transparent: true,
      opacity: 0.66,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const xzWakeMesh = new THREE.Mesh(xzGeo, xzMat);
  xzWakeMesh.position.set(0, 0.088, (cfd.zMin + cfd.zMax) * 0.5);
  xzWakeMesh.renderOrder = 2;
  group.add(xzWakeMesh);

  // =========================================================================
  // 2. OPENFOAM COMPUTATIONAL DOMAIN MESH WIREFRAME (blockMesh cage)
  // =========================================================================
  const meshGroup = new THREE.Group();
  const domainHalfX = 0.24;
  const boxGeo = new THREE.BoxGeometry(domainHalfX * 2, domainHeightY, domainLenZ);
  const boxEdges = trackGeo(new THREE.EdgesGeometry(boxGeo));
  boxGeo.dispose();
  const cageMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x8c95a3,
      transparent: true,
      opacity: 0.20,
    }),
  );
  const cageLines = new THREE.LineSegments(boxEdges, cageMat);
  cageLines.position.set(0, domainHeightY * 0.5, 0);
  meshGroup.add(cageLines);

  const gridVerts: number[] = [];
  const zDivs = 24;
  const yDivs = 12;
  for (let i = 0; i <= zDivs; i++) {
    const z = cfd.zMin + (i / zDivs) * domainLenZ;
    gridVerts.push(-domainHalfX, 0.002, z, domainHalfX, 0.002, z);
    gridVerts.push(-domainHalfX, 0, z, -domainHalfX, domainHeightY, z);
  }
  for (let j = 0; j <= yDivs; j++) {
    const y = (j / yDivs) * domainHeightY;
    gridVerts.push(-domainHalfX, y, cfd.zMin, -domainHalfX, y, cfd.zMax);
  }
  const meshGridGeo = trackGeo(new THREE.BufferGeometry());
  meshGridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridVerts, 3));
  const meshGridMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x646c78,
      transparent: true,
      opacity: 0.16,
    }),
  );
  meshGroup.add(new THREE.LineSegments(meshGridGeo, meshGridMat));
  group.add(meshGroup);

  // =========================================================================
  // 3. 3D STREAMLINE RIBBONS & FILAMENTS (RK2 trajectories around robot)
  // =========================================================================
  const streamlineGroup = new THREE.Group();
  const numStreamlines = 16;
  const stepsPerLine = 40;
  const streamlineMeshes: THREE.Line[] = [];
  const ribbonMeshes: THREE.Mesh[] = [];
  const streamlineSeeds: Array<{ x: number; y: number }> = [];

  const ribbonHalfW = 0.0042;
  const ribbonMat = trackMat(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  for (let s = 0; s < numStreamlines; s++) {
    const row = Math.floor(s / 4);
    const col = s % 4;
    const seedX = -0.105 + (col / 3) * 0.21;
    const seedY = 0.045 + (row / 3) * 0.19;
    streamlineSeeds.push({ x: seedX, y: seedY });

    const lineGeo = trackGeo(new THREE.BufferGeometry());
    const posArr = new Float32Array(stepsPerLine * 3);
    const colArr = new Float32Array(stepsPerLine * 3);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const lineMat = trackMat(
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
      }),
    );

    const line = new THREE.Line(lineGeo, lineMat);
    line.frustumCulled = false;
    streamlineGroup.add(line);
    streamlineMeshes.push(line);

    // 3D quad ribbon strip paired with every other streamline for volumetric smoke feel
    if (s % 2 === 0) {
      const rGeo = trackGeo(new THREE.BufferGeometry());
      const rPos = new Float32Array(stepsPerLine * 2 * 3);
      const rCol = new Float32Array(stepsPerLine * 2 * 3);
      const rIndices: number[] = [];
      for (let k = 0; k < stepsPerLine - 1; k++) {
        const a = k * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        rIndices.push(a, b, c, b, d, c);
      }
      rGeo.setIndex(rIndices);
      rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
      rGeo.setAttribute('color', new THREE.BufferAttribute(rCol, 3));
      const rMesh = new THREE.Mesh(rGeo, ribbonMat);
      rMesh.frustumCulled = false;
      rMesh.renderOrder = 3;
      streamlineGroup.add(rMesh);
      ribbonMeshes.push(rMesh);
    }
  }
  group.add(streamlineGroup);

  // =========================================================================
  // 4. ADVECTING 3D TRACER STREAKS (InstancedMesh)
  // =========================================================================
  const particleCount = 180;
  const particleState = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    particleState[i * 3] = (Math.random() - 0.5) * 0.34;
    particleState[i * 3 + 1] = 0.02 + Math.random() * 0.32;
    particleState[i * 3 + 2] = cfd.zMin + Math.random() * domainLenZ;
  }

  const streakGeo = trackGeo(new THREE.CylinderGeometry(0.0011, 0.0024, 0.032, 6));
  const streakMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.94,
    }),
  );

  const tracerInstanced = new THREE.InstancedMesh(streakGeo, streakMat, particleCount);
  tracerInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tracerInstanced.frustumCulled = false;
  for (let i = 0; i < particleCount; i++) {
    tracerInstanced.setColorAt(i, _color.setHex(0xcfd6e0));
  }
  if (tracerInstanced.instanceColor) tracerInstanced.instanceColor.needsUpdate = true;
  streamlineGroup.add(tracerInstanced);

  // =========================================================================
  // 5. 3D VELOCITY VECTOR GLYPHS (InstancedMesh Arrows)
  // =========================================================================
  const glyphCols = 8;
  const glyphRows = 5;
  const glyphCount = glyphCols * glyphRows;
  const arrowGeo = trackGeo(new THREE.ConeGeometry(0.0046, 0.021, 8));
  const arrowMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));

  const glyphInstanced = new THREE.InstancedMesh(arrowGeo, arrowMat, glyphCount);
  glyphInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glyphInstanced.frustumCulled = false;
  for (let i = 0; i < glyphCount; i++) {
    glyphInstanced.setColorAt(i, _color.setHex(0xf59e0b));
  }
  if (glyphInstanced.instanceColor) glyphInstanced.instanceColor.needsUpdate = true;
  group.add(glyphInstanced);

  // =========================================================================
  // 6. HC-SR04 ULTRASONIC SONAR BEAM CONE, T->WALL->R WAVEFRONTS & TARGET
  // =========================================================================
  const acousticGroup = new THREE.Group();
  const pulseCount = 4;
  const pulseRings: Array<{
    group: THREE.Group;
    glowMat: THREE.MeshBasicMaterial;
    ringMat: THREE.MeshBasicMaterial;
  }> = [];
  const echoCount = 3;
  const echoRings: Array<{
    group: THREE.Group;
    glowMat: THREE.MeshBasicMaterial;
    ringMat: THREE.MeshBasicMaterial;
  }> = [];

  const wavePlaneGeo = trackGeo(new THREE.PlaneGeometry(2.0, 2.0));
  const waveTorusGeo = trackGeo(new THREE.TorusGeometry(1.0, 0.018, 8, 48));

  // Translucent volumetric 30-deg HC-SR04 sonar beam cone (narrow tip at z=0 -> flares toward +Z obstacle)
  const sonarConeGeo = trackGeo(new THREE.CylinderGeometry(0.18, 1.0, 1.0, 32, 1, true));
  // rotateX(-PI/2) maps +Y (narrow radius 0.18) -> -Z and -Y (wide radius 1.0) -> +Z
  sonarConeGeo.rotateX(-Math.PI / 2);
  sonarConeGeo.translate(0, 0, 0.5);
  const sonarConeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const sonarConeMesh = new THREE.Mesh(sonarConeGeo, sonarConeMat);
  sonarConeMesh.renderOrder = 3;
  acousticGroup.add(sonarConeMesh);

  // Crisp subtle sonar cone envelope guide rays (top/bottom/left/right beam edges)
  const rayPos = new Float32Array(4 * 2 * 3);
  const sonarRaysGeo = trackGeo(new THREE.BufferGeometry());
  sonarRaysGeo.setAttribute('position', new THREE.BufferAttribute(rayPos, 3));
  const sonarRaysMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
    }),
  );
  const sonarRays = new THREE.LineSegments(sonarRaysGeo, sonarRaysMat);
  sonarRays.frustumCulled = false;
  acousticGroup.add(sonarRays);

  for (let p = 0; p < pulseCount; p++) {
    const pGroup = new THREE.Group();
    const glowMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        map: textures.wavefrontTex,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const ringMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const glow = new THREE.Mesh(wavePlaneGeo, glowMat);
    const ring = new THREE.Mesh(waveTorusGeo, ringMat);
    glow.renderOrder = 4;
    ring.renderOrder = 5;
    pGroup.add(glow, ring);
    acousticGroup.add(pGroup);
    pulseRings.push({ group: pGroup, glowMat, ringMat });
  }

  for (let p = 0; p < echoCount; p++) {
    const eGroup = new THREE.Group();
    const glowMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        map: textures.wavefrontTex,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const ringMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.84,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const glow = new THREE.Mesh(wavePlaneGeo, glowMat);
    const ring = new THREE.Mesh(waveTorusGeo, ringMat);
    glow.renderOrder = 4;
    ring.renderOrder = 5;
    eGroup.add(glow, ring);
    acousticGroup.add(eGroup);
    echoRings.push({ group: eGroup, glowMat, ringMat });
  }

  // Calibrated acoustic target reflector plate mounted on a machined optical stand
  const targetStandGroup = new THREE.Group();
  const wallGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.12, 0.005));
  const wallMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xd8e2ec,
      transparent: true,
      opacity: 0.34,
      roughness: 0.14,
      metalness: 0.06,
      clearcoat: 0.92,
      depthWrite: false,
    }),
  );
  const wallEdgeGeo = trackGeo(new THREE.EdgesGeometry(wallGeo));
  const wallEdgeMat = trackMat(
    new THREE.LineBasicMaterial({ color: 0x38bdf8, opacity: 0.85, transparent: true }),
  );
  const obstacleWall = new THREE.Mesh(wallGeo, wallMat);
  obstacleWall.position.set(0, 0.072, 0);
  obstacleWall.add(new THREE.LineSegments(wallEdgeGeo, wallEdgeMat));
  targetStandGroup.add(obstacleWall);

  // Target impact flash ripple on reflector face when ultrasonic ping strikes
  const impactRingGeo = trackGeo(new THREE.RingGeometry(0.012, 0.019, 36));
  const impactRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const impactRingMesh = new THREE.Mesh(impactRingGeo, impactRingMat);
  impactRingMesh.position.set(0, 0.072, -0.004);
  impactRingMesh.renderOrder = 5;
  targetStandGroup.add(impactRingMesh);

  // Target reflector active detection beacon LED on top edge
  const standLedGeo = trackGeo(new THREE.SphereGeometry(0.0045, 12, 10));
  const standLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.8,
      roughness: 0.25,
    }),
  );
  const standLedMesh = new THREE.Mesh(standLedGeo, standLedMat);
  standLedMesh.position.set(0, 0.136, 0);
  targetStandGroup.add(standLedMesh);

  const standBaseGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.008, 0.036));
  const standPostGeo = trackGeo(new THREE.CylinderGeometry(0.004, 0.004, 0.020, 14));
  const standMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2a323e, roughness: 0.38, metalness: 0.82 }),
  );
  const standBase = new THREE.Mesh(standBaseGeo, standMat);
  standBase.position.set(0, 0.004, 0);
  standBase.castShadow = true;
  const standPost = new THREE.Mesh(standPostGeo, standMat);
  standPost.position.set(0, 0.010, 0);
  targetStandGroup.add(standBase, standPost);
  acousticGroup.add(targetStandGroup);
  group.add(acousticGroup);

  // =========================================================================
  // 7. 3D SHADED FREE-BODY FORCE VECTORS (Exterior Clean Anchors)
  // =========================================================================
  const forceGroup = new THREE.Group();
  const shaftUnitGeo = trackGeo(new THREE.CylinderGeometry(0.0022, 0.0022, 1.0, 12));
  shaftUnitGeo.translate(0, 0.5, 0);
  const coneHeadGeo = trackGeo(new THREE.ConeGeometry(0.0068, 0.020, 16));
  coneHeadGeo.translate(0, 0.010, 0);

  function create3DArrow(hex: number): VectorArrow3D {
    const grp = new THREE.Group();
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: 0.25,
        roughness: 0.35,
        metalness: 0.2,
      }),
    );
    const shaft = new THREE.Mesh(shaftUnitGeo, mat);
    const head = new THREE.Mesh(coneHeadGeo, mat);
    grp.add(shaft, head);
    forceGroup.add(grp);

    return {
      group: grp,
      shaft,
      head,
      setLengthAndDir(dx: number, dy: number, dz: number, len: number) {
        _dir.set(dx, dy, dz).normalize();
        _quat.setFromUnitVectors(_up, _dir);
        grp.quaternion.copy(_quat);
        const shaftLen = Math.max(0.01, len - 0.020);
        shaft.scale.set(1, shaftLen, 1);
        head.position.set(0, shaftLen, 0);
      },
    };
  }

  const dragArrow = create3DArrow(0xf97316);
  const tractionArrow = create3DArrow(0x22c55e);
  const gravityArrow = create3DArrow(0xef4444);
  gravityArrow.setLengthAndDir(0, -1, 0, 0.088);
  group.add(forceGroup);

  // =========================================================================
  // 8. THERMAL CONVECTIVE PLUME (behind L298N heatsink)
  // =========================================================================
  const thermalPlumeGeo = trackGeo(new THREE.PlaneGeometry(0.28, 0.18));
  thermalPlumeGeo.rotateY(Math.PI / 2);
  const plumePixels = new Uint8Array(32 * 24 * 4);
  const plumeTex = new THREE.DataTexture(plumePixels, 32, 24, THREE.RGBAFormat);
  plumeTex.magFilter = THREE.LinearFilter;
  plumeTex.minFilter = THREE.LinearFilter;
  plumeTex.colorSpace = THREE.SRGBColorSpace;
  const plumeMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: plumeTex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const thermalPlumeMesh = new THREE.Mesh(thermalPlumeGeo, plumeMat);
  thermalPlumeMesh.position.set(0.038, 0.21, -0.13);
  thermalPlumeMesh.renderOrder = 3;
  group.add(thermalPlumeMesh);

  // =========================================================================
  // 9. MACHINED ALUMINUM OPTICAL BENCH CALIBRATION BUMP (z = +0.16 m)
  // =========================================================================
  const bumpW = 0.25;
  const bumpPts = 18;
  const bumpShape = new THREE.Shape();
  bumpShape.moveTo(-0.055, 0);
  for (let i = 0; i <= bumpPts; i++) {
    const zLocal = -0.055 + (i / bumpPts) * 0.11;
    const h = 0.0085 * Math.exp(-(zLocal * zLocal) / (0.024 * 0.024));
    bumpShape.lineTo(zLocal, h);
  }
  bumpShape.lineTo(0.055, 0);
  bumpShape.closePath();

  const bumpExtrudeGeo = trackGeo(
    new THREE.ExtrudeGeometry(bumpShape, { depth: bumpW, bevelEnabled: false }),
  );
  bumpExtrudeGeo.translate(0, 0, -bumpW / 2);
  bumpExtrudeGeo.rotateY(Math.PI / 2);
  const bumpMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb6bec8,
      bumpMap: textures.metalBump,
      bumpScale: 0.0008,
      roughness: 0.34,
      metalness: 0.86,
    }),
  );
  const benchBumpMesh = new THREE.Mesh(bumpExtrudeGeo, bumpMat);
  benchBumpMesh.position.set(0, 0.0, 0.16);
  benchBumpMesh.castShadow = true;
  benchBumpMesh.receiveShadow = true;
  benchBumpMesh.visible = false;
  group.add(benchBumpMesh);

  // =========================================================================
  // 10. 3D PITOT FIELD PROBE PIN
  // =========================================================================
  const probePinGroup = new THREE.Group();
  const probeStemGeo = trackGeo(new THREE.CylinderGeometry(0.0012, 0.0012, 0.038, 10));
  const probeTipGeo = trackGeo(new THREE.SphereGeometry(0.0034, 12, 10));
  const probeRingGeo = trackGeo(new THREE.RingGeometry(0.007, 0.0095, 24));
  probeRingGeo.rotateX(-Math.PI / 2);
  const probeBrassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd99b42,
      emissive: 0xd99b42,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.9,
    }),
  );
  const probeRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf3c478,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  const probeStem = new THREE.Mesh(probeStemGeo, probeBrassMat);
  probeStem.position.y = -0.019;
  const probeTip = new THREE.Mesh(probeTipGeo, probeBrassMat);
  const probeRing = new THREE.Mesh(probeRingGeo, probeRingMat);
  probePinGroup.add(probeStem, probeTip, probeRing);
  probePinGroup.visible = false;
  group.add(probePinGroup);

  // =========================================================================
  // UPDATE LOOP (Zero heap allocation)
  // =========================================================================
  function update(
    solver: CfdSolver,
    thermal: ThermalState,
    params: SimulationParams,
    visibility: PipelineVisibility,
    robotZ: number,
    robotPitchRad: number,
    motorTorqueNm: number,
    dt: number,
    elapsedTime: number,
    probePin?: ProbePinData | null,
    rebuildGridLayers = true,
    sensorWorking = true,
    obstacleDetected = false,
  ) {
    const activeField: FieldVariable =
      params.field === 'physical' ? 'velocity' : params.field;
    const range = getFieldRange(activeField, params);
    const invSpan = 1 / Math.max(1e-5, range.max - range.min);

    // 1. Update CFD Slice Plane Texture
    sliceMesh.visible = visibility.cfdSlice;
    sliceMesh.position.x = params.sliceOffsetX;
    sliceMat.opacity = params.field === 'physical' ? 0.62 : 0.78;

    if (visibility.cfdSlice && rebuildGridLayers) {
      const { nx, ny, u, v, p, curl, solid } = solver;
      const rho = 1.225;
      for (let j = 0; j < ny; j++) {
        const wy = solver.yMin + (j + 0.5) * solver.dy;
        for (let i = 0; i < nx; i++) {
          const idx = j * nx + i;
          const pIdx = idx * 4;

          if (solid[idx]) {
            slicePixels[pIdx] = 18;
            slicePixels[pIdx + 1] = 24;
            slicePixels[pIdx + 2] = 36;
            slicePixels[pIdx + 3] = 28;
            continue;
          }

          let val = 0;
          if (activeField === 'pressure') {
            val = p[idx] * rho;
          } else if (activeField === 'vorticity') {
            val = Math.abs(curl[idx]);
          } else if (activeField === 'temperature') {
            const wz = solver.zMin + (i + 0.5) * solver.dz;
            const dzWake = Math.max(0, 0.04 - wz);
            const heatSourceTop =
              Math.exp(-Math.pow((wy - 0.19) / 0.055, 2)) *
              (thermal.l298nTempC - params.ambientTemp);
            const heatSourceBot =
              Math.exp(-Math.pow((wy - 0.05) / 0.04, 2)) *
              (thermal.motorLeftTempC - params.ambientTemp);
            const downstreamDecay =
              wz < 0.06
                ? Math.exp(-dzWake * 3.8)
                : Math.exp(-Math.pow((wz - 0.06) / 0.04, 2));
            val =
              params.ambientTemp +
              (heatSourceTop + heatSourceBot * 0.7) * downstreamDecay;
          } else {
            val = Math.hypot(u[idx], v[idx]);
          }

          const t = Math.max(0, Math.min(1, (val - range.min) * invSpan));
          sampleColormapRgb255(params.colormap, t, _rgb255);

          const contourDist = Math.abs(((t * 8) % 1) - 0.5);
          const contourBoost = contourDist > 0.468 ? 0.82 : 1.0;

          const edgeZ = Math.min(i, nx - 1 - i) / 5;
          const edgeY = Math.min(ny - 1 - j) / 4;
          const edgeFade = Math.min(1, edgeZ) * Math.min(1, edgeY);

          slicePixels[pIdx] = Math.round(_rgb255[0] * contourBoost);
          slicePixels[pIdx + 1] = Math.round(_rgb255[1] * contourBoost);
          slicePixels[pIdx + 2] = Math.round(_rgb255[2] * contourBoost);
          const baseAlpha = activeField === 'temperature' ? 80 + t * 165 : 178;
          slicePixels[pIdx + 3] = Math.round(baseAlpha * edgeFade);
        }
      }
      sliceTex.needsUpdate = true;
    }

    // 1b. Update Orthogonal Horizontal X-Z Wake Plane Texture
    xzWakeMesh.visible = visibility.xzWakeSlice;
    if (visibility.xzWakeSlice && rebuildGridLayers) {
      const xzY = 0.088;
      const velMax = Math.max(2.0, params.windSpeed * 1.45 + 1.5);
      for (let kz = 0; kz < xzNz; kz++) {
        const wz = solver.zMin + (kz + 0.5) / xzNz * domainLenZ;
        const edgeZ = Math.min(kz, xzNz - 1 - kz) / 5;
        for (let kx = 0; kx < xzNx; kx++) {
          const wx = -xzSpanX * 0.5 + ((kx + 0.5) / xzNx) * xzSpanX;
          const edgeX = Math.min(kx, xzNx - 1 - kx) / 4;
          const edgeFade = Math.min(1, edgeZ) * Math.min(1, edgeX);
          solver.sampleFlow3D(wx, xzY, wz, params.windSpeed, _velOut);
          const t = Math.max(0, Math.min(1, _velOut.speed / velMax));
          sampleColormapRgb255(params.colormap, t, _rgb255);
          const contourDist = Math.abs(((t * 7) % 1) - 0.5);
          const contourBoost = contourDist > 0.468 ? 0.82 : 1.0;
          const pIdx = (kz * xzNx + kx) * 4;
          xzPixels[pIdx] = Math.round(_rgb255[0] * contourBoost);
          xzPixels[pIdx + 1] = Math.round(_rgb255[1] * contourBoost);
          xzPixels[pIdx + 2] = Math.round(_rgb255[2] * contourBoost);
          xzPixels[pIdx + 3] = Math.round(168 * edgeFade);
        }
      }
      xzTex.needsUpdate = true;
    }

    // 2. OpenFOAM Mesh Visibility & Bench Calibration Bump & Probe Pin
    meshGroup.visible = visibility.openfoamMesh;
    benchBumpMesh.visible = params.benchBump;
    if (probePin && probePin.active) {
      probePinGroup.visible = true;
      probePinGroup.position.set(probePin.x, probePin.y, probePin.z);
      const pulse = 1 + 0.14 * Math.sin(elapsedTime * 5);
      probeRing.scale.set(pulse, pulse, 1);
    } else {
      probePinGroup.visible = false;
    }

    // 3. Update 3D Streamlines + Streamribbons + Advecting Tracer Streaks
    streamlineGroup.visible = visibility.streamlines;
    if (visibility.streamlines) {
      const ds = 0.022;
      const velScaleMax = Math.max(2.0, params.windSpeed * 1.45 + 1.5);

      if (rebuildGridLayers) {
        for (let s = 0; s < numStreamlines; s++) {
        const line = streamlineMeshes[s];
        const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = line.geometry.getAttribute('color') as THREE.BufferAttribute;

        const rMesh = s % 2 === 0 ? ribbonMeshes[s >> 1] : null;
        const rPosAttr = rMesh ? (rMesh.geometry.getAttribute('position') as THREE.BufferAttribute) : null;
        const rColAttr = rMesh ? (rMesh.geometry.getAttribute('color') as THREE.BufferAttribute) : null;

        let px = streamlineSeeds[s].x;
        let py = streamlineSeeds[s].y;
        let pz = solver.zMax - 0.02;

        for (let k = 0; k < stepsPerLine; k++) {
          posAttr.setXYZ(k, px, py, pz);
          solver.sampleFlow3D(px, py, pz, params.windSpeed, _velOut);
          const t = Math.max(0, Math.min(1, _velOut.speed / velScaleMax));
          sampleColormapNormalized(params.colormap, t, _rgbNorm);
          colAttr.setXYZ(k, _rgbNorm[0], _rgbNorm[1], _rgbNorm[2]);

          if (rPosAttr && rColAttr) {
            rPosAttr.setXYZ(k * 2, px - ribbonHalfW, py, pz);
            rPosAttr.setXYZ(k * 2 + 1, px + ribbonHalfW, py, pz);
            rColAttr.setXYZ(k * 2, _rgbNorm[0], _rgbNorm[1], _rgbNorm[2]);
            rColAttr.setXYZ(k * 2 + 1, _rgbNorm[0], _rgbNorm[1], _rgbNorm[2]);
          }

          const sp = _velOut.speed + 0.05;
          px += (_velOut.ux / sp) * ds;
          py = Math.max(0.008, Math.min(solver.yMax - 0.01, py + (_velOut.uy / sp) * ds));
          pz += (_velOut.uz / sp) * ds;
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
          if (rPosAttr && rColAttr) {
            rPosAttr.needsUpdate = true;
            rColAttr.needsUpdate = true;
          }
        }
      }

      const advDt = params.paused ? 0 : Math.min(dt, 0.03) * params.timeScale;
      for (let i = 0; i < particleCount; i++) {
        const idx3 = i * 3;
        let px = particleState[idx3];
        let py = particleState[idx3 + 1];
        let pz = particleState[idx3 + 2];

        solver.sampleFlow3D(px, py, pz, params.windSpeed, _velOut);

        if (advDt > 0) {
          px += _velOut.ux * advDt;
          py += _velOut.uy * advDt;
          pz += _velOut.uz * advDt;

          if (
            pz < solver.zMin ||
            pz > solver.zMax ||
            py < 0.005 ||
            py > solver.yMax ||
            Math.abs(px) > 0.25
          ) {
            px = (Math.random() - 0.5) * 0.28;
            py = 0.02 + Math.random() * 0.26;
            pz = params.windSpeed >= 0 ? solver.zMax - 0.01 : solver.zMin + 0.01;
          }
          particleState[idx3] = px;
          particleState[idx3 + 1] = py;
          particleState[idx3 + 2] = pz;
        }

        _dir.set(_velOut.ux, _velOut.uy, _velOut.uz);
        const speed = _dir.length();
        if (speed > 0.01) _dir.divideScalar(speed);
        else _dir.set(0, 0, -1);

        _quat.setFromUnitVectors(_up, _dir);
        _dummy.position.set(px, py, pz);
        _dummy.quaternion.copy(_quat);
        const lenScale = Math.max(0.4, Math.min(2.2, speed * 0.28));
        _dummy.scale.set(1, lenScale, 1);
        _dummy.updateMatrix();
        tracerInstanced.setMatrixAt(i, _dummy.matrix);

        const t = Math.max(0, Math.min(1, speed / velScaleMax));
        sampleColormapNormalized(params.colormap, t, _rgbNorm);
        _color.setRGB(_rgbNorm[0], _rgbNorm[1], _rgbNorm[2]);
        tracerInstanced.setColorAt(i, _color);
      }
      tracerInstanced.instanceMatrix.needsUpdate = true;
      if (tracerInstanced.instanceColor) tracerInstanced.instanceColor.needsUpdate = true;
    }

    // 4. 3D Velocity Vector Glyphs
    glyphInstanced.visible = visibility.vectorGlyphs;
    if (visibility.vectorGlyphs && rebuildGridLayers) {
      const velScaleMax = Math.max(2.0, params.windSpeed * 1.45 + 1.5);
      let gIdx = 0;
      for (let r = 0; r < glyphRows; r++) {
        const gy = 0.04 + (r / (glyphRows - 1)) * 0.24;
        for (let c = 0; c < glyphCols; c++) {
          const gz = solver.zMin + 0.05 + (c / (glyphCols - 1)) * (domainLenZ - 0.10);
          solver.sampleField2D(gz, gy, _field2D);
          if (_field2D.isSolid) {
            _dummy.scale.set(0, 0, 0);
            _dummy.updateMatrix();
            glyphInstanced.setMatrixAt(gIdx, _dummy.matrix);
            gIdx++;
            continue;
          }
          _dir.set(0, _field2D.uy, _field2D.uz);
          const speed = _dir.length();
          if (speed > 0.01) _dir.divideScalar(speed);
          else _dir.set(0, 0, -1);

          _quat.setFromUnitVectors(_up, _dir);
          _dummy.position.set(params.sliceOffsetX + 0.008, gy, gz);
          _dummy.quaternion.copy(_quat);
          const scale = Math.max(0.35, Math.min(1.8, speed * 0.24));
          _dummy.scale.set(scale, scale, scale);
          _dummy.updateMatrix();
          glyphInstanced.setMatrixAt(gIdx, _dummy.matrix);

          const t = Math.max(0, Math.min(1, speed / velScaleMax));
          sampleColormapNormalized(params.colormap, t, _rgbNorm);
          _color.setRGB(_rgbNorm[0], _rgbNorm[1], _rgbNorm[2]);
          glyphInstanced.setColorAt(gIdx, _color);
          gIdx++;
        }
      }
      glyphInstanced.instanceMatrix.needsUpdate = true;
      if (glyphInstanced.instanceColor) glyphInstanced.instanceColor.needsUpdate = true;
    }

    // 5. Thermal Convective Plume
    thermalPlumeMesh.visible = visibility.thermalOverlay;
    if (visibility.thermalOverlay && rebuildGridLayers) {
      const l298nExcess = Math.max(0, thermal.l298nTempC - params.ambientTemp);
      for (let j = 0; j < 24; j++) {
        const nyNorm = j / 23;
        for (let i = 0; i < 32; i++) {
          const nzNorm = i / 31;
          const buoyancyY = 0.25 + (1 - nzNorm) * 0.45;
          const distY = Math.abs(nyNorm - buoyancyY);
          const plumeIntensity =
            Math.exp(-distY * distY * 14) *
            Math.pow(nzNorm, 0.55) *
            Math.min(1, l298nExcess / 55);
          const idx4 = (j * 32 + i) * 4;
          sampleColormapRgb255('plasma', Math.min(1, plumeIntensity * 1.15), _rgb255);
          plumePixels[idx4] = _rgb255[0];
          plumePixels[idx4 + 1] = _rgb255[1];
          plumePixels[idx4 + 2] = _rgb255[2];
          plumePixels[idx4 + 3] = Math.round(plumeIntensity * 210);
        }
      }
      plumeTex.needsUpdate = true;
    }

    // 6. HC-SR04 Dual-Way Ultrasonic Transmit (T) & Reflected Return Echo (R)
    acousticGroup.visible = visibility.acousticCone;
    if (visibility.acousticCone) {
      const wallZ = params.obstacleDist;
      targetStandGroup.position.set(0, 0, wallZ);

      // Exact HC-SR04 grille pose in world space (local dy=0.036, dz=0.074 around axle y=0.048)
      const cosP = Math.cos(robotPitchRad);
      const sinP = Math.sin(robotPitchRad);
      const sensorY = 0.048 + 0.036 * cosP - 0.074 * sinP;
      const sensorZ = robotZ + 0.036 * sinP + 0.074 * cosP;
      const travelSpan = Math.max(0.05, wallZ - sensorZ);
      const beamEndRadius = 0.010 + travelSpan * 0.25;
      const impactY = Math.max(0.025, Math.min(0.125, sensorY - sinP * travelSpan));

      // Volumetric sonar cone & 4 guide rays
      sonarConeMesh.position.set(0, sensorY, sensorZ);
      sonarConeMesh.rotation.x = robotPitchRad;
      sonarConeMesh.scale.set(beamEndRadius, beamEndRadius, travelSpan);
      sonarConeMat.opacity = (sensorWorking ? 0.055 : 0.025) + 0.015 * Math.sin(elapsedTime * 5.0);
      sonarConeMat.color.setHex(obstacleDetected ? 0x34d399 : 0x22d3ee);

      const rayAttr = sonarRaysGeo.getAttribute('position') as THREE.BufferAttribute;
      const endY = sensorY - sinP * travelSpan;
      const endZ = sensorZ + cosP * travelSpan;
      rayAttr.setXYZ(0, -0.013, sensorY, sensorZ);
      rayAttr.setXYZ(1, -beamEndRadius, endY, endZ);
      rayAttr.setXYZ(2, 0.013, sensorY, sensorZ);
      rayAttr.setXYZ(3, beamEndRadius, endY, endZ);
      rayAttr.setXYZ(4, 0, sensorY + 0.008, sensorZ);
      rayAttr.setXYZ(5, 0, endY + beamEndRadius * 0.72, endZ);
      rayAttr.setXYZ(6, 0, sensorY - 0.008, sensorZ);
      rayAttr.setXYZ(7, 0, Math.max(0.006, endY - beamEndRadius * 0.72), endZ);
      rayAttr.needsUpdate = true;
      sonarRaysMat.opacity = sensorWorking ? 0.28 : 0.12;

      // Outbound TRIG (T) wavefronts from Left transmitter barrel (x = -0.013)
      for (let p = 0; p < pulseCount; p++) {
        const phase = (elapsedTime * 1.25 + p / pulseCount) % 1;
        const entry = pulseRings[p];
        const dist = 0.006 + phase * Math.max(0.03, travelSpan - 0.006);
        const posX = -0.013 * (1 - phase * 0.75);
        const posY = sensorY - sinP * dist;
        const posZ = sensorZ + cosP * dist;
        entry.group.position.set(posX, posY, posZ);
        entry.group.rotation.x = robotPitchRad;
        const radius = 0.007 + dist * 0.23;
        entry.group.scale.set(radius, radius, radius);
        const fade = Math.sin(Math.PI * Math.min(1, phase * 0.92 + 0.08));
        entry.glowMat.opacity = fade * 0.24;
        entry.ringMat.opacity = (1 - phase * 0.65) * 0.88;
      }

      // Target reflector impact ripple + LED beacon when sensor receives valid echoes
      if (sensorWorking) {
        const hitPhase = (elapsedTime * 1.25) % 1;
        const hitScale = 0.75 + hitPhase * 2.2;
        impactRingMesh.visible = true;
        impactRingMesh.position.set(0, impactY, -0.004);
        impactRingMesh.scale.set(hitScale, hitScale, 1);
        impactRingMat.opacity = (1 - hitPhase) * 0.85;
        impactRingMat.color.setHex(obstacleDetected ? 0x34d399 : 0x22d3ee);

        wallEdgeMat.color.setHex(obstacleDetected ? 0x34d399 : 0x38bdf8);
        wallEdgeMat.opacity = obstacleDetected ? 0.95 : 0.75;
        standLedMat.color.setHex(obstacleDetected ? 0x34d399 : 0x22d3ee);
        standLedMat.emissive.setHex(obstacleDetected ? 0x10b981 : 0x22d3ee);
        standLedMat.emissiveIntensity = 1.6 + 1.4 * Math.abs(Math.sin(elapsedTime * 6));
      } else {
        impactRingMesh.visible = false;
        wallEdgeMat.color.setHex(0x94a3b8);
        wallEdgeMat.opacity = 0.45;
        standLedMat.color.setHex(0xf97316);
        standLedMat.emissive.setHex(0xf97316);
        standLedMat.emissiveIntensity = 0.4;
      }

      // Reflected ECHO (R) wavefronts returning from obstacle back into Right receiver barrel (x = +0.013)
      for (let p = 0; p < echoCount; p++) {
        const entry = echoRings[p];
        if (!sensorWorking) {
          entry.group.visible = false;
          continue;
        }
        entry.group.visible = true;
        const phase = (elapsedTime * 1.25 + p / echoCount + 0.42) % 1;
        const distBack = phase * Math.max(0.03, travelSpan - 0.006);
        const forwardDist = travelSpan - distBack;
        entry.group.position.set(
          0.013 * phase,
          sensorY - sinP * forwardDist,
          sensorZ + cosP * forwardDist,
        );
        entry.group.rotation.x = robotPitchRad;
        const radius = 0.009 + (1 - phase) * travelSpan * 0.18;
        entry.group.scale.set(radius, radius, radius);
        entry.glowMat.opacity = (1 - phase * 0.6) * 0.18;
        entry.ringMat.opacity = (1 - phase * 0.65) * 0.85;
      }
    }

    // 7. Clean Exterior Free-Body Force Vectors (never poking inside chassis holes)
    forceGroup.visible = visibility.forceVectors;
    if (visibility.forceVectors) {
      const comY = 0.048 + 0.105 * Math.cos(robotPitchRad);
      const comZ = robotZ + 0.105 * Math.sin(robotPitchRad);

      dragArrow.group.position.set(0.118, comY + 0.015, comZ);
      const dragDirZ = solver.metrics.aeroForceZ >= 0 ? 1 : -1;
      dragArrow.setLengthAndDir(
        0,
        0,
        dragDirZ,
        Math.max(0.045, Math.min(0.20, solver.metrics.dragForceN * 0.35 + 0.045)),
      );

      // Anchor gravity cleanly alongside robot exterior (-X side) so it never cuts through center holes
      gravityArrow.group.position.set(-0.132, comY + 0.02, comZ);

      tractionArrow.group.position.set(0.118, 0.014, robotZ);
      const tracDirZ = motorTorqueNm >= 0 ? 1 : -1;
      tractionArrow.setLengthAndDir(
        0,
        0,
        tracDirZ,
        Math.max(0.04, Math.min(0.20, Math.abs(motorTorqueNm) * 0.22 + 0.04)),
      );
    }
  }

  function dispose() {
    sliceTex.dispose();
    xzTex.dispose();
    plumeTex.dispose();
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }

  return {
    group,
    sliceMesh,
    xzWakeMesh,
    update,
    dispose,
  };
}
