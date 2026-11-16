import * as THREE from 'three';
import type { ProceduralTextureSet } from './proceduralTextures';
import type { ColormapName, FieldVariable } from '../physics/types';
import { sampleColormapNormalized } from '../physics/colormaps';
import type { ThermalState } from '../physics/thermalSolver';
import type { StructuralAndAcousticMetrics } from '../physics/acousticsAndStress';

export type RobotPartRegion =
  | 'l298n'
  | 'motorLeft'
  | 'motorRight'
  | 'buck'
  | 'bt'
  | 'mpu'
  | 'plate1'
  | 'plate2'
  | 'plate3'
  | 'standoffs'
  | 'wheels'
  | 'hcsr04'
  | 'counterweight'
  | 'other';

interface FieldColorableItem {
  mesh: THREE.Mesh;
  region: RobotPartRegion;
  localY: number;
  localZ: number;
  baseColor: THREE.Color;
  baseEmissive: THREE.Color;
  baseEmissiveIntensity: number;
  baseRoughness: number;
  baseMetalness: number;
  hasMap: boolean;
  baseMap: THREE.Texture | null;
}

interface DynamicWire {
  mesh: THREE.Mesh;
  startTier: 1 | 2 | 3;
  endTier: 1 | 2 | 3;
  basePts: THREE.Vector3[];
  radius: number;
  tubularSegments: number;
  radialSegments: number;
}

export interface RobotDigitalTwin {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  tier1Group: THREE.Group;
  tier2Group: THREE.Group;
  tier3Group: THREE.Group;
  leftWheel: THREE.Group;
  rightWheel: THREE.Group;
  hcsr04OriginLocal: THREE.Vector3;
  l298nWorldAnchor: THREE.Object3D;
  wireframeLines: THREE.LineSegments[];
  interactables: THREE.Mesh[];
  setWireframeVisible: (visible: boolean) => void;
  setExploded: (amount: number) => void;
  setHighlightedPart: (part: RobotPartRegion | null) => void;
  updateSignalPulses: (
    visible: boolean,
    elapsedTime: number,
    motorCurrent: number,
  ) => void;
  updateHcsrStatus: (
    active: boolean,
    working: boolean,
    detected: boolean,
    elapsedTime: number,
  ) => void;
  applyFieldVisualization: (
    field: FieldVariable,
    colormap: ColormapName,
    thermal: ThermalState,
    stress: StructuralAndAcousticMetrics,
    windSpeed: number,
    ambientTemp: number,
  ) => void;
  dispose: () => void;
}

const _rgb: [number, number, number] = [0, 0, 0];

