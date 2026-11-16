import type { CfdSolver } from './cfdSolver';
import type { ThermalState } from './thermalSolver';
import type { SimulationParams } from './types';

function computeCellTempC(
  wz: number,
  wy: number,
  thermal: ThermalState,
  ambientTemp: number,
): number {
  const dzWake = Math.max(0, 0.04 - wz);
  const heatSourceTop =
    Math.exp(-Math.pow((wy - 0.19) / 0.055, 2)) *
    (thermal.l298nTempC - ambientTemp);
  const heatSourceBot =
    Math.exp(-Math.pow((wy - 0.05) / 0.04, 2)) *
    (thermal.motorLeftTempC - ambientTemp);
  const downstreamDecay =
    wz < 0.06
      ? Math.exp(-dzWake * 3.8)
      : Math.exp(-Math.pow((wz - 0.06) / 0.04, 2));
  return ambientTemp + (heatSourceTop + heatSourceBot * 0.7) * downstreamDecay;
}

/**
 * Generates an ASCII ParaView-compatible legacy VTK STRUCTURED_POINTS dataset
 * containing velocity vector U, static pressure p, vorticity omega_x, and temperature T.
 */
export function buildCfdVtkExport(
  cfd: CfdSolver,
  thermal: ThermalState,
  params: SimulationParams,
): string {
  const { nx, ny, zMin, yMin, dz, dy, u, v, p, curl, solid } = cfd;
  const totalPts = nx * ny;
  const rho = 1.225;

  const lines: string[] = [
    '# vtk DataFile Version 3.0',
    `FoamTwin OpenFOAM/ParaView Cut-Plane (${params.preset}, Uinf=${params.windSpeed} m/s)`,
    'ASCII',
    'DATASET STRUCTURED_POINTS',
    `DIMENSIONS 1 ${ny} ${nx}`,
    `ORIGIN ${params.sliceOffsetX.toFixed(4)} ${yMin.toFixed(4)} ${zMin.toFixed(4)}`,
    `SPACING 0.0100 ${dy.toFixed(6)} ${dz.toFixed(6)}`,
    `POINT_DATA ${totalPts}`,
    'VECTORS U float',
  ];

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const idx = j * nx + i;
      lines.push(`0.0 ${v[idx].toFixed(5)} ${u[idx].toFixed(5)}`);
    }
  }

  lines.push('SCALARS p_Pa float 1', 'LOOKUP_TABLE default');
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const idx = j * nx + i;
      lines.push((p[idx] * rho).toFixed(4));
    }
  }

  lines.push('SCALARS vorticity_s1 float 1', 'LOOKUP_TABLE default');
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const idx = j * nx + i;
      lines.push(curl[idx].toFixed(4));
    }
  }

  lines.push('SCALARS T_C float 1', 'LOOKUP_TABLE default');
  for (let i = 0; i < nx; i++) {
    const wz = zMin + (i + 0.5) * dz;
    for (let j = 0; j < ny; j++) {
      const wy = yMin + (j + 0.5) * dy;
      const idx = j * nx + i;
      const tC = solid[idx] ? thermal.l298nTempC : computeCellTempC(wz, wy, thermal, params.ambientTemp);
      lines.push(tC.toFixed(3));
    }
  }

  return lines.join('\n');
}

/**
 * Generates a CSV table of all CFD slice cells for external MATLAB / Python / Excel analysis.
 */
export function buildCfdCsvExport(
  cfd: CfdSolver,
  thermal: ThermalState,
  params: SimulationParams,
): string {
  const { nx, ny, zMin, yMin, dz, dy, u, v, p, curl, solid } = cfd;
  const rho = 1.225;
  const rows: string[] = [
    'z_m,y_m,u_z_ms,u_y_ms,speed_ms,pressure_pa,vorticity_s1,temp_c,solid',
  ];

  for (let j = 0; j < ny; j++) {
    const wy = yMin + (j + 0.5) * dy;
    for (let i = 0; i < nx; i++) {
      const wz = zMin + (i + 0.5) * dz;
      const idx = j * nx + i;
      const speed = Math.hypot(u[idx], v[idx]);
      const tC = solid[idx] ? thermal.l298nTempC : computeCellTempC(wz, wy, thermal, params.ambientTemp);
      rows.push(
        `${wz.toFixed(4)},${wy.toFixed(4)},${u[idx].toFixed(4)},${v[idx].toFixed(4)},${speed.toFixed(4)},${(p[idx] * rho).toFixed(3)},${curl[idx].toFixed(3)},${tC.toFixed(2)},${solid[idx]}`,
      );
    }
  }

  return rows.join('\n');
}
