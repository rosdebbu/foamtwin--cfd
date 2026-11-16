import { ChevronLeft, ChevronRight, Crosshair, X } from 'lucide-react';
import type { InspectablePartId, TelemetrySample } from '../physics/types';

export const INSPECTABLE_ORDER: InspectablePartId[] = [
  'hcsr04',
  'l298n',
  'mpu',
  'buck',
  'bt',
  'motors',
  'wheels',
  'counterweight',
  'standoffs',
  'chassis',
];

interface PartSpecDef {
  title: string;
  tierLabel: string;
  material: string;
  summary: string;
  getMetrics: (t: TelemetrySample) => Array<{ label: string; value: string }>;
}

const PART_SPECS: Record<InspectablePartId, PartSpecDef> = {
  hcsr04: {
    title: 'HC-SR04 Ultrasonic Array',
    tierLabel: 'Tier 1 · Front Deck',
    material: 'Turned Al Barrels · Piezo Cones',
    summary: '40 kHz dual-transducer time-of-flight rangefinder aligned forward along +Z.',
    getMetrics: (t) => [
      { label: 'Echo Range', value: `${t.ultrasonicCm.toFixed(1)} cm` },
      { label: 'Sensor', value: t.sensorWorking ? 'WORKING · ECHO' : 'NO ECHO' },
    ],
  },
  l298n: {
    title: 'L298N Dual H-Bridge',
    tierLabel: 'Tier 3 · Power Stage',
    material: 'Anodized Al Fin Sink · FR-4',
    summary: 'Multiwatt-15 motor driver with 8 M7 flyback diodes and 3 screw terminal blocks.',
    getMetrics: (t) => [
      { label: 'Heatsink Temp', value: `${t.l298nTempC.toFixed(1)} °C` },
      { label: 'Bridge Load', value: `${t.motorCurrent.toFixed(2)} A` },
    ],
  },
  mpu: {
    title: 'GY-521 MPU-6050 IMU',
    tierLabel: 'Tier 3 · Center Axis',
    material: 'MEMS QFN-24 · Blue Solder Mask',
    summary: '6-axis accelerometer & gyroscope feeding closed-loop inverted pendulum PID.',
    getMetrics: (t) => [
      { label: 'Pitch Tilt θ', value: `${t.pitchDeg.toFixed(2)}°` },
      { label: 'Drive Speed', value: `${t.wheelRpm.toFixed(0)} rpm` },
    ],
  },
  buck: {
    title: 'LM2596S Buck Regulator',
    tierLabel: 'Tier 2 · Left Bay',
    material: 'Toroidal Inductor · Bourns Trim',
    summary: 'Step-down DC-DC converter regulating battery rail cleanly to 5.0 V logic.',
    getMetrics: () => [
      { label: 'Logic Rail', value: '5.00 V' },
      { label: 'Switch Freq', value: '150 kHz' },
    ],
  },
  bt: {
    title: 'HC-05 Wireless Link',
    tierLabel: 'Tier 2 · Right Bay',
    material: 'CSR BC417 · Heat-Shrink Sleeve',
    summary: '2.4 GHz SPP RF transceiver with gold meander PCB antenna and front DuPont pins.',
    getMetrics: () => [
      { label: 'RF Band', value: '2.40 GHz' },
      { label: 'Baud Rate', value: '9600 bps' },
    ],
  },
  motors: {
    title: 'Coaxial DC Gearmotors',
    tierLabel: 'Under-Deck · Axle',
    material: 'Brushed Steel Can · Poly Gearbox',
    summary: 'Dual 12 V brushed motors cushioned on open-cell foam pads with rear-routed leads.',
    getMetrics: (t) => [
      { label: 'Can Temp', value: `${t.motorTempC.toFixed(1)} °C` },
      { label: 'Armature', value: `${t.motorCurrent.toFixed(2)} A` },
    ],
  },
  wheels: {
    title: '32-Lug EPDM Drive Wheels',
    tierLabel: 'Axle · Ground Contact',
    material: 'EPDM Tread · ABS Rim (Ø 96 mm)',
    summary: 'High-traction ribbed tires locked onto coaxial shafts with cross-drilled pins.',
    getMetrics: (t) => [
      { label: 'Wheel Speed', value: `${t.wheelRpm.toFixed(1)} rpm` },
      { label: 'Travel Z', value: `${(t.positionZ * 100).toFixed(1)} cm` },
    ],
  },
  counterweight: {
    title: 'Ceramic Ballast Block',
    tierLabel: 'Tier 3 · Rear Edge',
    material: 'Fired Ceramic · 3 Machined Bores',
    summary: 'Rear-mounted mass balancing frontal ultrasonic/driver CG offset around the axle.',
    getMetrics: (t) => [
      { label: 'Aero Drag', value: `${t.aeroDragMn.toFixed(0)} mN` },
      { label: 'CG Tilt', value: `${t.pitchDeg.toFixed(2)}°` },
    ],
  },
  standoffs: {
    title: 'Hex Brass Standoff Columns',
    tierLabel: 'Structural Frame · M3',
    material: 'Machined C360 Brass · Phillips M3',
    summary: 'Four-corner hex spacers transmitting bending and axial preload across all 3 tiers.',
    getMetrics: (t) => [
      { label: 'Max Stress', value: `${t.maxStressMpa.toFixed(2)} MPa` },
      { label: 'Safety Factor', value: `${(180 / Math.max(0.2, t.maxStressMpa)).toFixed(0)}×` },
    ],
  },
  chassis: {
    title: '3-Tier Foamex Deck Stack',
    tierLabel: 'Primary Structure · 130×104 mm',
    material: 'Matte PVC Foamex · 3.4 mm Plate',
    summary: 'Chamfered 3-level electronics platform with center cable-routing grommet bores.',
    getMetrics: (t) => [
      { label: 'Aero Drag', value: `${t.aeroDragMn.toFixed(0)} mN` },
      { label: 'Max Stress', value: `${t.maxStressMpa.toFixed(2)} MPa` },
    ],
  },
};

