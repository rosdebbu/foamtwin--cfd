/**
 * 2D Eulerian Incompressible Navier-Stokes CFD Solver (Chorin Projection / OpenFOAM icoFoam style)
 * Domain: Z-Y midplane around the 3-tier self-balancing robot.
 * Z is streamwise (+Z = front / HC-SR04 side, -Z = rear). Air enters from +Z and exits at -Z.
 * Y is vertical (Y = 0 is the floor, robot height ~0.23 m).
 */

export interface CfdGridConfig {
  nx: number; // cells along Z (streamwise)
  ny: number; // cells along Y (vertical)
  zMin: number; // m
  zMax: number; // m
  yMin: number; // m
  yMax: number; // m
}

export const DEFAULT_CFD_CONFIG: CfdGridConfig = {
  nx: 96,
  ny: 64,
  zMin: -0.42,
  zMax: 0.42,
  yMin: 0.0,
  yMax: 0.48,
};

export interface CfdMetrics {
  dragForceN: number;
  aeroForceZ: number;
  pitchMomentNm: number;
  maxVelocity: number;
  maxVorticity: number;
  residualU: number;
  residualP: number;
}

export class CfdSolver {
  public readonly nx: number;
  public readonly ny: number;
  public readonly zMin: number;
  public readonly zMax: number;
  public readonly yMin: number;
  public readonly yMax: number;
  public readonly dz: number;
  public readonly dy: number;

  // Fields stored in row-major (j * nx + i) where i -> Z, j -> Y
  public u: Float32Array; // Z-velocity (m/s)
  public v: Float32Array; // Y-velocity (m/s)
  public uPrev: Float32Array;
  public vPrev: Float32Array;
  public p: Float32Array; // Kinematic pressure p/rho (m^2/s^2), scaled to Pa via rho=1.225
  public div: Float32Array;
  public curl: Float32Array; // Vorticity omega_x (1/s)
  public solid: Uint8Array; // 1 = solid robot geometry, 0 = fluid

  public metrics: CfdMetrics = {
    dragForceN: 0,
    aeroForceZ: 0,
    pitchMomentNm: 0,
    maxVelocity: 0,
    maxVorticity: 0,
    residualU: 1e-4,
    residualP: 1e-4,
  };

  constructor(config: CfdGridConfig = DEFAULT_CFD_CONFIG) {
    this.nx = config.nx;
    this.ny = config.ny;
    this.zMin = config.zMin;
    this.zMax = config.zMax;
    this.yMin = config.yMin;
    this.yMax = config.yMax;
    this.dz = (this.zMax - this.zMin) / this.nx;
    this.dy = (this.yMax - this.yMin) / this.ny;

    const count = this.nx * this.ny;
    this.u = new Float32Array(count);
    this.v = new Float32Array(count);
    this.uPrev = new Float32Array(count);
    this.vPrev = new Float32Array(count);
    this.p = new Float32Array(count);
    this.div = new Float32Array(count);
    this.curl = new Float32Array(count);
    this.solid = new Uint8Array(count);

    this.reset(4.0);
  }

  public reset(inletSpeed = 4.0): void {
    this.u.fill(-inletSpeed);
    this.v.fill(0);
    this.uPrev.fill(-inletSpeed);
    this.vPrev.fill(0);
    this.p.fill(0);
    this.div.fill(0);
    this.curl.fill(0);
    this.updateSolidMask(0, 0);
  }

