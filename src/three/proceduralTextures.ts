import * as THREE from 'three';

export interface ProceduralTextureSet {
  plateColor: THREE.CanvasTexture;
  plateRoughness: THREE.CanvasTexture;
  plateBump: THREE.CanvasTexture;
  metalBump: THREE.CanvasTexture;
  foamBump: THREE.CanvasTexture;
  rubberBump: THREE.CanvasTexture;
  counterweightColor: THREE.CanvasTexture;
  counterweightBump: THREE.CanvasTexture;
  l298nPcb: THREE.CanvasTexture;
  buckPcb: THREE.CanvasTexture;
  wirelessPcb: THREE.CanvasTexture;
  hcsr04Pcb: THREE.CanvasTexture;
  transducerMesh: THREE.CanvasTexture;
  capTopTex: THREE.CanvasTexture;
  mpu6050Pcb: THREE.CanvasTexture;
  benchColor: THREE.CanvasTexture;
  benchRoughness: THREE.CanvasTexture;
  benchBump: THREE.CanvasTexture;
  honeycombTex: THREE.CanvasTexture;
  wavefrontTex: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const plateColor = makePlateColorTexture(maxAnisotropy);
  const plateRoughness = makePlateRoughnessTexture(maxAnisotropy);
  const plateBump = makePlateBumpTexture(maxAnisotropy);
  const metalBump = makeMetalBumpTexture(maxAnisotropy);
  const foamBump = makeFoamBumpTexture(maxAnisotropy);
  const rubberBump = makeRubberBumpTexture(maxAnisotropy);
  const counterweightColor = makeCounterweightColorTexture(maxAnisotropy);
  const counterweightBump = makeCounterweightBumpTexture(maxAnisotropy);
  const l298nPcb = makeL298nPcbTexture(maxAnisotropy);
  const buckPcb = makeBuckPcbTexture(maxAnisotropy);
  const wirelessPcb = makeWirelessPcbTexture(maxAnisotropy);
  const hcsr04Pcb = makeHcsr04PcbTexture(maxAnisotropy);
  const transducerMesh = makeTransducerMeshTexture(maxAnisotropy);
  const capTopTex = makeCapTopTexture(maxAnisotropy);
  const mpu6050Pcb = makeMpu6050PcbTexture(maxAnisotropy);
  const benchColor = makeBenchColorTexture(maxAnisotropy);
  const benchRoughness = makeBenchRoughnessTexture(maxAnisotropy);
  const benchBump = makeBenchBumpTexture(maxAnisotropy);
  const honeycombTex = makeHoneycombTexture(maxAnisotropy);
  const wavefrontTex = makeWavefrontTexture();
  const contactShadow = makeContactShadowTexture();

  return {
    plateColor,
    plateRoughness,
    plateBump,
    metalBump,
    foamBump,
    rubberBump,
    counterweightColor,
    counterweightBump,
    l298nPcb,
    buckPcb,
    wirelessPcb,
    hcsr04Pcb,
    transducerMesh,
    capTopTex,
    mpu6050Pcb,
    benchColor,
    benchRoughness,
    benchBump,
    honeycombTex,
    wavefrontTex,
    contactShadow,
    dispose: () => {
      plateColor.dispose();
      plateRoughness.dispose();
      plateBump.dispose();
      metalBump.dispose();
      foamBump.dispose();
      rubberBump.dispose();
      counterweightColor.dispose();
      counterweightBump.dispose();
      l298nPcb.dispose();
      buckPcb.dispose();
      wirelessPcb.dispose();
      hcsr04Pcb.dispose();
      transducerMesh.dispose();
      capTopTex.dispose();
      mpu6050Pcb.dispose();
      benchColor.dispose();
      benchRoughness.dispose();
      benchBump.dispose();
      honeycombTex.dispose();
      wavefrontTex.dispose();
      contactShadow.dispose();
    },
  };
}

function makePlateColorTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(101);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#adb5bf';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle satin PVC / composite panel micro-streaks and light handling variation
  for (let i = 0; i < 1600; i++) {
    const y = rand() * 512;
    const x = rand() * 512;
    const w = 40 + rand() * 260;
    const alpha = 0.018 + rand() * 0.036;
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(38,46,58,${alpha})`;
    ctx.fillRect(x, y, w, 0.8 + rand() * 1.4);
  }

  // Faint fine micro-scratches visible only in macro close-up
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 70; i++) {
    const x1 = rand() * 512;
    const y1 = rand() * 512;
    const ang = (rand() - 0.5) * 0.55;
    const len = 18 + rand() * 65;
    ctx.strokeStyle = rand() > 0.4 ? 'rgba(235,242,250,0.08)' : 'rgba(55,65,80,0.08)';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + Math.cos(ang) * len, y1 + Math.sin(ang) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 3.5);
  tex.anisotropy = aniso;
  return tex;
}

function makePlateRoughnessTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(202);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#9c9c9c';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 900; i++) {
    const y = rand() * 256;
    const v = 128 + Math.floor(rand() * 68);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 256, 1.2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 3.5);
  tex.anisotropy = aniso;
  return tex;
}

function makePlateBumpTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(303);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1200; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const v = 112 + Math.floor(rand() * 34);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 8 + rand() * 32, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 3.5);
  tex.anisotropy = aniso;
  return tex;
}

function makeMetalBumpTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(404);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y++) {
    const v = 110 + Math.floor(rand() * 36);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 256, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  return tex;
}

function makeFoamBumpTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(505);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#929292';
  ctx.fillRect(0, 0, 256, 256);

  // Open-cell polyethylene foam pores matching Photo 2 & Photo 3
  for (let i = 0; i < 2200; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1.1 + rand() * 3.2;
    const dark = 52 + Math.floor(rand() * 55);
    ctx.fillStyle = `rgb(${dark},${dark},${dark})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = aniso;
  return tex;
}

function makeRubberBumpTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(606);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 4000; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const v = 96 + Math.floor(rand() * 64);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.anisotropy = aniso;
  return tex;
}

function makeCounterweightColorTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(707);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d9d2c2';
  ctx.fillRect(0, 0, 256, 128);

  // Subtle weathered ceramic/composite patina + dark grime around central bore (Photo 5)
  for (let i = 0; i < 900; i++) {
    const x = rand() * 256;
    const y = rand() * 128;
    const alpha = 0.04 + rand() * 0.08;
    ctx.fillStyle = rand() > 0.4 ? `rgba(72,56,42,${alpha})` : `rgba(245,240,228,${alpha})`;
    ctx.fillRect(x, y, 2 + rand() * 5, 2 + rand() * 4);
  }

  const grad = ctx.createRadialGradient(128, 64, 8, 128, 64, 52);
  grad.addColorStop(0, 'rgba(35,28,22,0.72)');
  grad.addColorStop(0.55, 'rgba(65,50,36,0.35)');
  grad.addColorStop(1, 'rgba(65,50,36,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function makeCounterweightBumpTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(808);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#828282';
  ctx.fillRect(0, 0, 256, 128);

  for (let i = 0; i < 1600; i++) {
    const x = rand() * 256;
    const y = rand() * 128;
    const v = 90 + Math.floor(rand() * 75);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2 + rand() * 3, 2 + rand() * 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function makeL298nPcbTexture(aniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich glossy crimson solder mask
  ctx.fillStyle = '#99151b';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle etched copper ground plane + signal traces underneath solder mask
  ctx.strokeStyle = '#b9262d';
  ctx.lineWidth = 5;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(42 + i * 32, 48);
    ctx.lineTo(42 + i * 32, 230);
    ctx.lineTo(75 + i * 26, 420);
    ctx.stroke();
  }

  // White silkscreen border, diode outlines & labels
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, 480, 480);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px monospace';
  ctx.fillText('L298N', 44, 68);
  ctx.font = 'bold 20px monospace';
  ctx.fillText('OUT1  OUT2', 44, 466);
  ctx.fillText('OUT3  OUT4', 352, 466);
  ctx.fillText('ENA IN1 IN2 IN3 IN4 ENB', 196, 486);
  ctx.fillText('+12V  GND  +5V', 44, 340);

  // Tinned/gold pad rows for pins & diodes
  ctx.fillStyle = '#e5c16c';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(245 + i * 34, 444, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Corner brass mounting holes
  const corners = [
    [34, 34],
    [478, 34],
    [34, 478],
    [478, 478],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillStyle = '#e5c16c';
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#18202c';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function makeBuckPcbTexture(aniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Cobalt-blue LM2596S solder mask
  ctx.fillStyle = '#123e82';
  ctx.fillRect(0, 0, 512, 256);

  // Copper plane pour & curved traces beneath mask
  ctx.strokeStyle = '#1a56ad';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(45, 55);
  ctx.lineTo(185, 55);
  ctx.lineTo(240, 120);
  ctx.lineTo(465, 120);
  ctx.moveTo(45, 200);
  ctx.lineTo(310, 200);
  ctx.lineTo(360, 165);
  ctx.lineTo(465, 165);
  ctx.stroke();

  // Silkscreen border & text
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 492, 236);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('LM2596S', 180, 42);
  ctx.font = 'bold 18px monospace';
  ctx.fillText('IN+', 52, 48);
  ctx.fillText('IN-', 52, 224);
  ctx.fillText('OUT+', 418, 48);
  ctx.fillText('OUT-', 418, 224);
  ctx.font = 'bold 14px monospace';
  ctx.fillText('ADJ', 100, 188);

  // 4 Gold through-hole terminal pads + mounting holes
  const pads = [
    [34, 42],
    [34, 214],
    [478, 42],
    [478, 214],
  ];
  for (const [px, py] of pads) {
    ctx.fillStyle = '#e6c26e';
    ctx.beginPath();
    ctx.arc(px, py, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141a24';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function makeWirelessPcbTexture(aniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Classic HC-05 dark teal/blue-green PCB
  ctx.fillStyle = '#0e4c63';
  ctx.fillRect(0, 0, 512, 256);

  // Subtle inner green daughterboard outline
  ctx.fillStyle = '#126348';
  ctx.fillRect(58, 24, 380, 208);

  // Gold PCB meander trace antenna on left end
  ctx.strokeStyle = '#e5bd60';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(140, 52);
  ctx.lineTo(74, 52);
  ctx.lineTo(74, 92);
  ctx.lineTo(126, 92);
  ctx.lineTo(126, 132);
  ctx.lineTo(74, 132);
  ctx.lineTo(74, 172);
  ctx.lineTo(126, 172);
  ctx.lineTo(126, 204);
  ctx.stroke();

  // Silkscreen labels & pin callouts
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 19px monospace';
  ctx.fillText('ZS-040  HC-05', 180, 48);
  ctx.font = 'bold 14px monospace';
  const pinNames = ['EN', 'VCC', 'GND', 'TXD', 'RXD', 'ST'];
  for (let i = 0; i < pinNames.length; i++) {
    const py = 46 + i * 33;
    ctx.fillStyle = '#e5bd60';
    ctx.beginPath();
    ctx.arc(478, py, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(pinNames[i], 430, py + 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function makeHcsr04PcbTexture(aniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#134896';
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 236);

  // Corner mounting holes
  for (const [cx, cy] of [
    [28, 28],
    [484, 28],
    [28, 228],
    [484, 228],
  ]) {
    ctx.fillStyle = '#e2c07d';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('HC-SR04', 256, 52);

  ctx.font = 'bold 24px monospace';
  ctx.fillText('T', 46, 54);
  ctx.fillText('R', 466, 54);

  // Gold header solder pads along bottom/top edge
  const labels = ['VCC', 'TRIG', 'ECHO', 'GND'];
  ctx.font = 'bold 17px monospace';
  for (let i = 0; i < 4; i++) {
    const px = 196 + i * 40;
    ctx.fillStyle = '#e5bd60';
    ctx.beginPath();
    ctx.arc(px, 228, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(labels[i], px, 206);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function makeTransducerMeshTexture(aniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Dark gunmetal hexagonal perforated screen with transparent holes
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#181c22';
  ctx.fillRect(0, 0, 256, 256);

  ctx.globalCompositeOperation = 'destination-out';
  const stepX = 18;
  const stepY = 16;
  for (let row = 0; row < 18; row++) {
    const offset = (row % 2) * (stepX * 0.5);
    for (let col = 0; col < 16; col++) {
      const cx = col * stepX + offset;
      const cy = row * stepY;
      ctx.beginPath();
      ctx.arc(cx, cy, 5.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function makeCapTopTexture(aniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, '#dde3ea');
  grad.addColorStop(0.75, '#b8c2cd');
  grad.addColorStop(1, '#8c96a3');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  // Embossed K-vent scoring lines
  ctx.strokeStyle = 'rgba(45, 52, 62, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(22, 64);
  ctx.lineTo(106, 64);
  ctx.moveTo(64, 64);
  ctx.lineTo(94, 30);
  ctx.moveTo(64, 64);
  ctx.lineTo(94, 98);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function makeMpu6050PcbTexture(aniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#144c9e';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 240, 240);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('GY-521', 22, 42);
  ctx.font = 'bold 20px monospace';
  ctx.fillText('MPU-6050', 22, 232);

  // Gold header pad row on right edge
  const pins = ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'];
  ctx.font = 'bold 13px monospace';
  for (let i = 0; i < 8; i++) {
    const py = 28 + i * 28;
    ctx.fillStyle = '#e5bd60';
    ctx.beginPath();
    ctx.arc(230, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(pins[i], 190, py + 4);
  }

  // Axis orientation arrows
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(42, 168);
  ctx.lineTo(96, 168);
  ctx.moveTo(42, 168);
  ctx.lineTo(42, 114);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function makeBenchColorTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(909);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Dark anodized optical breadboard surface
  ctx.fillStyle = '#171c25';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle horizontal brushed machining grain
  for (let i = 0; i < 1400; i++) {
    const y = rand() * 512;
    const alpha = 0.015 + rand() * 0.025;
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, y, 512, 1);
  }

  // Faint machined calibration grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  const step = 64;
  for (let i = 0; i <= 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Precision M6 tapped mounting holes (8x8 per tile)
  for (let gy = step / 2; gy < 512; gy += step) {
    for (let gx = step / 2; gx < 512; gx += step) {
      // Chamfered steel rim
      ctx.fillStyle = '#2d3748';
      ctx.beginPath();
      ctx.arc(gx, gy, 5.2, 0, Math.PI * 2);
      ctx.fill();
      // Deep tapped bore
      ctx.fillStyle = '#090c11';
      ctx.beginPath();
      ctx.arc(gx, gy, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 9);
  tex.anisotropy = aniso;
  return tex;
}

function makeBenchRoughnessTexture(aniso: number): THREE.CanvasTexture {
  const rand = makePrng(1010);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#7c7c7c';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 800; i++) {
    const y = rand() * 256;
    const v = 95 + Math.floor(rand() * 55);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 256, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 9);
  tex.anisotropy = aniso;
  return tex;
}

function makeBenchBumpTexture(aniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, 256, 256);

  const step = 32;
  for (let gy = step / 2; gy < 256; gy += step) {
    for (let gx = step / 2; gx < 256; gx += step) {
      ctx.fillStyle = '#a4a4a4';
      ctx.beginPath();
      ctx.arc(gx, gy, 3.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#202020';
      ctx.beginPath();
      ctx.arc(gx, gy, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 9);
  tex.anisotropy = aniso;
  return tex;
}

function makeHoneycombTexture(aniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#18202c';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  const stepX = 24;
  const stepY = 20;
  for (let r = 0; r < 14; r++) {
    const off = (r % 2) * (stepX * 0.5);
    for (let c = 0; c < 12; c++) {
      const cx = c * stepX + off;
      const cy = r * stepY;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        const px = cx + Math.cos(ang) * 9.5;
        const py = cy + Math.sin(ang) * 9.5;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = aniso;
  return tex;
}

function makeWavefrontTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 128, 62, 128, 128, 126);
  grad.addColorStop(0.0, 'rgba(34, 211, 238, 0.0)');
  grad.addColorStop(0.55, 'rgba(34, 211, 238, 0.14)');
  grad.addColorStop(0.82, 'rgba(103, 232, 249, 0.72)');
  grad.addColorStop(0.91, 'rgba(224, 242, 254, 0.95)');
  grad.addColorStop(1.0, 'rgba(34, 211, 238, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Soft wide under-chassis ambient shadow
  const mainGrad = ctx.createRadialGradient(128, 128, 18, 128, 128, 118);
  mainGrad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  mainGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  mainGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mainGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Darker tire contact patches left & right (at x = ±0.097)
  for (const cx of [48, 208]) {
    const wGrad = ctx.createRadialGradient(cx, 128, 4, cx, 128, 34);
    wGrad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    wGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.45)');
    wGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = wGrad;
    ctx.fillRect(0, 0, 256, 256);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
