import * as THREE from 'three';
import type { ProceduralTextureSet } from './proceduralTextures';

export interface LabEnvironment {
  group: THREE.Group;
  setWindTunnelVisible: (visible: boolean) => void;
  dispose: () => void;
}

/**
 * Builds a high-contrast procedural studio lighting box for PMREM reflections so
 * brass standoffs, aluminum ultrasonic barrels, brushed steel motors, and glossy
 * PCB solder masks catch crisp specular highlights without external HDR files.
 */
export function buildStudioEnvironmentScene(): THREE.Scene {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x16171b);

  const addPanel = (
    color: number,
    intensity: number,
    w: number,
    h: number,
    pos: [number, number, number],
    lookAt: [number, number, number],
  ) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.lookAt(...lookAt);
    envScene.add(mesh);
  };

  // Dual overhead laboratory linear softboxes
  addPanel(0xfff6ea, 3.4, 3.6, 0.9, [0.9, 3.2, 0.4], [0, 0, 0]);
  addPanel(0xe0ecff, 2.8, 3.6, 0.9, [-1.1, 3.1, -0.3], [0, 0, 0]);

  // Warm key softbox (front-right)
  addPanel(0xffe8c8, 3.8, 2.4, 1.8, [2.8, 1.8, 2.2], [0, 0.15, 0]);

  // Cool rim accent strip (back-left)
  addPanel(0x7cc4ff, 2.6, 2.8, 1.1, [-2.6, 1.4, -2.5], [0, 0.15, 0]);

  // Subtle floor bounce
  addPanel(0x1e2636, 1.0, 6.0, 6.0, [0, -1.5, 0], [0, 0, 0]);

  return envScene;
}