  /**
   * Rasterizes the 3-tier robot geometry (wheel/motor axle at Y = 0.048m, 3 stacked decks,
   * L298N heatsink, HC-SR04 front sensor) into the Eulerian solid obstacle mask.
   * Pitch angle theta > 0 tilts top of robot forward (+Z).
   */
  public updateSolidMask(pitchRad: number, explodedOffset = 0): void {
    this.solid.fill(0);
    const cosT = Math.cos(pitchRad);
    const sinT = Math.sin(pitchRad);
    const axleY = 0.048; // wheel radius = 0.048m
    const axleZ = 0.0;

    // Robot local dims (relative to wheel axle):
    // Chassis plate length (along Z): 0.145m -> half = 0.0725m
    // Plate thickness: 0.008m
    // Tier 1 local Y: +0.024m
    // Tier 2 local Y: +0.078m
    // Tier 3 local Y: +0.132m
    // L298N + heatsink on Tier 3 rear-top: local Z in [-0.055, -0.015], local Y in [0.136, 0.168]
    // HC-SR04 on Tier 1 front: local Z in [0.055, 0.082], local Y in [0.026, 0.050]
    const exp2 = explodedOffset * 0.045;
    const exp3 = explodedOffset * 0.09;

    for (let j = 0; j < this.ny; j++) {
      const wy = this.yMin + (j + 0.5) * this.dy;
      for (let i = 0; i < this.nx; i++) {
        const wz = this.zMin + (i + 0.5) * this.dz;

        // Transform world (wz, wy) -> robot local (lz, ly) rotated around axle
        const dz = wz - axleZ;
        const dy = wy - axleY;
        const lz = dz * cosT - dy * sinT;
        const ly = dz * sinT + dy * cosT;

        let isSolid = false;

        // Wheel & DC motor hub silhouette
        if (dz * dz + dy * dy <= 0.046 * 0.046) {
          isSolid = true;
        }
        // Tier 1 plate
        else if (Math.abs(lz) <= 0.072 && Math.abs(ly - 0.024) <= 0.006) {
          isSolid = true;
        }
        // Tier 2 plate
        else if (Math.abs(lz) <= 0.072 && Math.abs(ly - (0.078 + exp2)) <= 0.006) {
          isSolid = true;
        }
        // Tier 3 plate
        else if (Math.abs(lz) <= 0.072 && Math.abs(ly - (0.132 + exp3)) <= 0.006) {
          isSolid = true;
        }
        // HC-SR04 ultrasonic sensor on front of Tier 1
        else if (lz >= 0.052 && lz <= 0.084 && ly >= 0.026 && ly <= 0.052) {
          isSolid = true;
        }
        // L298N heatsink & driver on top of Tier 3
        else if (lz >= -0.058 && lz <= -0.012 && ly >= 0.136 + exp3 && ly <= 0.170 + exp3) {
          isSolid = true;
        }
        // Counterweight block at rear-top
        else if (lz >= 0.025 && lz <= 0.056 && ly >= 0.136 + exp3 && ly <= 0.162 + exp3) {
          isSolid = true;
        }

        if (isSolid) {
          const idx = j * this.nx + i;
          this.solid[idx] = 1;
          this.u[idx] = 0;
          this.v[idx] = 0;
        }
      }
    }
  }

  /**
   * Advances the incompressible Navier-Stokes solver by dt seconds.
   * Effective relative wind is inletSpeed + robotVelocityZ (flowing in -Z direction).
   */
  public step(
    inletSpeed: number,
    robotVelocityZ: number,
    viscosity: number,
    pitchRad: number,
    explodedOffset: number,
    dt: number,
    pressureIterations = 18,
  ): CfdMetrics {
    const safeDt = Math.min(Math.max(dt, 0.002), 0.025);
    const effectiveWind = Math.max(0.05, Math.abs(inletSpeed + robotVelocityZ)) *
      (inletSpeed + robotVelocityZ >= 0 ? 1 : -1);

    this.updateSolidMask(pitchRad, explodedOffset);

    // 1. Apply inlet & far-field boundary conditions
    this.applyBoundaryConditions(effectiveWind);

    // 2. Compute vorticity & apply vorticity confinement to preserve crisp wake eddies
    this.computeVorticityAndConfine(safeDt);

    // 3. Viscous diffusion (Gauss-Seidel)
    this.uPrev.set(this.u);
    this.vPrev.set(this.v);
    if (viscosity > 0) {
      this.diffuse(this.u, this.uPrev, viscosity, safeDt);
      this.diffuse(this.v, this.vPrev, viscosity, safeDt);
    }

    // 4. Semi-Lagrangian advection
    this.uPrev.set(this.u);
    this.vPrev.set(this.v);
    this.advect(this.u, this.uPrev, this.uPrev, this.vPrev, safeDt);
    this.advect(this.v, this.vPrev, this.uPrev, this.vPrev, safeDt);

    this.applyBoundaryConditions(effectiveWind);

    // 5. Pressure Poisson projection (div(U) = 0)
    const resP = this.project(pressureIterations, safeDt);
    this.applyBoundaryConditions(effectiveWind);

    // 6. Recompute final vorticity and integrate aerodynamic drag + pitching moment
    return this.computeMetrics(resP, effectiveWind);
  }

  private applyBoundaryConditions(windSpeedZ: number): void {
    const { nx, ny, u, v, solid } = this;
    const inflowU = -windSpeedZ; // flows from +Z (i = nx-1) toward -Z (i = 0)

    // Left (i=0, outlet if wind>=0) and Right (i=nx-1, inlet if wind>=0)
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      if (windSpeedZ >= 0) {
        // Inlet at +Z (i = nx - 1)
        u[row + nx - 1] = inflowU;
        v[row + nx - 1] = 0;
        // Zero-gradient convective outlet at -Z (i = 0)
        u[row] = u[row + 1];
        v[row] = v[row + 1] * 0.95;
      } else {
        // Reversed flow
        u[row] = inflowU;
        v[row] = 0;
        u[row + nx - 1] = u[row + nx - 2];
        v[row + nx - 1] = v[row + nx - 2] * 0.95;
      }
    }