export function buildRobotDigitalTwin(textures: ProceduralTextureSet): RobotDigitalTwin {
  const root = new THREE.Group();
  root.name = 'RobotRoot';

  const bodyPivot = new THREE.Group();
  bodyPivot.position.set(0, 0.048, 0); // Axle height = wheel radius (0.048m)
  root.add(bodyPivot);

  const tier1Group = new THREE.Group();
  const tier2Group = new THREE.Group();
  const tier3Group = new THREE.Group();
  bodyPivot.add(tier1Group, tier2Group, tier3Group);

  const colorables: FieldColorableItem[] = [];
  const wireframeLines: THREE.LineSegments[] = [];
  const interactables: THREE.Mesh[] = [];
  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];
  const dynamicWires: DynamicWire[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometriesToDispose.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materialsToDispose.push(m);
    return m;
  };

  const wireEdgeMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x9aa3b2,
      transparent: true,
      opacity: 0.24,
    }),
  );

  function registerMesh(
    mesh: THREE.Mesh,
    region: RobotPartRegion,
    localY: number,
    localZ: number,
    addWireframe = true,
  ) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.partId = region;
    interactables.push(mesh);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    colorables.push({
      mesh,
      region,
      localY,
      localZ,
      baseColor: mat.color.clone(),
      baseEmissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
      baseEmissiveIntensity: mat.emissiveIntensity ?? 0,
      baseRoughness: mat.roughness ?? 0.5,
      baseMetalness: mat.metalness ?? 0.1,
      hasMap: Boolean(mat.map),
      baseMap: mat.map ?? null,
    });

    if (addWireframe) {
      const edges = trackGeo(new THREE.EdgesGeometry(mesh.geometry, 26));
      const line = new THREE.LineSegments(edges, wireEdgeMat);
      line.visible = false;
      mesh.add(line);
      wireframeLines.push(line);
    }
  }

  // =========================================================================
  // CALIBRATED PBR MATERIALS
  // =========================================================================
  const plateMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc2c8d0,
        map: textures.plateColor,
        roughnessMap: textures.plateRoughness,
        bumpMap: textures.plateBump,
        bumpScale: 0.0005,
        roughness: 0.52,
        metalness: 0.14,
      }),
    );

  const brassMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd4aa4f,
        bumpMap: textures.metalBump,
        bumpScale: 0.0006,
        roughness: 0.24,
        metalness: 0.94,
      }),
    );

  const brushedSteelMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc2cad4,
        bumpMap: textures.metalBump,
        bumpScale: 0.0008,
        roughness: 0.24,
        metalness: 0.91,
      }),
    );

  const solderTinMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd9e0e8,
        roughness: 0.18,
        metalness: 0.96,
      }),
    );

  const copperMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc87542,
        roughness: 0.28,
        metalness: 0.92,
      }),
    );

  const goldPinMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6be53,
        roughness: 0.20,
        metalness: 0.96,
      }),
    );

  const gearboxPlasticMat = () =>
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xe2e7ec,
        roughness: 0.38,
        metalness: 0.02,
        clearcoat: 0.15,
        clearcoatRoughness: 0.35,
        transparent: true,
        opacity: 0.88,
      }),
    );

  const foamMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xeaf0f6,
        bumpMap: textures.foamBump,
        bumpScale: 0.0014,
        roughness: 0.93,
        metalness: 0.0,
      }),
    );

  const vinylTapeMat = () =>
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xf4f6f9,
        roughness: 0.24,
        metalness: 0.02,
        clearcoat: 0.45,
        clearcoatRoughness: 0.22,
      }),
    );

  const blackRubberMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1b1e24,
        bumpMap: textures.rubberBump,
        bumpScale: 0.0012,
        roughness: 0.88,
        metalness: 0.03,
      }),
    );

  const whiteRimMat = () =>
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xe7ebf0,
        roughness: 0.32,
        metalness: 0.04,
        clearcoat: 0.18,
        clearcoatRoughness: 0.28,
      }),
    );

  const blueTerminalMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1565c0,
        roughness: 0.38,
        metalness: 0.04,
      }),
    );

  const blackAnodizedMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x171a20,
        roughness: 0.34,
        metalness: 0.72,
      }),
    );

  const mattePlasticBlackMat = () =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x14171c,
        roughness: 0.72,
        metalness: 0.04,
      }),
    );

  // =========================================================================
  // 1. CHASSIS PLATES (3 Stacked Grey PVC Tiers with Smooth Holes & Grommets)
  // =========================================================================
  const plateW = 0.164; // X
  const plateD = 0.124; // Z
  const plateThick = 0.0042;

  function makeChassisPlateGeometry(withCenterHole: boolean): THREE.ExtrudeGeometry {
    const hw = plateW / 2;
    const hd = plateD / 2;
    const r = 0.004;
    const shape = new THREE.Shape();
    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
    shape.lineTo(hw, hd - r);
    shape.quadraticCurveTo(hw, hd, hw - r, hd);
    shape.lineTo(-hw + r, hd);
    shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
    shape.lineTo(-hw, -hd + r);
    shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

    if (withCenterHole) {
      const hole = new THREE.Path();
      hole.absarc(0, 0.004, 0.0095, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: plateThick,
      curveSegments: 36,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelSegments: 3,
    });
    geo.rotateX(Math.PI / 2);
    return trackGeo(geo);
  }

  const plate1Geo = makeChassisPlateGeometry(false);
  const plate23Geo = makeChassisPlateGeometry(true);

  const tier1Y = 0.024;
  const tier2Y = 0.078;
  const tier3Y = 0.132;

  const plate1 = new THREE.Mesh(plate1Geo, plateMat());
  plate1.position.y = tier1Y;
  tier1Group.add(plate1);
  registerMesh(plate1, 'plate1', tier1Y, 0);

  const plate2 = new THREE.Mesh(plate23Geo, plateMat());
  plate2.position.y = tier2Y;
  tier2Group.add(plate2);
  registerMesh(plate2, 'plate2', tier2Y, 0);

  const plate3 = new THREE.Mesh(plate23Geo, plateMat());
  plate3.position.y = tier3Y;
  tier3Group.add(plate3);
  registerMesh(plate3, 'plate3', tier3Y, 0);

  // Subtle dark machined inner collar inside Tier 2 & Tier 3 center holes
  const holeLinerGeo = trackGeo(
    new THREE.CylinderGeometry(0.0096, 0.0096, plateThick + 0.0008, 36, 1, true),
  );
  const holeLinerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b424c,
      roughness: 0.78,
      metalness: 0.1,
      side: THREE.BackSide,
    }),
  );
  for (const [grp, py] of [
    [tier2Group, tier2Y],
    [tier3Group, tier3Y],
  ] as const) {
    const liner = new THREE.Mesh(holeLinerGeo, holeLinerMat);
    liner.position.set(0, py - plateThick / 2, 0.004);
    grp.add(liner);
  }

  // Small white folded wire-tie tape tabs on Tier 1 top surface (Photos 1 & 3)
  const padGeo = trackGeo(new THREE.BoxGeometry(0.012, 0.0022, 0.012));
  const padPositions: [number, number][] = [
    [-0.056, 0.028],
    [-0.028, 0.028],
    [0.032, 0.028],
    [0.058, 0.028],
  ];
  for (const [px, pz] of padPositions) {
    const pad = new THREE.Mesh(padGeo, foamMat());
    pad.position.set(px, tier1Y + 0.0016, pz);
    pad.rotation.y = 0.12;
    tier1Group.add(pad);
    registerMesh(pad, 'other', tier1Y, pz, false);
  }

  // =========================================================================
  // 2. FOUR CORNER BRASS HEX STANDOFFS, COLLARS & PHILLIPS SCREWS
  // =========================================================================
  const cornerX = plateW / 2 - 0.009;
  const cornerZ = plateD / 2 - 0.009;
  const corners: [number, number][] = [
    [-cornerX, -cornerZ],
    [cornerX, -cornerZ],
    [-cornerX, cornerZ],
    [cornerX, cornerZ],
  ];

  const lowerStandoffLen = tier2Y - tier1Y - plateThick;
  const upperStandoffLen = tier3Y - tier2Y - plateThick;
  const lowerStandoffGeo = trackGeo(new THREE.CylinderGeometry(0.0031, 0.0031, lowerStandoffLen, 6));
  const upperStandoffGeo = trackGeo(new THREE.CylinderGeometry(0.0031, 0.0031, upperStandoffLen, 6));
  const washerGeo = trackGeo(new THREE.CylinderGeometry(0.0041, 0.0041, 0.0007, 16));
  const screwHeadGeo = trackGeo(
    new THREE.SphereGeometry(0.0033, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
  );
  const slotBarGeo = trackGeo(new THREE.BoxGeometry(0.0038, 0.0009, 0.0009));

  for (const [cx, cz] of corners) {
    const sLower = new THREE.Mesh(lowerStandoffGeo, brassMat());
    sLower.position.set(cx, (tier1Y + tier2Y) / 2 - plateThick / 2, cz);
    tier1Group.add(sLower);
    registerMesh(sLower, 'standoffs', tier1Y + 0.025, cz);

    const sUpper = new THREE.Mesh(upperStandoffGeo, brassMat());
    sUpper.position.set(cx, (tier2Y + tier3Y) / 2 - plateThick / 2, cz);
    tier2Group.add(sUpper);
    registerMesh(sUpper, 'standoffs', tier2Y + 0.025, cz);

    // Washers & Phillips pan-head screw on top of Tier 3
    const washer = new THREE.Mesh(washerGeo, brassMat());
    washer.position.set(cx, tier3Y + 0.0009, cz);
    tier3Group.add(washer);
    registerMesh(washer, 'standoffs', tier3Y, cz, false);

    const screw = new THREE.Mesh(screwHeadGeo, brassMat());
    screw.scale.set(1, 0.58, 1);
    screw.position.set(cx, tier3Y + 0.0012, cz);
    tier3Group.add(screw);
    registerMesh(screw, 'standoffs', tier3Y, cz, false);

    // Phillips cross slot detail on top of each brass screw
    for (const rot of [0, Math.PI / 2]) {
      const slot = new THREE.Mesh(slotBarGeo, blackAnodizedMat());
      slot.position.set(cx, tier3Y + 0.0029, cz);
      slot.rotation.y = rot + 0.4;
      tier3Group.add(slot);
    }

    // Bottom screw head under Tier 1 (Photo 2)
    const botScrew = new THREE.Mesh(screwHeadGeo, brassMat());
    botScrew.scale.set(1, -0.58, 1);
    botScrew.position.set(cx, tier1Y - plateThick - 0.0006, cz);
    tier1Group.add(botScrew);
    registerMesh(botScrew, 'standoffs', tier1Y, cz, false);
  }

  // =========================================================================
  // 3. DUAL COAXIAL GEARED DC MOTORS + GEARBOXES + SOLDER TABS + FOAM MOUNTS
  // =========================================================================
  const motorCanGeo = trackGeo(new THREE.CylinderGeometry(0.0155, 0.0155, 0.030, 28));
  motorCanGeo.rotateZ(Math.PI / 2);
  const motorCrimpRingGeo = trackGeo(new THREE.TorusGeometry(0.0154, 0.0009, 8, 28));
  motorCrimpRingGeo.rotateY(Math.PI / 2);
  const motorEndBellGeo = trackGeo(new THREE.CylinderGeometry(0.0138, 0.0148, 0.0045, 24));
  motorEndBellGeo.rotateZ(Math.PI / 2);
  const gearboxGeo = trackGeo(new THREE.CylinderGeometry(0.0185, 0.0185, 0.024, 28));
  gearboxGeo.rotateZ(Math.PI / 2);
  const innerGearCoreGeo = trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 16));
  innerGearCoreGeo.rotateZ(Math.PI / 2);
  const gearboxRibGeo = trackGeo(new THREE.BoxGeometry(0.022, 0.0025, 0.039));
  const shaftGeo = trackGeo(new THREE.CylinderGeometry(0.003, 0.003, 0.018, 16));
  shaftGeo.rotateZ(Math.PI / 2);
  const foamBlockGeo = trackGeo(new THREE.BoxGeometry(0.056, 0.012, 0.032));
  const solderTabGeo = trackGeo(new THREE.BoxGeometry(0.0025, 0.004, 0.0012));
  const solderBlobGeo = trackGeo(new THREE.SphereGeometry(0.0014, 10, 8));

  for (const side of [-1, 1] as const) {
    const region: RobotPartRegion = side === -1 ? 'motorLeft' : 'motorRight';

    const innerCore = new THREE.Mesh(innerGearCoreGeo, blackAnodizedMat());
    innerCore.position.set(side * 0.068, 0.0, 0);
    tier1Group.add(innerCore);

    const gearbox = new THREE.Mesh(gearboxGeo, gearboxPlasticMat());
    gearbox.position.set(side * 0.068, 0.0, 0);
    tier1Group.add(gearbox);
    registerMesh(gearbox, region, 0, 0);

    for (let r = 0; r < 2; r++) {
      const rib = new THREE.Mesh(gearboxRibGeo, gearboxPlasticMat());
      rib.position.set(side * 0.068, 0.0, 0);
      rib.rotation.x = (r * Math.PI) / 2;
      tier1Group.add(rib);
    }

    const motorCan = new THREE.Mesh(motorCanGeo, brushedSteelMat());
    motorCan.position.set(side * 0.041, 0.0, 0);
    tier1Group.add(motorCan);
    registerMesh(motorCan, region, 0, 0);

    const crimpRing = new THREE.Mesh(motorCrimpRingGeo, brushedSteelMat());
    crimpRing.position.set(side * 0.027, 0.0, 0);
    tier1Group.add(crimpRing);

    const endBell = new THREE.Mesh(motorEndBellGeo, mattePlasticBlackMat());
    endBell.position.set(side * 0.025, 0.0, 0);
    tier1Group.add(endBell);

    // Dual copper motor terminal tabs + shiny solder joints (Photo 2)
    for (const tz of [-0.008, 0.008]) {
      const tab = new THREE.Mesh(solderTabGeo, copperMat());
      tab.position.set(side * 0.023, -0.002, tz);
      tier1Group.add(tab);

      const blob = new THREE.Mesh(solderBlobGeo, solderTinMat());
      blob.position.set(side * 0.022, -0.002, tz);
      tier1Group.add(blob);
    }

    const shaft = new THREE.Mesh(shaftGeo, brushedSteelMat());
    shaft.position.set(side * 0.088, 0.0, 0);
    tier1Group.add(shaft);
    registerMesh(shaft, region, 0, 0, false);

    // Textured open-cell white foam mounting cushion
    const foam = new THREE.Mesh(foamBlockGeo, foamMat());
    foam.position.set(side * 0.054, 0.014, 0);
    tier1Group.add(foam);
    registerMesh(foam, 'other', 0.014, 0, false);
  }

  // =========================================================================
  // 4. TWO RIBBED RUBBER WHEELS WITH RECESSED WHITE RIMS & HUBS (Photos 1-4)
  // =========================================================================
  const leftWheel = new THREE.Group();
  leftWheel.position.set(-0.097, 0, 0);
  const rightWheel = new THREE.Group();
  rightWheel.position.set(0.097, 0, 0);
  bodyPivot.add(leftWheel, rightWheel);

  const wheelRadius = 0.048;
  const wheelWidth = 0.024;
  const tireGeo = trackGeo(
    new THREE.CylinderGeometry(wheelRadius - 0.002, wheelRadius - 0.002, wheelWidth, 40),
  );
  tireGeo.rotateZ(Math.PI / 2);
  const rimInnerCoreGeo = trackGeo(new THREE.CylinderGeometry(0.036, 0.036, wheelWidth * 0.45, 32));
  rimInnerCoreGeo.rotateZ(Math.PI / 2);
  const rimLipGeo = trackGeo(new THREE.TorusGeometry(0.039, 0.0032, 12, 40));
  rimLipGeo.rotateY(Math.PI / 2);
  const hubCapGeo = trackGeo(new THREE.CylinderGeometry(0.0085, 0.011, 0.014, 20));
  hubCapGeo.rotateZ(Math.PI / 2);
  const hubPinGeo = trackGeo(new THREE.CylinderGeometry(0.0028, 0.0028, 0.016, 12));
  hubPinGeo.rotateZ(Math.PI / 2);
  const spokeGeo = trackGeo(new THREE.BoxGeometry(0.005, 0.072, 0.0048));
  const treadLugGeo = trackGeo(new THREE.BoxGeometry(wheelWidth - 0.0008, 0.0034, 0.0048));

  const treadCount = 32;
  const dummy = new THREE.Object3D();

  for (const [side, wheelGrp] of [
    [-1, leftWheel],
    [1, rightWheel],
  ] as const) {
    const tire = new THREE.Mesh(tireGeo, blackRubberMat());
    wheelGrp.add(tire);
    registerMesh(tire, 'wheels', 0, 0);

    const innerDish = new THREE.Mesh(rimInnerCoreGeo, whiteRimMat());
    wheelGrp.add(innerDish);
    registerMesh(innerDish, 'wheels', 0, 0, false);

    for (const lipSide of [-1, 1]) {
      const lip = new THREE.Mesh(rimLipGeo, whiteRimMat());
      lip.position.x = lipSide * (wheelWidth * 0.44);
      wheelGrp.add(lip);
      registerMesh(lip, 'wheels', 0, 0, false);
    }

    const hub = new THREE.Mesh(hubCapGeo, whiteRimMat());
    hub.position.x = side * (wheelWidth / 2 + 0.004);
    wheelGrp.add(hub);
    registerMesh(hub, 'wheels', 0, 0, false);

    const axlePin = new THREE.Mesh(hubPinGeo, brushedSteelMat());
    axlePin.position.x = side * (wheelWidth / 2 + 0.0045);
    wheelGrp.add(axlePin);

    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(spokeGeo, whiteRimMat());
      spoke.position.x = side * (wheelWidth * 0.25);
      spoke.rotation.x = (s * Math.PI) / 5;
      wheelGrp.add(spoke);
      registerMesh(spoke, 'wheels', 0, 0, false);
    }

    const treadMat = blackRubberMat();
    const treadInst = new THREE.InstancedMesh(treadLugGeo, treadMat, treadCount);
    treadInst.castShadow = true;
    treadInst.receiveShadow = true;
    for (let i = 0; i < treadCount; i++) {
      const ang = (i / treadCount) * Math.PI * 2;
      dummy.position.set(
        0,
        Math.cos(ang) * (wheelRadius - 0.0014),
        Math.sin(ang) * (wheelRadius - 0.0014),
      );
      dummy.rotation.set(-ang, 0, 0);
      dummy.updateMatrix();
      treadInst.setMatrixAt(i, dummy.matrix);
    }
    treadInst.instanceMatrix.needsUpdate = true;
    treadInst.computeBoundingSphere();
    wheelGrp.add(treadInst);
  }

  // =========================================================================
  // 5. FRONT HC-SR04 ULTRASONIC SENSOR ON TIER 1 (Macro Detail, Photos 1 & 3)
  // =========================================================================
  const hcsrGroup = new THREE.Group();
  hcsrGroup.position.set(0, tier1Y + 0.011, plateD / 2 - 0.006);
  tier1Group.add(hcsrGroup);

  const hcsrPcbGeo = trackGeo(new THREE.BoxGeometry(0.045, 0.020, 0.0020));
  const hcsrPcbMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: textures.hcsr04Pcb,
      roughness: 0.34,
      metalness: 0.08,
      clearcoat: 0.45,
      clearcoatRoughness: 0.2,
    }),
  );
  const hcsrPcb = new THREE.Mesh(hcsrPcbGeo, hcsrPcbMat);
  hcsrGroup.add(hcsrPcb);
  registerMesh(hcsrPcb, 'hcsr04', tier1Y + 0.011, plateD / 2);

  // Turned aluminum outer transducer barrels with hollow inner cup & piezo cone
  const barrelPoints = [
    new THREE.Vector2(0.0066, -0.006),
    new THREE.Vector2(0.0080, -0.006),
    new THREE.Vector2(0.0080, 0.0052),
    new THREE.Vector2(0.0074, 0.006),
    new THREE.Vector2(0.0068, 0.006),
    new THREE.Vector2(0.0068, -0.004),
    new THREE.Vector2(0.0001, -0.004),
  ];
  const transOuterGeo = trackGeo(new THREE.LatheGeometry(barrelPoints, 28));
  transOuterGeo.rotateX(Math.PI / 2);

  const piezoConeGeo = trackGeo(new THREE.ConeGeometry(0.0052, 0.0038, 20, 1, true));
  piezoConeGeo.rotateX(-Math.PI / 2);
  const piezoDomeGeo = trackGeo(new THREE.SphereGeometry(0.0018, 12, 8));
  const grilleDiscGeo = trackGeo(new THREE.CircleGeometry(0.0067, 24));
  const grilleMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.transducerMesh,
      transparent: true,
      alphaTest: 0.35,
      roughness: 0.35,
      metalness: 0.75,
      side: THREE.DoubleSide,
    }),
  );

  for (const sx of [-0.013, 0.013]) {
    const barrel = new THREE.Mesh(transOuterGeo, brushedSteelMat());
    barrel.position.set(sx, 0, 0.007);
    hcsrGroup.add(barrel);
    registerMesh(barrel, 'hcsr04', tier1Y + 0.011, plateD / 2 + 0.007);

    // Silver acoustic resonator cone recessed inside the transducer
    const cone = new THREE.Mesh(piezoConeGeo, brushedSteelMat());
    cone.position.set(sx, 0, 0.0058);
    hcsrGroup.add(cone);

    const dome = new THREE.Mesh(piezoDomeGeo, blackAnodizedMat());
    dome.position.set(sx, 0, 0.0042);
    hcsrGroup.add(dome);

    // Fine hexagonal perforated grille right behind front bezel lip
    const grille = new THREE.Mesh(grilleDiscGeo, grilleMat);
    grille.position.set(sx, 0, 0.0118);
    hcsrGroup.add(grille);
  }

  // Oval HC-49S 4.000MHz quartz crystal between transducers
  const crystalCanGeo = trackGeo(new THREE.CapsuleGeometry(0.0020, 0.0062, 6, 12));
  crystalCanGeo.rotateZ(Math.PI / 2);
  const crystal = new THREE.Mesh(crystalCanGeo, brushedSteelMat());
  crystal.position.set(0, -0.0052, 0.0030);
  hcsrGroup.add(crystal);
  registerMesh(crystal, 'hcsr04', tier1Y + 0.006, plateD / 2, false);

  // 4-pin header strip + gold square pins + 4 black DuPont housings on top of HC-SR04
  const pinSpacerGeo = trackGeo(new THREE.BoxGeometry(0.0025, 0.0025, 0.0025));
  const goldPinGeo = trackGeo(new THREE.BoxGeometry(0.00064, 0.008, 0.00064));
  const dupontHousingGeo = trackGeo(new THREE.BoxGeometry(0.00245, 0.0115, 0.00245));
  const crimpSlotGeo = trackGeo(new THREE.BoxGeometry(0.0012, 0.0032, 0.0004));

  const hcsrPinXs = [-0.0038, -0.00125, 0.00125, 0.0038];
  for (let i = 0; i < 4; i++) {
    const px = hcsrPinXs[i];
    const spacer = new THREE.Mesh(pinSpacerGeo, mattePlasticBlackMat());
    spacer.position.set(px, 0.0095, 0.001);
    hcsrGroup.add(spacer);

    const pin = new THREE.Mesh(goldPinGeo, goldPinMat());
    pin.position.set(px, 0.013, 0.001);
    hcsrGroup.add(pin);

    // Individual black DuPont connector sleeve plugged onto each pin
    const housing = new THREE.Mesh(dupontHousingGeo, mattePlasticBlackMat());
    housing.position.set(px, 0.0175, 0.001);
    hcsrGroup.add(housing);
    registerMesh(housing, 'hcsr04', tier1Y + 0.028, plateD / 2, false);

    const crimp = new THREE.Mesh(crimpSlotGeo, brushedSteelMat());
    crimp.position.set(px, 0.017, 0.0022);
    hcsrGroup.add(crimp);
  }

  // Active Ultrasonic TX/ECHO Status SMD LED on HC-SR04 PCB top-right corner
  const hcsrLedGeo = trackGeo(new THREE.SphereGeometry(0.0017, 10, 8));
  const hcsrLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.1,
    }),
  );
  const hcsrLed = new THREE.Mesh(hcsrLedGeo, hcsrLedMat);
  hcsrLed.position.set(0.0145, 0.0074, 0.0016);
  hcsrGroup.add(hcsrLed);

  // =========================================================================
  // 6. MIDDLE TIER (TIER 2): LM2596S Buck Converter + HC-05 Wireless Module
  // =========================================================================
  // 6a. Left: LM2596S Buck Converter mounted on white foam pad
  const buckGroup = new THREE.Group();
  buckGroup.position.set(-0.036, tier2Y + 0.0032, 0.014);
  tier2Group.add(buckGroup);

  const buckFoamGeo = trackGeo(new THREE.BoxGeometry(0.040, 0.0022, 0.020));
  const buckFoam = new THREE.Mesh(buckFoamGeo, foamMat());
  buckFoam.position.set(0, -0.0015, 0);
  buckGroup.add(buckFoam);
  registerMesh(buckFoam, 'other', tier2Y, 0.014, false);

  const buckPcbGeo = trackGeo(new THREE.BoxGeometry(0.043, 0.0018, 0.021));
  const buckPcbMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: textures.buckPcb,
      roughness: 0.34,
      metalness: 0.1,
      clearcoat: 0.45,
      clearcoatRoughness: 0.22,
    }),
  );
  const buckPcb = new THREE.Mesh(buckPcbGeo, buckPcbMat);
  buckGroup.add(buckPcb);
  registerMesh(buckPcb, 'buck', tier2Y + 0.004, 0.014);

  // Blue Bourns 3296W Multiturn Trimpot + Slotted Brass Screw
  const trimpotGeo = trackGeo(new THREE.BoxGeometry(0.0095, 0.0095, 0.0048));
  const trimpot = new THREE.Mesh(trimpotGeo, blueTerminalMat());
  trimpot.position.set(-0.013, 0.0055, 0.0048);
  buckGroup.add(trimpot);
  registerMesh(trimpot, 'buck', tier2Y + 0.008, 0.018, false);

  const brassScrewGeo = trackGeo(new THREE.CylinderGeometry(0.0013, 0.0013, 0.0014, 14));
  const trimScrew = new THREE.Mesh(brassScrewGeo, brassMat());
  trimScrew.position.set(-0.0155, 0.0106, 0.0048);
  buckGroup.add(trimScrew);

  const trimSlotGeo = trackGeo(new THREE.BoxGeometry(0.0022, 0.0005, 0.0004));
  const trimSlot = new THREE.Mesh(trimSlotGeo, blackAnodizedMat());
  trimSlot.position.set(-0.0155, 0.0112, 0.0048);
  trimSlot.rotation.y = 0.6;
  buckGroup.add(trimSlot);

  // Shielded Toroidal Power Inductor ("470" ferrite + copper winding belt)
  const inductorBaseGeo = trackGeo(new THREE.BoxGeometry(0.0115, 0.0055, 0.0115));
  const inductorCoreGeo = trackGeo(new THREE.CylinderGeometry(0.0048, 0.0048, 0.0052, 20));
  const copperBeltGeo = trackGeo(new THREE.TorusGeometry(0.0042, 0.0013, 8, 20));
  copperBeltGeo.rotateX(Math.PI / 2);

  const indBase = new THREE.Mesh(inductorBaseGeo, mattePlasticBlackMat());
  indBase.position.set(0.0085, 0.0036, -0.0025);
  buckGroup.add(indBase);
  registerMesh(indBase, 'buck', tier2Y + 0.006, 0.012, false);

  const indCore = new THREE.Mesh(inductorCoreGeo, blackAnodizedMat());
  indCore.position.set(0.0085, 0.0042, -0.0025);
  buckGroup.add(indCore);

  const indCopper = new THREE.Mesh(copperBeltGeo, copperMat());
  indCopper.position.set(0.0085, 0.0042, -0.0025);
  buckGroup.add(indCopper);

  // Two Radial Electrolytic Capacitors with aluminum vent tops
  const buckCapSleeveGeo = trackGeo(new THREE.CylinderGeometry(0.0038, 0.0038, 0.0095, 18));
  const buckCapTopGeo = trackGeo(new THREE.CircleGeometry(0.0036, 18));
  buckCapTopGeo.rotateX(-Math.PI / 2);
  const capTopMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.capTopTex,
      roughness: 0.25,
      metalness: 0.88,
    }),
  );
  const capSleeveMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x101826,
      roughness: 0.42,
      metalness: 0.12,
    }),
  );

  for (const [cx, cz] of [
    [-0.013, -0.0045],
    [0.0145, 0.0055],
  ]) {
    const capBody = new THREE.Mesh(buckCapSleeveGeo, capSleeveMat);
    capBody.position.set(cx, 0.0056, cz);
    buckGroup.add(capBody);
    registerMesh(capBody, 'buck', tier2Y + 0.008, 0.014, false);

    const capTop = new THREE.Mesh(buckCapTopGeo, capTopMat);
    capTop.position.set(cx, 0.0104, cz);
    buckGroup.add(capTop);
  }

  // LM2596S TO-263-5 IC + Copper Heatsink Tab + SMD Diode + Glowing Red LED
  const icBodyGeo = trackGeo(new THREE.BoxGeometry(0.009, 0.0032, 0.0075));
  const icTabGeo = trackGeo(new THREE.BoxGeometry(0.0095, 0.0010, 0.0035));
  const ic = new THREE.Mesh(icBodyGeo, mattePlasticBlackMat());
  ic.position.set(-0.001, 0.0025, -0.004);
  buckGroup.add(ic);
  const icTab = new THREE.Mesh(icTabGeo, solderTinMat());
  icTab.position.set(-0.001, 0.0014, -0.0085);
  buckGroup.add(icTab);

  const smdPinGeo = trackGeo(new THREE.BoxGeometry(0.0007, 0.0012, 0.0030));
  for (let p = -2; p <= 2; p++) {
    const pin = new THREE.Mesh(smdPinGeo, solderTinMat());
    pin.position.set(-0.001 + p * 0.0017, 0.0015, 0.0008);
    buckGroup.add(pin);
  }

  const redLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2a2a,
      emissive: 0xff1e1e,
      emissiveIntensity: 1.6,
      roughness: 0.25,
    }),
  );
  const smdLedGeo = trackGeo(new THREE.BoxGeometry(0.0022, 0.0010, 0.0014));
  const buckLed = new THREE.Mesh(smdLedGeo, redLedMat);
  buckLed.position.set(0.003, 0.0014, 0.0068);
  buckGroup.add(buckLed);

  // 4 Solder joints on Buck Converter pads (IN+, IN-, OUT+, OUT-)
  const buckSolderGeo = trackGeo(new THREE.SphereGeometry(0.0016, 10, 8));
  for (const [sx, sz] of [
    [-0.0185, -0.0072],
    [-0.0185, 0.0072],
    [0.0185, -0.0072],
    [0.0185, 0.0072],
  ]) {
    const blob = new THREE.Mesh(buckSolderGeo, solderTinMat());
    blob.scale.set(1, 0.65, 1);
    blob.position.set(sx, 0.0012, sz);
    buckGroup.add(blob);
  }

  // 6b. Right: HC-05 Wireless Module inside Clear Heat-Shrink Sleeve (Photos 1 & 3)
  const btGroup = new THREE.Group();
  btGroup.position.set(0.036, tier2Y + 0.0035, 0.010);
  btGroup.rotation.y = -Math.PI / 2; // +X header & DuPont sockets face +Z (front)
  tier2Group.add(btGroup);

  const btFoamGeo = trackGeo(new THREE.BoxGeometry(0.036, 0.0020, 0.016));
  const btFoam = new THREE.Mesh(btFoamGeo, foamMat());
  btFoam.position.set(0, -0.0016, 0);
  btGroup.add(btFoam);

  const btPcbGeo = trackGeo(new THREE.BoxGeometry(0.040, 0.0016, 0.018));
  const btPcbMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: textures.wirelessPcb,
      roughness: 0.35,
      metalness: 0.1,
      clearcoat: 0.4,
    }),
  );
  const btPcb = new THREE.Mesh(btPcbGeo, btPcbMat);
  btGroup.add(btPcb);
  registerMesh(btPcb, 'bt', tier2Y + 0.004, 0.010);

  // CSR BC417 QFN chip + 26MHz crystal + flash chip + tactile push button
  const btChipGeo = trackGeo(new THREE.BoxGeometry(0.0062, 0.0012, 0.0062));
  const btChip = new THREE.Mesh(btChipGeo, mattePlasticBlackMat());
  btChip.position.set(-0.001, 0.0014, -0.0015);
  btGroup.add(btChip);

  const btFlashGeo = trackGeo(new THREE.BoxGeometry(0.0045, 0.0012, 0.0038));
  const btFlash = new THREE.Mesh(btFlashGeo, mattePlasticBlackMat());
  btFlash.position.set(0.0065, 0.0014, 0.002);
  btGroup.add(btFlash);

  const btCrystalGeo = trackGeo(new THREE.BoxGeometry(0.0034, 0.0010, 0.0024));
  const btCrystal = new THREE.Mesh(btCrystalGeo, brushedSteelMat());
  btCrystal.position.set(-0.0055, 0.0013, 0.0035);
  btGroup.add(btCrystal);

  const btBtnBaseGeo = trackGeo(new THREE.BoxGeometry(0.0038, 0.0014, 0.0038));
  const btBtnDotGeo = trackGeo(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0016, 12));
  const btBtnBase = new THREE.Mesh(btBtnBaseGeo, brushedSteelMat());
  btBtnBase.position.set(0.011, 0.0015, -0.0045);
  btGroup.add(btBtnBase);
  const btBtnDot = new THREE.Mesh(btBtnDotGeo, mattePlasticBlackMat());
  btBtnDot.position.set(0.011, 0.0019, -0.0045);
  btGroup.add(btBtnDot);

  // Translucent clear heat-shrink wrap sleeve visible on real HC-05 modules
  const sleeveGeo = trackGeo(new THREE.BoxGeometry(0.032, 0.0046, 0.0192));
  const sleeveMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.22,
      roughness: 0.18,
      metalness: 0.02,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      depthWrite: false,
    }),
  );
  const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeve.position.set(-0.003, 0.0012, 0);
  btGroup.add(sleeve);

  // 6-pin right-angle gold header + black spacer + 4 plugged DuPont housings on HC-05 (+X end)
  const btPinSpacerGeo = trackGeo(new THREE.BoxGeometry(0.0024, 0.0024, 0.0155));
  const btSpacer = new THREE.Mesh(btPinSpacerGeo, mattePlasticBlackMat());
  btSpacer.position.set(0.0175, 0.0020, 0);
  btGroup.add(btSpacer);

  const btPinGeo = trackGeo(new THREE.BoxGeometry(0.0085, 0.00064, 0.00064));
  const btDupontGeo = trackGeo(new THREE.BoxGeometry(0.0115, 0.00245, 0.00245));
  const btPinZs = [-0.00635, -0.00381, -0.00127, 0.00127, 0.00381, 0.00635];
  for (let i = 0; i < 6; i++) {
    const pz = btPinZs[i];
    const pin = new THREE.Mesh(btPinGeo, goldPinMat());
    pin.position.set(0.0215, 0.0020, pz);
    btGroup.add(pin);

    // Plug 4 DuPont sockets on pins 1..4 (matching the 4 HC-SR04 wires!)
    if (i >= 1 && i <= 4) {
      const housing = new THREE.Mesh(btDupontGeo, mattePlasticBlackMat());
      housing.position.set(0.0265, 0.0020, pz);
      btGroup.add(housing);
    }
  }

  // =========================================================================
  // 7. TOP TIER (TIER 3): L298N, MPU-6050, Weathered Counterweight, Tape
  // =========================================================================
  // 7a. Red L298N Dual H-Bridge Motor Driver (Right side, Photos 1, 4, 5)
  const l298nGroup = new THREE.Group();
  l298nGroup.position.set(0.038, tier3Y + 0.0038, -0.005);
  tier3Group.add(l298nGroup);

  const l298nWorldAnchor = new THREE.Object3D();
  l298nWorldAnchor.position.set(0, 0.015, 0);
  l298nGroup.add(l298nWorldAnchor);

  // White foam double-sided pad underneath L298N (visible in Photos 1 & 4)
  const l298nFoamGeo = trackGeo(new THREE.BoxGeometry(0.042, 0.0032, 0.042));
  const l298nFoam = new THREE.Mesh(l298nFoamGeo, foamMat());
  l298nFoam.position.set(0, -0.0022, 0);
  l298nGroup.add(l298nFoam);
  registerMesh(l298nFoam, 'other', tier3Y, -0.005, false);

  const l298nPcbGeo = trackGeo(new THREE.BoxGeometry(0.044, 0.0020, 0.044));
  const l298nPcbMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: textures.l298nPcb,
      roughness: 0.30,
      metalness: 0.12,
      clearcoat: 0.55,
      clearcoatRoughness: 0.16,
    }),
  );
  const l298nPcb = new THREE.Mesh(l298nPcbGeo, l298nPcbMat);
  l298nGroup.add(l298nPcb);
  registerMesh(l298nPcb, 'l298n', tier3Y + 0.004, -0.005);

  // 5-fin black anodized heatsink + Multiwatt-15 L298N IC + M3 mounting bolt + 15 bent leads
  const heatsinkBaseGeo = trackGeo(new THREE.BoxGeometry(0.025, 0.022, 0.0042));
  const heatsinkFinGeo = trackGeo(new THREE.BoxGeometry(0.0020, 0.022, 0.011));
  const l298nIcGeo = trackGeo(new THREE.BoxGeometry(0.020, 0.012, 0.0045));
  const m3BoltGeo = trackGeo(new THREE.CylinderGeometry(0.0024, 0.0024, 0.012, 12));
  m3BoltGeo.rotateX(Math.PI / 2);

  const hsBase = new THREE.Mesh(heatsinkBaseGeo, blackAnodizedMat());
  hsBase.position.set(0.002, 0.012, -0.013);
  l298nGroup.add(hsBase);
  registerMesh(hsBase, 'l298n', tier3Y + 0.016, -0.018);

  for (let f = -2; f <= 2; f++) {
    const fin = new THREE.Mesh(heatsinkFinGeo, blackAnodizedMat());
    fin.position.set(0.002 + f * 0.0052, 0.012, -0.0175);
    l298nGroup.add(fin);
    registerMesh(fin, 'l298n', tier3Y + 0.016, -0.022, false);
  }

  const l298nIc = new THREE.Mesh(l298nIcGeo, mattePlasticBlackMat());
  l298nIc.position.set(0.002, 0.010, -0.0085);
  l298nGroup.add(l298nIc);

  const hsBolt = new THREE.Mesh(m3BoltGeo, brushedSteelMat());
  hsBolt.position.set(0.002, 0.014, -0.012);
  l298nGroup.add(hsBolt);

  // 15 staggered Multiwatt-15 silver IC pins
  const icLeadGeo = trackGeo(new THREE.BoxGeometry(0.0006, 0.006, 0.0018));
  for (let p = 0; p < 15; p++) {
    const px = -0.0068 + p * 0.00125;
    const pz = p % 2 === 0 ? -0.0068 : -0.0048;
    const lead = new THREE.Mesh(icLeadGeo, solderTinMat());
    lead.position.set(px, 0.0035, pz);
    l298nGroup.add(lead);
  }

  // Two large radial electrolytic capacitors with aluminum K-vent tops
  const l298nCapGeo = trackGeo(new THREE.CylinderGeometry(0.0050, 0.0050, 0.0128, 20));
  const l298nCapTopGeo = trackGeo(new THREE.CircleGeometry(0.0048, 20));
  l298nCapTopGeo.rotateX(-Math.PI / 2);
  for (const cx of [-0.0075, 0.0065]) {
    const cap = new THREE.Mesh(l298nCapGeo, capSleeveMat);
    cap.position.set(cx, 0.0074, 0.0035);
    l298nGroup.add(cap);
    registerMesh(cap, 'l298n', tier3Y + 0.010, 0.0, false);

    const cTop = new THREE.Mesh(l298nCapTopGeo, capTopMat);
    cTop.position.set(cx, 0.0139, 0.0035);
    l298nGroup.add(cTop);
  }

  // 8x M7 SMD Flyback Diodes (two rows of 4, black epoxy + silver cathode band)
  const diodeGeo = trackGeo(new THREE.BoxGeometry(0.0028, 0.0020, 0.0042));
  const diodeBandGeo = trackGeo(new THREE.BoxGeometry(0.0029, 0.0021, 0.0010));
  for (const dx of [-0.0155, -0.0115, 0.0145, 0.0185]) {
    for (const dz of [-0.014, -0.0075]) {
      const diode = new THREE.Mesh(diodeGeo, mattePlasticBlackMat());
      diode.position.set(dx, 0.0020, dz);
      l298nGroup.add(diode);
      const band = new THREE.Mesh(diodeBandGeo, solderTinMat());
      band.position.set(dx, 0.0020, dz + 0.0013);
      l298nGroup.add(band);
    }
  }

  // 3 Blue Screw Terminal Blocks with recessed silver screws & dark wire entry ports
  const terminalBlockGeo = trackGeo(new THREE.BoxGeometry(0.013, 0.009, 0.008));
  const termScrewGeo = trackGeo(new THREE.CylinderGeometry(0.0016, 0.0016, 0.0012, 12));
  const termPortGeo = trackGeo(new THREE.BoxGeometry(0.0032, 0.0032, 0.0010));

  const addTerminalBlock = (
    x: number,
    z: number,
    rotY: number,
    ports: number,
  ) => {
    const blkGrp = new THREE.Group();
    blkGrp.position.set(x, 0.0055, z);
    blkGrp.rotation.y = rotY;
    l298nGroup.add(blkGrp);

    const body = new THREE.Mesh(terminalBlockGeo, blueTerminalMat());
    body.scale.set(ports === 3 ? 1.15 : 0.85, 1, 1);
    blkGrp.add(body);
    registerMesh(body, 'l298n', tier3Y + 0.008, z - 0.005, false);

    const spacing = 0.0048;
    const startX = -((ports - 1) * spacing) / 2;
    for (let i = 0; i < ports; i++) {
      const sx = startX + i * spacing;
      const screw = new THREE.Mesh(termScrewGeo, brushedSteelMat());
      screw.position.set(sx, 0.0044, 0);
      blkGrp.add(screw);

      const port = new THREE.Mesh(termPortGeo, mattePlasticBlackMat());
      port.position.set(sx, -0.0005, 0.0038);
      blkGrp.add(port);
    }
  };

  addTerminalBlock(-0.0155, -0.003, -Math.PI / 2, 2); // OUT1 / OUT2
  addTerminalBlock(-0.0155, 0.0115, Math.PI / 2, 3); // +12V / GND / +5V
  addTerminalBlock(0.0155, -0.002, Math.PI / 2, 2); // OUT3 / OUT4

  // Glowing Red Power LED on L298N
  const l298nLed = new THREE.Mesh(smdLedGeo, redLedMat);
  l298nLed.position.set(-0.003, 0.0015, 0.012);
  l298nGroup.add(l298nLed);

  // 6-pin logic header (ENA IN1 IN2 IN3 IN4 ENB) along +Z edge of L298N + DuPont sockets
  const l298nHeaderX = [-0.003, -0.0005, 0.002, 0.0045, 0.007, 0.0095];
  for (let i = 0; i < 6; i++) {
    const px = l298nHeaderX[i];
    const spacer = new THREE.Mesh(pinSpacerGeo, mattePlasticBlackMat());
    spacer.position.set(px, 0.0022, 0.0175);
    l298nGroup.add(spacer);

    const pin = new THREE.Mesh(goldPinGeo, goldPinMat());
    pin.position.set(px, 0.0055, 0.0175);
    l298nGroup.add(pin);

    if (i >= 1 && i <= 4) {
      const sock = new THREE.Mesh(dupontHousingGeo, mattePlasticBlackMat());
      sock.position.set(px, 0.010, 0.0175);
      l298nGroup.add(sock);
    }
  }

  // 7b. Blue GY-521 MPU-6050 IMU near center hole (Photo 5)
  const mpuGroup = new THREE.Group();
  mpuGroup.position.set(-0.006, tier3Y + 0.0024, 0.022);
  mpuGroup.rotation.y = -0.14;
  tier3Group.add(mpuGroup);

  const mpuPcbGeo = trackGeo(new THREE.BoxGeometry(0.021, 0.0018, 0.016));
  const mpuPcbMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: textures.mpu6050Pcb,
      roughness: 0.34,
      metalness: 0.1,
      clearcoat: 0.45,
    }),
  );
  const mpuPcb = new THREE.Mesh(mpuPcbGeo, mpuPcbMat);
  mpuGroup.add(mpuPcb);
  registerMesh(mpuPcb, 'mpu', tier3Y + 0.004, 0.022);

  const mpuChipGeo = trackGeo(new THREE.BoxGeometry(0.0042, 0.0010, 0.0042));
  const mpuChip = new THREE.Mesh(mpuChipGeo, mattePlasticBlackMat());
  mpuChip.position.set(-0.001, 0.0014, 0.0);
  mpuGroup.add(mpuChip);
  registerMesh(mpuChip, 'mpu', tier3Y + 0.005, 0.022, false);

  // Tiny tan MLCC SMD capacitors & green power LED on MPU-6050
  const smdCapGeo = trackGeo(new THREE.BoxGeometry(0.0018, 0.0009, 0.0010));
  const smdTanMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc2955d, roughness: 0.45, metalness: 0.1 }),
  );
  for (const [cx, cz] of [
    [-0.0055, -0.003],
    [-0.0055, 0.0025],
    [0.003, -0.004],
  ]) {
    const c = new THREE.Mesh(smdCapGeo, smdTanMat);
    c.position.set(cx, 0.0013, cz);
    mpuGroup.add(c);
  }
  const greenLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    }),
  );
  const mpuLed = new THREE.Mesh(smdLedGeo, greenLedMat);
  mpuLed.position.set(-0.006, 0.0013, 0.0055);
  mpuGroup.add(mpuLed);

  // 8-pin gold header + black spacer + 4 plugged DuPont housings on MPU-6050
  for (let i = 0; i < 8; i++) {
    const pz = -0.0062 + i * 0.00178;
    const spacer = new THREE.Mesh(pinSpacerGeo, mattePlasticBlackMat());
    spacer.scale.set(0.85, 0.85, 0.72);
    spacer.position.set(0.0084, 0.0018, pz);
    mpuGroup.add(spacer);

    const pin = new THREE.Mesh(goldPinGeo, goldPinMat());
    pin.position.set(0.0084, 0.0048, pz);
    mpuGroup.add(pin);

    if (i < 4) {
      const sock = new THREE.Mesh(dupontHousingGeo, mattePlasticBlackMat());
      sock.scale.set(0.85, 0.9, 0.72);
      sock.position.set(0.0084, 0.0088, pz);
      mpuGroup.add(sock);
    }
  }

  // 7c. Weathered Cream Counterweight Block (Photos 4 & 5)
  const blockGeo = trackGeo(new THREE.BoxGeometry(0.036, 0.015, 0.018));
  const blockMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.counterweightColor,
      bumpMap: textures.counterweightBump,
      bumpScale: 0.0016,
      roughness: 0.82,
      metalness: 0.04,
    }),
  );
  const counterBlock = new THREE.Mesh(blockGeo, blockMat);
  counterBlock.position.set(0.006, tier3Y + 0.0085, -plateD / 2 + 0.009);
  tier3Group.add(counterBlock);
  registerMesh(counterBlock, 'counterweight', tier3Y + 0.009, -plateD / 2 + 0.009);

  const blockBoreGeo = trackGeo(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0155, 20));
  const counterBore = new THREE.Mesh(blockBoreGeo, blackAnodizedMat());
  counterBore.position.set(0.006, tier3Y + 0.0086, -plateD / 2 + 0.009);
  tier3Group.add(counterBore);
  registerMesh(counterBore, 'counterweight', tier3Y + 0.009, -plateD / 2 + 0.009, false);

  const sideBoreGeo = trackGeo(new THREE.CylinderGeometry(0.0020, 0.0020, 0.0155, 14));
  for (const bx of [-0.005, 0.017]) {
    const sb = new THREE.Mesh(sideBoreGeo, blackAnodizedMat());
    sb.position.set(bx, tier3Y + 0.0086, -plateD / 2 + 0.009);
    tier3Group.add(sb);
  }

  // 7d. Two glossy white vinyl tape strips on left side of Tier 3 (Photo 5)
  const tapeGeo = trackGeo(new THREE.BoxGeometry(0.011, 0.0007, 0.095));
  const tape1 = new THREE.Mesh(tapeGeo, vinylTapeMat());
  tape1.position.set(-0.048, tier3Y + 0.0012, 0.0);
  tape1.rotation.y = 0.08;
  const tape2 = new THREE.Mesh(tapeGeo, vinylTapeMat());
  tape2.position.set(-0.035, tier3Y + 0.0019, 0.0);
  tape2.rotation.y = -0.10;
  tier3Group.add(tape1, tape2);
  registerMesh(tape1, 'other', tier3Y, 0, false);
  registerMesh(tape2, 'other', tier3Y, 0, false);

  // =========================================================================
  // 8. TERMINATED DUPONT & SOLDERED HARNESS WIRING (ZERO FLOATING WIRES!)
  // =========================================================================
  function createWireMesh(
    pts: [number, number, number][],
    color: number,
    radius = 0.00105,
    tubularSegments = 24,
  ): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(
      pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    );
    const tubeGeo = trackGeo(new THREE.TubeGeometry(curve, tubularSegments, radius, 7, false));
    const tubeMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.44,
        metalness: 0.04,
        clearcoat: 0.15,
      }),
    );
    return new THREE.Mesh(tubeGeo, tubeMat);
  }

  interface SignalTrack {
    curve: THREE.CatmullRomCurve3;
    parent: THREE.Group;
    startTier: 1 | 2 | 3;
    endTier: 1 | 2 | 3;
    basePts: THREE.Vector3[];
    color: number;
    speedScale: number;
  }
  const signalTracks: SignalTrack[] = [];

  function addStaticTierWire(
    targetGroup: THREE.Group,
    pts: [number, number, number][],
    color: number,
    localY: number,
    radius = 0.00105,
    trackSignal = false,
    signalColor = 0xfacc15,
  ) {
    const mesh = createWireMesh(pts, color, radius);
    targetGroup.add(mesh);
    registerMesh(mesh, 'other', localY, 0, false);
    if (trackSignal) {
      const vecPts = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
      signalTracks.push({
        curve: new THREE.CatmullRomCurve3(vecPts),
        parent: targetGroup,
        startTier: 3,
        endTier: 3,
        basePts: vecPts,
        color: signalColor,
        speedScale: 1.0,
      });
    }
  }

  function addInterTierWire(
    startTier: 1 | 2 | 3,
    endTier: 1 | 2 | 3,
    pts: [number, number, number][],
    color: number,
    radius = 0.00105,
    trackSignal = false,
    signalColor = 0x38bdf8,
  ) {
    const vecPts = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const mesh = createWireMesh(pts, color, radius, 26);
    tier1Group.add(mesh);
    registerMesh(mesh, 'other', tier2Y, 0, false);
    dynamicWires.push({
      mesh,
      startTier,
      endTier,
      basePts: vecPts,
      radius,
      tubularSegments: 26,
      radialSegments: 7,
    });
    if (trackSignal) {
      signalTracks.push({
        curve: new THREE.CatmullRomCurve3(vecPts),
        parent: tier1Group,
        startTier,
        endTier,
        basePts: vecPts,
        color: signalColor,
        speedScale: startTier === 1 ? 1.25 : 0.9,
      });
    }
  }

  // A) Tier 3 internal MPU-6050 -> L298N logic header (yellow, orange, green, blue)
  // Plugged directly into top of MPU-6050 DuPont sockets -> loops smoothly -> into L298N IN1-IN4 DuPont sockets!
  const mpuStartY = tier3Y + 0.0155;
  const l298nInY = tier3Y + 0.0185;
  addStaticTierWire(
    tier3Group,
    [
      [0.0018, mpuStartY, 0.0165],
      [0.010, tier3Y + 0.032, 0.034],
      [0.025, tier3Y + 0.028, 0.030],
      [0.0375, l298nInY, 0.0125],
    ],
    0xfacc15,
    tier3Y + 0.02,
    0.00105,
    true,
    0xfde047,
  );
  addStaticTierWire(
    tier3Group,
    [
      [0.0020, mpuStartY, 0.0183],
      [0.012, tier3Y + 0.034, 0.038],
      [0.028, tier3Y + 0.030, 0.033],
      [0.0400, l298nInY, 0.0125],
    ],
    0xf97316,
    tier3Y + 0.02,
  );
  addStaticTierWire(
    tier3Group,
    [
      [0.0022, mpuStartY, 0.0201],
      [0.014, tier3Y + 0.026, 0.032],
      [0.031, tier3Y + 0.024, 0.026],
      [0.0425, l298nInY, 0.0125],
    ],
    0x22c55e,
    tier3Y + 0.02,
  );
  addStaticTierWire(
    tier3Group,
    [
      [0.0025, mpuStartY, 0.0219],
      [0.016, tier3Y + 0.022, 0.028],
      [0.034, tier3Y + 0.022, 0.022],
      [0.0450, l298nInY, 0.0125],
    ],
    0x3b82f6,
    tier3Y + 0.02,
  );

  // B) Tier 3 taped left-side DuPont loose harness ends (matching Photo 5's black DuPont ends held by white tape!)
  const leftLooseEndXs = [-0.068, -0.064, -0.060, -0.056];
  const leftLooseColors = [0x1e293b, 0x3b82f6, 0xfacc15, 0xf97316];
  for (let i = 0; i < 4; i++) {
    const lx = leftLooseEndXs[i];
    const lz = -0.010 + i * 0.0075;
    const plug = new THREE.Mesh(dupontHousingGeo, mattePlasticBlackMat());
    plug.rotation.z = Math.PI / 2;
    plug.rotation.y = 0.28;
    plug.position.set(lx, tier3Y + 0.0024, lz);
    tier3Group.add(plug);

    addStaticTierWire(
      tier3Group,
      [
        [lx + 0.005, tier3Y + 0.0022, lz],
        [-0.041, tier3Y + 0.0016, lz + 0.004],
        [-0.018, tier3Y + 0.018, 0.028 + i * 0.003],
        [0.012, tier3Y + 0.022, 0.025],
        [0.022 + i * 0.003, tier3Y + 0.010, -0.006],
      ],
      leftLooseColors[i],
      tier3Y + 0.01,
    );
  }

  // C) HC-SR04 (Tier 1 front) -> HC-05 Wireless Module (Tier 2 right) 4-wire harness
  // Exits TOP of the 4 black DuPont housings on HC-SR04 -> loops cleanly in front of Tier 2 edge -> plugs into HC-05 DuPont sockets!
  const hcsrPlugTopY = tier1Y + 0.034;
  const hcsrPlugZ = plateD / 2 - 0.005;
  const btTargetX = 0.036;
  const btTargetY = tier2Y + 0.0055;
  const btTargetZ = 0.010 + 0.0315; // +X of -PI/2 rotated btGroup points toward +Z
  const hcsrColors = [0x1e293b, 0xe2e8f0, 0x16a34a, 0x64748b];
  for (let i = 0; i < 4; i++) {
    const sx = hcsrPinXs[i];
    const ex = btTargetX - btPinZs[i + 1];
    addInterTierWire(
      1,
      2,
      [
        [sx, hcsrPlugTopY, hcsrPlugZ],
        [sx + 0.004 * i, hcsrPlugTopY + 0.013, plateD / 2 + 0.005],
        [0.016 + i * 0.004, tier2Y + 0.0085, plateD / 2 + 0.0045],
        [ex, tier2Y + 0.0082, 0.052],
        [ex, btTargetY, btTargetZ],
      ],
      hcsrColors[i],
      0.00105,
      i === 1 || i === 2,
      i === 1 ? 0x38bdf8 : 0x34d399,
    );
  }

  // D) LM2596S Buck Converter (Tier 2) -> L298N +12V/GND Screw Terminal (Tier 3) via center hole
  addInterTierWire(
    2,
    3,
    [
      [-0.0175, tier2Y + 0.0042, 0.0068], // Buck OUT+ solder blob
      [-0.004, tier2Y + 0.009, 0.004], // Approaches Tier 2 center hole
      [0.002, tier3Y - 0.012, 0.004], // Passes cleanly inside Tier 3 center hole
      [0.010, tier3Y + 0.010, 0.008],
      [0.022, tier3Y + 0.009, 0.004], // Enters L298N +12V blue terminal port
    ],
    0xdc2626,
    0.00125,
    true,
    0xf59e0b,
  );
  addInterTierWire(
    2,
    3,
    [
      [-0.0175, tier2Y + 0.0042, 0.0212], // Buck OUT- solder blob
      [-0.002, tier2Y + 0.009, 0.006],
      [-0.002, tier3Y - 0.012, 0.003],
      [0.010, tier3Y + 0.008, 0.005],
      [0.022, tier3Y + 0.009, 0.0085], // Enters L298N GND blue terminal port
    ],
    0x1e293b,
    0.00125,
  );

  // E) L298N OUT1..OUT4 Terminals (Tier 3) -> Center holes -> Rear edge of Tier 1 -> DC Motor solder tabs
  // Never pierces solid Tier 1 deck; wraps around rear edge (z = -0.067) just like the real robot photos!
  addInterTierWire(
    1,
    3,
    [
      [-0.022, -0.002, -0.008], // Left motor solder tab -
      [-0.016, 0.004, -0.048],
      [-0.010, 0.015, -plateD / 2 - 0.005],
      [-0.006, tier1Y + 0.012, -0.036],
      [-0.004, tier2Y - 0.012, 0.001],
      [-0.003, tier3Y - 0.005, 0.003],
      [0.012, tier3Y + 0.011, -0.009],
      [0.022, tier3Y + 0.009, -0.010], // L298N OUT1 terminal
    ],
    0xdc2626,
    0.00105,
    true,
    0xfb7185,
  );
  addInterTierWire(
    1,
    3,
    [
      [-0.022, -0.002, 0.008], // Left motor solder tab +
      [-0.014, 0.003, -0.042],
      [-0.007, 0.016, -plateD / 2 - 0.004],
      [-0.003, tier1Y + 0.014, -0.032],
      [-0.001, tier2Y - 0.012, 0.004],
      [0.000, tier3Y - 0.005, 0.005],
      [0.012, tier3Y + 0.011, -0.005],
      [0.022, tier3Y + 0.009, -0.006], // L298N OUT2 terminal
    ],
    0x1e293b,
  );
  addInterTierWire(
    1,
    3,
    [
      [0.022, -0.002, -0.008], // Right motor solder tab -
      [0.016, 0.004, -0.048],
      [0.010, 0.015, -plateD / 2 - 0.005],
      [0.006, tier1Y + 0.012, -0.036],
      [0.004, tier2Y - 0.012, 0.002],
      [0.003, tier3Y - 0.005, 0.003],
      [0.044, tier3Y + 0.012, -0.009],
      [0.054, tier3Y + 0.009, -0.009], // L298N OUT3 terminal
    ],
    0x2563eb,
  );
  addInterTierWire(
    1,
    3,
    [
      [0.022, -0.002, 0.008], // Right motor solder tab +
      [0.014, 0.003, -0.042],
      [0.007, 0.016, -plateD / 2 - 0.004],
      [0.003, tier1Y + 0.014, -0.032],
      [0.001, tier2Y - 0.012, 0.005],
      [0.001, tier3Y - 0.005, 0.006],
      [0.046, tier3Y + 0.012, -0.004],
      [0.054, tier3Y + 0.009, -0.004], // L298N OUT4 terminal
    ],
    0xe2e8f0,
  );

  // =========================================================================
  // LIVE CONTROL SIGNAL PULSES ALONG DUPONT HARNESSES
  // =========================================================================
  const pulseBeadGeo = trackGeo(new THREE.SphereGeometry(0.0022, 8, 8));
  const pulseBeadMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
    }),
  );
  // 2 pulses per tracked wire (MPU->L298N, plus inter-tier motor/sensor signals)
  const trackedWireIndices = [0, 1, 2, 3, 4];
  const pulsesPerTrack = 2;
  const totalPulseBeads = Math.max(1, trackedWireIndices.length * pulsesPerTrack);
  const pulseInstanced = new THREE.InstancedMesh(pulseBeadGeo, pulseBeadMat, totalPulseBeads);
  pulseInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pulseInstanced.frustumCulled = false;
  pulseInstanced.visible = false;
  tier1Group.add(pulseInstanced);

  const _pulsePos = new THREE.Vector3();
  const _pulseMat4 = new THREE.Matrix4();
  const _pulseCol = new THREE.Color();

  // =========================================================================
  // METHODS: Wireframe, Exploded View, Highlight, Signal Pulses, Field Map
  // =========================================================================
  let lastExplodedAmount = 0;
  let highlightedPart: RobotPartRegion | null = null;

  function setWireframeVisible(visible: boolean) {
    for (const line of wireframeLines) {
      line.visible = visible;
    }
  }

  function setHighlightedPart(part: RobotPartRegion | null) {
    highlightedPart = part;
  }

  function setExploded(amount: number) {
    tier2Group.position.y = amount * 0.045;
    tier3Group.position.y = amount * 0.090;

    if (Math.abs(amount - lastExplodedAmount) > 0.0015) {
      lastExplodedAmount = amount;
      const tierOffset = (t: 1 | 2 | 3) => (t === 1 ? 0 : t === 2 ? amount * 0.045 : amount * 0.090);

      for (const dw of dynamicWires) {
        const y0 = tierOffset(dw.startTier);
        const y1 = tierOffset(dw.endTier);
        const shiftedPts = dw.basePts.map((pt, idx) => {
          const frac = idx / Math.max(1, dw.basePts.length - 1);
          return new THREE.Vector3(pt.x, pt.y + y0 + (y1 - y0) * frac, pt.z);
        });
        const newCurve = new THREE.CatmullRomCurve3(shiftedPts);
        const newGeo = new THREE.TubeGeometry(
          newCurve,
          dw.tubularSegments,
          dw.radius,
          dw.radialSegments,
          false,
        );
        const oldGeo = dw.mesh.geometry;
        dw.mesh.geometry = newGeo;
        oldGeo.dispose();
        const geoIdx = geometriesToDispose.indexOf(oldGeo);
        if (geoIdx !== -1) {
          geometriesToDispose[geoIdx] = newGeo;
        } else {
          geometriesToDispose.push(newGeo);
        }
      }

      for (const st of signalTracks) {
        const y0 = tierOffset(st.startTier);
        const y1 = tierOffset(st.endTier);
        const shifted = st.basePts.map((pt, idx) => {
          const frac = idx / Math.max(1, st.basePts.length - 1);
          return new THREE.Vector3(pt.x, pt.y + y0 + (y1 - y0) * frac, pt.z);
        });
        st.curve = new THREE.CatmullRomCurve3(shifted);
      }
    }
  }

  function updateSignalPulses(
    visible: boolean,
    elapsedTime: number,
    motorCurrent: number,
  ) {
    pulseInstanced.visible = visible && signalTracks.length > 0;
    if (!pulseInstanced.visible) return;

    const rate = 0.65 + Math.min(1.6, motorCurrent * 0.65);
    const tier3OffY = lastExplodedAmount * 0.090;
    let instanceIdx = 0;

    for (let tIdx = 0; tIdx < signalTracks.length && instanceIdx < totalPulseBeads; tIdx++) {
      const track = signalTracks[tIdx];
      for (let p = 0; p < pulsesPerTrack && instanceIdx < totalPulseBeads; p++) {
        const u = (elapsedTime * rate * track.speedScale + p / pulsesPerTrack + tIdx * 0.17) % 1;
        track.curve.getPointAt(u, _pulsePos);
        if (track.parent === tier3Group) {
          _pulsePos.y += tier3OffY;
        }
        const s = 0.85 + 0.35 * Math.sin(elapsedTime * 8 + instanceIdx);
        _pulseMat4.makeScale(s, s, s);
        _pulseMat4.setPosition(_pulsePos);
        pulseInstanced.setMatrixAt(instanceIdx, _pulseMat4);
        _pulseCol.setHex(track.color);
        pulseInstanced.setColorAt(instanceIdx, _pulseCol);
        instanceIdx++;
      }
    }
    while (instanceIdx < totalPulseBeads) {
      _pulseMat4.makeScale(0, 0, 0);
      pulseInstanced.setMatrixAt(instanceIdx, _pulseMat4);
      instanceIdx++;
    }
    pulseInstanced.instanceMatrix.needsUpdate = true;
    if (pulseInstanced.instanceColor) pulseInstanced.instanceColor.needsUpdate = true;
  }

  function applyFieldVisualization(
    field: FieldVariable,
    colormap: ColormapName,
    thermal: ThermalState,
    stress: StructuralAndAcousticMetrics,
    windSpeed: number,
    ambientTemp: number,
  ) {
    if (field === 'physical') {
      for (const item of colorables) {
        const mat = item.mesh.material as THREE.MeshStandardMaterial;
        mat.color.copy(item.baseColor);
        const isHighlighted =
          highlightedPart !== null &&
          highlightedPart !== 'other' &&
          item.region === highlightedPart;
        if (isHighlighted) {
          mat.emissive.setHex(0xd99b42);
          mat.emissiveIntensity = 0.32;
        } else {
          mat.emissive.copy(item.baseEmissive);
          mat.emissiveIntensity = item.baseEmissiveIntensity;
        }
        mat.roughness = item.baseRoughness;
        mat.metalness = item.baseMetalness;
        if (item.hasMap && mat.map !== item.baseMap) {
          mat.map = item.baseMap;
          mat.needsUpdate = true;
        }
      }
      return;
    }

    for (const item of colorables) {
      const mat = item.mesh.material as THREE.MeshStandardMaterial;
      let t = 0.25;

      if (field === 'temperature') {
        let tempC = thermal.chassisTempC;
        if (item.region === 'l298n') tempC = thermal.l298nTempC;
        else if (item.region === 'motorLeft') tempC = thermal.motorLeftTempC;
        else if (item.region === 'motorRight') tempC = thermal.motorRightTempC;
        else if (item.region === 'buck') tempC = thermal.buckTempC;
        else if (item.region === 'mpu') tempC = thermal.mpuTempC;
        else if (item.region === 'plate3') tempC = (thermal.chassisTempC + thermal.l298nTempC * 0.25) / 1.25;
        else if (item.region === 'wheels' || item.region === 'hcsr04') tempC = ambientTemp + 1.5;

        t = (tempC - ambientTemp) / Math.max(15, 95 - ambientTemp);
      } else if (field === 'stress') {
        let mpa = 0.5;
        if (item.region === 'standoffs') mpa = stress.standoffStressMpa;
        else if (item.region === 'plate1' || item.region === 'plate2' || item.region === 'plate3') {
          mpa = stress.plateBendingMpa * (0.65 + Math.abs(item.localZ) * 3.0);
        } else if (item.region === 'motorLeft' || item.region === 'motorRight') {
          mpa = stress.standoffStressMpa * 0.7;
        }
        t = mpa / 12.0;
      } else if (field === 'pressure') {
        const zNorm = (item.localZ + 0.08) / 0.16;
        const stagnationScale = Math.min(1, windSpeed / 8.0);
        t = 0.5 + (zNorm - 0.5) * 0.85 * Math.max(0.25, stagnationScale);
      } else if (field === 'velocity') {
        t = item.region === 'l298n' || item.region === 'hcsr04' ? 0.18 : 0.06;
      } else if (field === 'vorticity') {
        t = item.region === 'l298n' || item.region === 'standoffs' ? 0.72 : 0.25;
      }

      sampleColormapNormalized(colormap, t, _rgb);
      if (item.hasMap && mat.map !== null) {
        mat.map = null;
        mat.needsUpdate = true;
      }
      mat.color.setRGB(_rgb[0], _rgb[1], _rgb[2]);
      mat.metalness = 0.15;
      mat.roughness = 0.42;
      if (field === 'temperature' && t > 0.45) {
        mat.emissive.setRGB(_rgb[0] * 0.45, _rgb[1] * 0.25, _rgb[2] * 0.15);
        mat.emissiveIntensity = (t - 0.45) * 0.8;
      } else {
        mat.emissive.setRGB(0, 0, 0);
        mat.emissiveIntensity = 0;
      }
    }
  }

  function updateHcsrStatus(
    active: boolean,
    working: boolean,
    detected: boolean,
    elapsedTime: number,
  ) {
    if (!active) {
      hcsrLedMat.color.setHex(0x334155);
      hcsrLedMat.emissive.setHex(0x000000);
      hcsrLedMat.emissiveIntensity = 0;
      return;
    }
    const pulse = 0.55 + 0.45 * Math.sin(elapsedTime * (detected ? 14 : 7.5));
    if (!working) {
      hcsrLedMat.color.setHex(0xf97316);
      hcsrLedMat.emissive.setHex(0xf97316);
      hcsrLedMat.emissiveIntensity = 0.45 + 0.35 * pulse;
    } else if (detected) {
      hcsrLedMat.color.setHex(0x34d399);
      hcsrLedMat.emissive.setHex(0x10b981);
      hcsrLedMat.emissiveIntensity = 1.6 + 1.8 * pulse;
    } else {
      hcsrLedMat.color.setHex(0x22d3ee);
      hcsrLedMat.emissive.setHex(0x22d3ee);
      hcsrLedMat.emissiveIntensity = 1.2 + 1.2 * pulse;
    }
  }

  function dispose() {
    for (const g of geometriesToDispose) g.dispose();
    for (const m of materialsToDispose) m.dispose();
  }

  return {
    root,
    bodyPivot,
    tier1Group,
    tier2Group,
    tier3Group,
    leftWheel,
    rightWheel,
    hcsr04OriginLocal: new THREE.Vector3(0, tier1Y + 0.011, plateD / 2 + 0.012),
    l298nWorldAnchor,
    wireframeLines,
    interactables,
    setWireframeVisible,
    setExploded,
    setHighlightedPart,
    updateSignalPulses,
    updateHcsrStatus,
    applyFieldVisualization,
    dispose,
  };
}