export function getPartTitle(part: InspectablePartId): string {
  return PART_SPECS[part].title;
}

interface ComponentInspectorProps {
  part: InspectablePartId | null;
  telemetry: TelemetrySample;
  onSelectPart: (part: InspectablePartId) => void;
  onClose: () => void;
}

export function ComponentInspector({
  part,
  telemetry,
  onSelectPart,
  onClose,
}: ComponentInspectorProps) {
  if (!part) return null;
  const spec = PART_SPECS[part];
  const idx = INSPECTABLE_ORDER.indexOf(part);
  const prevPart = INSPECTABLE_ORDER[(idx - 1 + INSPECTABLE_ORDER.length) % INSPECTABLE_ORDER.length];
  const nextPart = INSPECTABLE_ORDER[(idx + 1) % INSPECTABLE_ORDER.length];
  const metrics = spec.getMetrics(telemetry);

  return (
    <aside
      aria-label="Selected hardware subsystem inspector"
      className="pointer-events-auto w-[min(264px,calc(100vw-68px))] sm:w-[280px] bg-[#17191e]/95 border border-white/[0.10] rounded-md text-[#f1efe9] overflow-hidden shadow-lg"
    >
      <div className="flex items-start justify-between gap-2 px-3.5 pt-3 pb-2 border-b border-white/[0.08]">
        <div className="min-w-0">
          <div className="text-[11px] text-[#d99b42] font-medium truncate">
            {spec.tierLabel}
          </div>
          <h2 className="font-display text-sm font-semibold text-[#f1efe9] leading-snug mt-0.5">
            {spec.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close component inspector"
          className="p-1 rounded text-[#9a9891] hover:text-[#f1efe9] hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3.5 py-2.5 space-y-2.5">
        <div className="text-[11px] text-[#9a9891]">{spec.material}</div>
        <p className="text-xs text-[#d6d3cb] leading-relaxed">{spec.summary}</p>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.07]">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className="text-[10px] text-[#8b8982]">{m.label}</div>
              <div className="font-mono-tabular text-xs font-medium text-[#f3c478] mt-0.5">
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-[#121316]/70 border-t border-white/[0.07] text-[11px]">
        <button
          type="button"
          onClick={() => onSelectPart(prevPart)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[#c9c6be] hover:text-[#f1efe9] hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>

        <span className="font-mono-tabular text-[10px] text-[#7d7b74] flex items-center gap-1">
          <Crosshair className="w-3 h-3 text-[#d99b42]" />
          {idx + 1}/{INSPECTABLE_ORDER.length}
        </span>

        <button
          type="button"
          onClick={() => onSelectPart(nextPart)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[#c9c6be] hover:text-[#f1efe9] hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