    // Floor (j=0, no-slip moving ground relative to wind, or wall) and Top (j=ny-1, free slip)
    for (let i = 0; i < nx; i++) {
      // Floor boundary
      u[i] = inflowU * 0.35;
      v[i] = 0;
      // Top freestream slip boundary
      const topIdx = (ny - 1) * nx + i;
      u[topIdx] = u[(ny - 2) * nx + i];
      v[topIdx] = 0;
    }

    // Zero velocity inside solid robot cells
    for (let k = 0; k < nx * ny; k++) {
      if (solid[k]) {
        u[k] = 0;
        v[k] = 0;
      }
    }
  }

  private computeVorticityAndConfine(dt: number): void {
    const { nx, ny, u, v, curl, solid, dz, dy } = this;
    const inv2Dz = 1 / (2 * dz);
    const inv2Dy = 1 / (2 * dy);
    const eps = 0.0028;

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        if (solid[idx]) {
          curl[idx] = 0;
          continue;
        }
        const dvdz = (v[idx + 1] - v[idx - 1]) * inv2Dz;
        const dudy = (u[idx + nx] - u[idx - nx]) * inv2Dy;
        curl[idx] = dvdz - dudy;
      }
    }

    // Vorticity confinement force
    for (let j = 2; j < ny - 2; j++) {
      const row = j * nx;
      for (let i = 2; i < nx - 2; i++) {
        const idx = row + i;
        if (solid[idx]) continue;
        const dwDz = (Math.abs(curl[idx + 1]) - Math.abs(curl[idx - 1])) * inv2Dz;
        const dwDy = (Math.abs(curl[idx + nx]) - Math.abs(curl[idx - nx])) * inv2Dy;
        const len = Math.hypot(dwDz, dwDy) + 1e-6;
        const nz = dwDz / len;
        const nyDir = dwDy / len;
        const w = Math.max(-150, Math.min(150, curl[idx]));
        // F_conf = eps * h * (N x omega)
        u[idx] = Math.max(-28, Math.min(28, u[idx] + dt * eps * (nyDir * w)));
        v[idx] = Math.max(-28, Math.min(28, v[idx] - dt * eps * (nz * w)));
      }
    }
  }

  private diffuse(
    field: Float32Array,
    prev: Float32Array,
    nu: number,
    dt: number,
  ): void {
    const { nx, ny, dz, dy, solid } = this;
    const a = dt * nu * (1 / (dz * dz) + 1 / (dy * dy)) * 0.5;
    if (a < 1e-7) return;
    const invDenom = 1 / (1 + 4 * a);

    for (let iter = 0; iter < 4; iter++) {
      for (let j = 1; j < ny - 1; j++) {
        const row = j * nx;
        for (let i = 1; i < nx - 1; i++) {
          const idx = row + i;
          if (solid[idx]) continue;
          field[idx] =
            (prev[idx] +
              a * (field[idx - 1] + field[idx + 1] + field[idx - nx] + field[idx + nx])) *
            invDenom;
        }
      }
    }
  }

  private advect(
    out: Float32Array,
    src: Float32Array,
    velU: Float32Array,
    velV: Float32Array,
    dt: number,
  ): void {
    const { nx, ny, dz, dy, solid } = this;
    const maxI = nx - 1.001;
    const maxJ = ny - 1.001;

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        if (solid[idx]) {
          out[idx] = 0;
          continue;
        }
        let backI = i - (velU[idx] * dt) / dz;
        let backJ = j - (velV[idx] * dt) / dy;

        if (backI < 0.5) backI = 0.5;
        else if (backI > maxI) backI = maxI;
        if (backJ < 0.5) backJ = 0.5;
        else if (backJ > maxJ) backJ = maxJ;

        const i0 = Math.floor(backI);
        const j0 = Math.floor(backJ);
        const i1 = i0 + 1;
        const j1 = j0 + 1;
        const s1 = backI - i0;
        const s0 = 1 - s1;
        const t1 = backJ - j0;
        const t0 = 1 - t1;

        const c00 = src[j0 * nx + i0];
        const c10 = src[j0 * nx + i1];
        const c01 = src[j1 * nx + i0];
        const c11 = src[j1 * nx + i1];

        out[idx] = s0 * (t0 * c00 + t1 * c01) + s1 * (t0 * c10 + t1 * c11);
      }
    }
  }

  private project(iterations: number, dt: number): number {
    const { nx, ny, u, v, p, div, solid, dz, dy } = this;
    const inv2Dz = 0.5 / dz;
    const inv2Dy = 0.5 / dy;
    const dz2 = dz * dz;
    const dy2 = dy * dy;
    const denom = 2 * (dz2 + dy2);
    const cz = dy2 / denom;
    const cy = dz2 / denom;
    const cDiv = (dz2 * dy2) / denom;

    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        if (solid[idx]) {
          div[idx] = 0;
          p[idx] = 0;
          continue;
        }
        const uR = solid[idx + 1] ? 0 : u[idx + 1];
        const uL = solid[idx - 1] ? 0 : u[idx - 1];
        const vT = solid[idx + nx] ? 0 : v[idx + nx];
        const vB = solid[idx - nx] ? 0 : v[idx - nx];
        div[idx] = (uR - uL) * inv2Dz + (vT - vB) * inv2Dy;
      }
    }

    // Solve impulse potential phi = (p / rho) * dt in p temporarily
    const omega = 1.35;
    let maxChange = 0;
    // Scale existing p back into impulse potential for warm-start
    for (let k = 0; k < nx * ny; k++) {
      p[k] *= dt;
    }

    for (let iter = 0; iter < iterations; iter++) {
      maxChange = 0;
      for (let j = 1; j < ny - 1; j++) {
        const row = j * nx;
        for (let i = 1; i < nx - 1; i++) {
          const idx = row + i;
          if (solid[idx]) continue;

          // Neumann dP/dn = 0 at solid boundaries
          const pL = solid[idx - 1] ? p[idx] : p[idx - 1];
          const pR = solid[idx + 1] ? p[idx] : p[idx + 1];
          const pB = solid[idx - nx] ? p[idx] : p[idx - nx];
          const pT = solid[idx + nx] ? p[idx] : p[idx + nx];

          const targetP = cz * (pL + pR) + cy * (pB + pT) - cDiv * div[idx];
          const nextP = p[idx] + omega * (targetP - p[idx]);
          if (iter === iterations - 1) {
            const diff = Math.abs(nextP - p[idx]);
            if (diff > maxChange) maxChange = diff;
          }
          p[idx] = nextP;
        }
      }
      // Outlet reference pressure p = 0
      for (let j = 0; j < ny; j++) {
        p[j * nx] = 0;
      }
    }

    // Subtract pressure gradient and convert phi -> physical kinematic pressure (p / rho = phi / dt)
    const invDt = 1 / dt;
    for (let j = 1; j < ny - 1; j++) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        if (solid[idx]) continue;
        const pL = solid[idx - 1] ? p[idx] : p[idx - 1];
        const pR = solid[idx + 1] ? p[idx] : p[idx + 1];
        const pB = solid[idx - nx] ? p[idx] : p[idx - nx];
        const pT = solid[idx + nx] ? p[idx] : p[idx + nx];

        u[idx] -= (pR - pL) * inv2Dz;
        v[idx] -= (pT - pB) * inv2Dy;
      }
    }

    for (let k = 0; k < nx * ny; k++) {
      p[k] *= invDt;
    }

    return maxChange * invDt;
  }

  private computeMetrics(resP: number, effectiveWind: number): CfdMetrics & { aeroForceZ: number } {
    const { nx, ny, u, v, p, curl, solid, dz, dy } = this;
    const rho = 1.225; // kg/m^3 air density
    const robotWidthX = 0.18; // m effective spanwise depth
    const axleY = 0.048;

    let maxVel = 0;
    let maxVort = 0;
    let netForceZ = 0;
    let pitchMoment = 0;
    let sumDiv = 0;
    let fluidCells = 0;

    for (let j = 1; j < ny - 1; j++) {
      const wy = this.yMin + (j + 0.5) * dy;
      const row = j * nx;
      for (let i = 1; i < nx - 1; i++) {
        const idx = row + i;
        if (solid[idx]) {
          // Integrate surface pressure across windward/leeward faces
          const pFront = !solid[idx + 1] ? p[idx + 1] * rho : 0;
          const pBack = !solid[idx - 1] ? p[idx - 1] * rho : 0;
          const dFz = (pBack - pFront) * dy * robotWidthX;
          netForceZ += dFz;
          pitchMoment += dFz * (wy - axleY);
          continue;
        }
        fluidCells++;
        const speed = Math.hypot(u[idx], v[idx]);
        if (speed > maxVel) maxVel = speed;

        const dvdz = (v[idx + 1] - v[idx - 1]) / (2 * dz);
        const dudy = (u[idx + nx] - u[idx - nx]) / (2 * dy);
        const w = dvdz - dudy;
        curl[idx] = w;
        if (Math.abs(w) > maxVort) maxVort = Math.abs(w);

        sumDiv += Math.abs(this.div[idx]);
      }
    }

    // Include skin-friction + form drag component aligned with relative wind direction
    const aeroDragScalar = Math.abs(netForceZ) + 0.5 * rho * effectiveWind * effectiveWind * 0.028 * 0.85;
    const aeroForceZ = -Math.sign(effectiveWind || 1) * aeroDragScalar;

    this.metrics = {
      dragForceN: aeroDragScalar,
      aeroForceZ,
      pitchMomentNm: pitchMoment,
      maxVelocity: maxVel,
      maxVorticity: maxVort,
      residualU: fluidCells > 0 ? Math.min(1, (sumDiv / fluidCells) * 0.01) : 0,
      residualP: Math.min(1, resP * 0.02),
    };
    return this.metrics;
  }

  /**
   * Bilinearly samples (uz, uy, pressurePa, vorticity) at any world (z, y) coordinate.
   */
  public sampleField2D(
    z: number,
    y: number,
    out: { uz: number; uy: number; pressurePa: number; vorticity: number; isSolid: boolean },
  ): void {
    const fi = (z - this.zMin) / this.dz - 0.5;
    const fj = (y - this.yMin) / this.dy - 0.5;

    const i0 = Math.max(0, Math.min(this.nx - 2, Math.floor(fi)));
    const j0 = Math.max(0, Math.min(this.ny - 2, Math.floor(fj)));
    const tx = Math.max(0, Math.min(1, fi - i0));
    const ty = Math.max(0, Math.min(1, fj - j0));

    const idx00 = j0 * this.nx + i0;
    const idx10 = idx00 + 1;
    const idx01 = idx00 + this.nx;
    const idx11 = idx01 + 1;

    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;

    out.isSolid =
      this.solid[Math.round(Math.max(0, Math.min(this.ny - 1, fj))) * this.nx +
        Math.round(Math.max(0, Math.min(this.nx - 1, fi)))] === 1;
    out.uz =
      this.u[idx00] * w00 + this.u[idx10] * w10 + this.u[idx01] * w01 + this.u[idx11] * w11;
    out.uy =
      this.v[idx00] * w00 + this.v[idx10] * w10 + this.v[idx01] * w01 + this.v[idx11] * w11;
    out.pressurePa =
      (this.p[idx00] * w00 + this.p[idx10] * w10 + this.p[idx01] * w01 + this.p[idx11] * w11) *
      1.225;
    out.vorticity =
      this.curl[idx00] * w00 +
      this.curl[idx10] * w10 +
      this.curl[idx01] * w01 +
      this.curl[idx11] * w11;
  }

  /**
   * Extends the 2D Navier-Stokes slice into 3D space (x, y, z) by modeling spanwise pressure relief
   * and side-edge tip vortices around the robot's +-0.095m half-width.
   */
  public sampleFlow3D(
    x: number,
    y: number,
    z: number,
    freestreamZ: number,
    out: { ux: number; uy: number; uz: number; speed: number },
  ): void {
    const tmp = { uz: 0, uy: 0, pressurePa: 0, vorticity: 0, isSolid: false };
    this.sampleField2D(z, y, tmp);

    // Spanwise attenuation from center (x=0) toward outer freestream (|x| > 0.16m)
    const halfSpan = 0.095;
    const spanBlend = Math.exp(-Math.pow(Math.max(0, Math.abs(x) - halfSpan * 0.6) / 0.11, 2));

    const uz = -freestreamZ * (1 - spanBlend) + tmp.uz * spanBlend;
    const uy = tmp.uy * spanBlend;
    // Outward deflection around front edge (z ~ 0.06..0.11) and inward wake entrainment (z < -0.05)
    const wakeFactor = z > -0.02 ? Math.exp(-Math.pow((z - 0.07) / 0.08, 2)) : -0.45 * Math.exp(-Math.pow((z + 0.12) / 0.14, 2));
    const ux = Math.sign(x || 0.001) * Math.min(1, Math.abs(x) / 0.09) * Math.abs(freestreamZ) * 0.28 * wakeFactor * spanBlend;

    out.ux = ux;
    out.uy = uy;
    out.uz = uz;
    out.speed = Math.hypot(ux, uy, uz);
  }
}
