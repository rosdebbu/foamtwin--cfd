# FoamTwin CFD 🌪️🤖

> **Interactive OpenFOAM & ParaView Multi-Physics Digital Twin Simulator**  
> Real-time computational fluid dynamics (CFD), conjugate heat transfer (CHT), and multi-body inverted pendulum balancing simulation in WebGL.

[![Author](https://img.shields.io/badge/Author-Roshni%20(rosdebbu)-blue.svg)](https://github.com/rosdebbu)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black.svg)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg)](https://tailwindcss.com/)

---

## 🌟 Overview

**FoamTwin CFD** is a high-fidelity digital twin simulation environment designed for robotics and thermal-fluid engineering. It couples real-time aerodynamic flow visualization, thermal Conjugate Heat Transfer (CHT) modeling, and nonlinear dynamic balance control for a 3-tier two-wheeled mobile robot.

Built with modern WebGL (Three.js), React 19, and TypeScript, FoamTwin CFD provides engineering-grade diagnostics and visual analytics directly in the browser with zero external runtime dependencies.

---

## 🚀 Key Features

### 1. Aerodynamic CFD & Wind Tunnel Simulator
- **Virtual Wind Tunnel:** Tunable free-stream airspeed ($0 - 25\ \text{m/s}$), turbulence intensity, and boundary layer thickness.
- **ParaView Post-Processing Layers:**
  - 3D Streamlines with advected particle seeds
  - Planar Velocity Slice ($U_x, U_y, U_z, |U|$)
  - Pressure Coefficient ($C_p$) Surface Contours
  - Q-Criterion Vortex Core Visualization
- **Interactive Pitot Tube Probe:** Real-time spatial sampling of local static pressure, dynamic head, stagnation pressure, and velocity vectors.

### 2. Conjugate Heat Transfer (CHT)
- Multi-component transient thermal analysis:
  - **L298N Dual H-Bridge Motor Drivers:** Aluminum heatsink dissipation and thermal conduction
  - **Microcontroller & Logic Tier:** Passive convection and ambient dissipation
  - **Li-Ion Battery Pack:** Internal Joule heating under motor load
  - **Ultrasonic Sonar Module (HC-SR04):** Acoustic transducer self-heating
- Heat flux boundary conditions and thermal equilibrium monitoring.

### 3. Dynamic Balancing & Multibody Physics
- Discrete-time state-space Inverted Pendulum equations of motion:
  $$\ddot{\theta} = \frac{g \sin\theta - \frac{\cos\theta}{M+m}\left(F + m l \dot{\theta}^2 \sin\theta\right)}{l \left(\frac{4}{3} - \frac{m \cos^2\theta}{M+m}\right)}$$
- Dual Control Algorithms:
  - **LQR (Linear Quadratic Regulator):** Optimal state feedback ($K = [k_x, k_{\dot{x}}, k_\theta, k_{\dot{\theta}}]$)
  - **PID Feedback Loop:** Proportional-Integral-Derivative with anti-windup clamping
- Live disturbance rejection: apply manual impulse disturbances, ground incline variations, and aerodynamic drag coupling.

### 4. Acoustic Emissions & von Mises Stress
- Aeroacoustic noise estimation based on Curle's dipole dipole formulation for bluff-body vortex shedding.
- Structural stress estimation across acrylic tiers, brass standoffs, and motor bracket assemblies.

### 5. Engineering Studio & Visuals
- Physically-based PMREM softbox studio lighting and environment reflections.
- Scientific colormaps: **Turbo**, **Viridis**, **Plasma**, **Cool-to-Warm**, and **Inferno**.
- Interactive HUD: Artificial horizon balance indicator, pipeline filter drawer, and scalar bar legends.

---

## 🛠️ Tech Stack

- **Frontend Framework:** React 19, TypeScript
- **3D Graphics Engine:** Three.js (WebGL, PMREM, MeshStandardMaterial, InstancedMesh)
- **Styling:** Tailwind CSS v4, Lucide React icons, Motion
- **Build System:** Vite 8

---

## 📦 Getting Started (Local Run)

Follow these steps to run the simulation locally on your computer:

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18+ or 22+ recommended)
- `npm` (included with Node.js)

### Installation & Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rosdebbu/foamtwin--cfd.git
   cd foamtwin--cfd
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

### Production Build

To test or build the optimized production bundle:
```bash
npm run build
npm run preview
```

To run the TypeScript type checker:
```bash
npm run lint
```

---

## 📁 Project Architecture

```
foamtwin--cfd/
├── index.html                 # Main HTML entry with studio typography
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript compiler configuration
├── vite.config.ts             # Vite bundler configuration
├── public/                    # Static preview assets & favicons
└── src/
    ├── App.tsx                # Main application layout & state machine
    ├── index.css              # Studio theme styling & custom scrollbars
    ├── main.tsx               # React application entry point
    ├── components/            # UI Panels & Visual Overlays
    │   ├── BalanceHorizonWidget.tsx # Gyro horizon attitude indicator
    │   ├── ComponentInspector.tsx   # Detailed telemetry for robot parts
    │   ├── MobileWindCard.tsx       # Compact wind tunnel controls
    │   ├── PipelineDrawer.tsx       # ParaView filter tree & layers
    │   ├── PitotProbeCard.tsx       # Aerodynamic pressure probe HUD
    │   ├── ScalarBarLegend.tsx      # Scientific colormap scalar bar
    │   ├── SimulationViewport.tsx   # Three.js canvas & render loop
    │   └── StudioDock.tsx           # Floating hardware switcher dock
    ├── physics/               # Mathematical & Physical Solvers
    │   ├── acousticsAndStress.ts    # Vortex noise & structural strain
    │   ├── autoTour.ts              # Guided cinematic camera workflow
    │   ├── balancingSolver.ts       # Inverted pendulum LQR/PID solver
    │   ├── cfdSolver.ts             # Velocity, pressure, streamlines
    │   ├── colormaps.ts             # Turbo, Viridis, Plasma palettes
    │   ├── exportUtils.ts           # CSV/JSON state & telemetry export
    │   ├── thermalSolver.ts         # Conjugate heat transfer solver
    │   └── types.ts                 # Type definitions & telemetry models
    └── three/                 # 3D Meshes & Scene Construction
        ├── labEnvironment.ts        # Virtual wind tunnel & softbox lights
        ├── paraviewLayers.ts        # Streamlines, slices, and glyphs
        ├── proceduralTextures.ts    # PCB circuits & heatsink fins
        └── robotBuilder.ts          # 3-tier robot mesh hierarchy
```

---

## 👤 Author

**Roshni**
- GitHub: [@rosdebbu](https://github.com/rosdebbu)
- Repository: [foamtwin--cfd](https://github.com/rosdebbu/foamtwin--cfd)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