export function buildLabEnvironment(
  textures: ProceduralTextureSet,
): LabEnvironment {
  const group = new THREE.Group();
  group.name = 'LabEnvironment';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // =========================================================================
  // 1. PRECISION ANODIZED OPTICAL BREADBOARD WORKBENCH (Top at y = 0.0)
  // =========================================================================
  const benchW = 1.16;
  const benchD = 1.64;
  const benchThick = 0.036;

  const benchGeo = track(new THREE.BoxGeometry(benchW, benchThick, benchD));
  const benchMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xaab4c4,
      map: textures.benchColor,
      roughnessMap: textures.benchRoughness,
      bumpMap: textures.benchBump,
      bumpScale: 0.0014,
      roughness: 0.78,
      metalness: 0.22,
      envMapIntensity: 0.42,
    }),
  );
  const benchTop = new THREE.Mesh(benchGeo, benchMat);
  benchTop.position.y = -benchThick / 2;
  benchTop.receiveShadow = true;
  group.add(benchTop);

  // Brushed aluminum perimeter trim rails around the optical table
  const railMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8f9aa8,
      bumpMap: textures.metalBump,
      bumpScale: 0.0008,
      roughness: 0.34,
      metalness: 0.85,
    }),
  );
  const railH = benchThick + 0.003;
  const railT = 0.016;

  const sideRailGeo = track(new THREE.BoxGeometry(railT, railH, benchD + railT * 2));
  const endRailGeo = track(new THREE.BoxGeometry(benchW, railH, railT));

  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(sideRailGeo, railMat);
    rail.position.set(sx * (benchW / 2 + railT / 2), -benchThick / 2 - 0.0005, 0);
    rail.receiveShadow = true;
    rail.castShadow = true;
    group.add(rail);
  }
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(endRailGeo, railMat);
    rail.position.set(0, -benchThick / 2 - 0.0005, sz * (benchD / 2 + railT / 2));
    rail.receiveShadow = true;
    rail.castShadow = true;
    group.add(rail);
  }

  // Dark steel vibration-isolation table underframe & 4 heavy legs
  const darkFrameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x151a22,
      roughness: 0.65,
      metalness: 0.55,
    }),
  );
  const plinthGeo = track(new THREE.BoxGeometry(benchW - 0.14, 0.08, benchD - 0.18));
  const plinth = new THREE.Mesh(plinthGeo, darkFrameMat);
  plinth.position.y = -benchThick - 0.04;
  group.add(plinth);

  const legGeo = track(new THREE.CylinderGeometry(0.036, 0.04, 0.48, 16));
  for (const [lx, lz] of [
    [-0.44, -0.62],
    [0.44, -0.62],
    [-0.44, 0.62],
    [0.44, 0.62],
  ]) {
    const leg = new THREE.Mesh(legGeo, darkFrameMat);
    leg.position.set(lx, -benchThick - 0.28, lz);
    group.add(leg);
  }

  // Surrounding dark architectural lab floor well below benchtop
  const studioFloorGeo = track(new THREE.PlaneGeometry(14, 14));
  studioFloorGeo.rotateX(-Math.PI / 2);
  const studioFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111215,
      roughness: 0.92,
      metalness: 0.08,
    }),
  );
  const studioFloor = new THREE.Mesh(studioFloorGeo, studioFloorMat);
  studioFloor.position.y = -0.52;
  group.add(studioFloor);

  // =========================================================================
  // 2. SUBTLE WIND-TUNNEL INTAKE HONEYCOMB FRAME (Toggleable for pure sonar)
  // =========================================================================
  const windTunnelGroup = new THREE.Group();
  windTunnelGroup.name = 'WindTunnelGantry';
  group.add(windTunnelGroup);

  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x202733,
      roughness: 0.48,
      metalness: 0.68,
    }),
  );
  const tunnelW = 0.52;
  const tunnelH = 0.30;
  const barT = 0.016;
  const intakeZ = 0.48;

  const topBarGeo = track(new THREE.BoxGeometry(tunnelW + barT * 2, barT, 0.028));
  const vertBarGeo = track(new THREE.BoxGeometry(barT, tunnelH, 0.028));

  for (const tz of [intakeZ, -intakeZ]) {
    const topBar = new THREE.Mesh(topBarGeo, frameMat);
    topBar.position.set(0, tunnelH + barT / 2, tz);
    topBar.castShadow = true;
    windTunnelGroup.add(topBar);

    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(vertBarGeo, frameMat);
      post.position.set(sx * (tunnelW / 2 + barT / 2), tunnelH / 2, tz);
      post.castShadow = true;
      windTunnelGroup.add(post);

      // Machined flange foot bolted to breadboard
      const footGeo = track(new THREE.BoxGeometry(0.036, 0.007, 0.052));
      const foot = new THREE.Mesh(footGeo, railMat);
      foot.position.set(sx * (tunnelW / 2 + barT / 2), 0.0035, tz);
      windTunnelGroup.add(foot);
    }
  }

  // Fine hexagonal flow-straightener honeycomb screen inside intake frame
  const honeycombGeo = track(new THREE.PlaneGeometry(tunnelW, tunnelH));
  const honeycombMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      map: textures.honeycombTex,
      transparent: true,
      opacity: 0.42,
      roughness: 0.45,
      metalness: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const honeycombScreen = new THREE.Mesh(honeycombGeo, honeycombMat);
  honeycombScreen.position.set(0, tunnelH / 2, intakeZ);
  windTunnelGroup.add(honeycombScreen);

  // Subtle brass calibration datum pin at corner (-0.28, 0, 0.46)
  const datumBaseGeo = track(new THREE.CylinderGeometry(0.011, 0.013, 0.006, 20));
  const datumPinGeo = track(new THREE.CylinderGeometry(0.0025, 0.0025, 0.022, 12));
  const brassDatumMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd1a84e,
      roughness: 0.25,
      metalness: 0.9,
    }),
  );
  const datumBase = new THREE.Mesh(datumBaseGeo, darkFrameMat);
  datumBase.position.set(-0.31, 0.003, 0.44);
  const datumPin = new THREE.Mesh(datumPinGeo, brassDatumMat);
  datumPin.position.set(-0.31, 0.014, 0.44);
  group.add(datumBase, datumPin);

  return {
    group,
    setWindTunnelVisible: (visible: boolean) => {
      windTunnelGroup.visible = visible;
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
