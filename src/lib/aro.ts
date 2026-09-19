/**
 * ARO (Affordable Requirements Ordinance) data access.
 *
 * The source is a snapshot of rental buildings carrying ARO units, with no
 * date field; years come from matching each building to the nearest
 * new-construction permit. See scripts/import_aro.py for how that is done and
 * what it misses.
 */
import { PERMIT_RAMP, PERMIT_NO_DATA, type PermitsData } from "./permits";

export interface AroWardRecord {
  units: number;
  buildings: number;
  /** Buildings whose year could be recovered from a permit. */
  dated: number;
  /** Buildings where the ARO units sit at a different address. */
  offSite: number;
  ARO_30: number;
  ARO_40: number;
  ARO_50: number;
  ARO_60: number;
  ARO_70: number;
  ARO_80: number;
  ARO_100: number;
}

export interface AroProject {
  /** Building name */
  n: string;
  /** Address */
  a: string;
  /** ARO units */
  u: number;
  /** Permit year, or null where no permit matched */
  y: string | null;
  /** How that year was found. */
  m: "exact" | "address" | "none";
  /** Whether the permit was new construction or a conversion of an existing building. */
  k: "new" | "conversion" | null;
}

export interface AroData {
  meta: {
    source: string;
    sourceUrl: string;
    service: string;
    vintage: string;
    buildings: number;
    units: number;
    datedUnits: number;
    datedShare: number;
    undatedBuildings: number;
    addrTolerance: number;
    unitsNewBuild: number;
    unitsConversion: number;
    matchMethods: { exact: number; address: number };
    note: string;
  };
  amiTiers: string[];
  byWard: Record<string, AroWardRecord>;
  byYear: Record<string, number>;
  byWardYear: Record<string, Record<string, number>>;
  projects: Record<string, AroProject[]>;
}

export interface AroWardRow {
  ward: number;
  units: number;
  buildings: number;
  /** All new units permitted in the ward over the same span. */
  allUnits: number;
  /** ARO units as a share of all new units, or null where nothing was built. */
  share: number | null;
  /** Share of this ward's ARO units restricted at 60% AMI or below. */
  deepShare: number | null;
  rank: number;
}

/**
 * Units per ward. The distribution is extremely skewed — one ward holds 43% of
 * every ARO unit in the city — so breaks are geometric, as on the permit map.
 */
export const ARO_BREAKS = [10, 25, 50, 100, 200, 500];

export const ARO_BREAK_LABELS = [
  "under 10",
  "10–25",
  "25–50",
  "50–100",
  "100–200",
  "200–500",
  "500+",
];

/** Same sequential azure as the permitting map, so the site reads as one system. */
export const ARO_RAMP = PERMIT_RAMP;
export const ARO_NO_DATA = PERMIT_NO_DATA;

export function aroColor(units: number | null): string {
  if (units == null || units === 0) return ARO_NO_DATA;
  let i = 0;
  while (i < ARO_BREAKS.length && units > ARO_BREAKS[i]) i++;
  return ARO_RAMP[Math.min(i, ARO_RAMP.length - 1)];
}

/** Every year present in either dataset, ascending. */
export function aroYears(aro: AroData): number[] {
  return Object.keys(aro.byYear).map(Number).sort((a, b) => a - b);
}

/**
 * Per-ward totals, joined to permit totals for the same years so ARO can be
 * expressed as a share of everything built.
 */
export function summariseAro(
  aro: AroData,
  permits: PermitsData,
  from: number,
  to: number
): { rows: AroWardRow[]; totalAro: number; totalAll: number } {
  const rows: AroWardRow[] = [];
  let totalAro = 0;
  let totalAll = 0;

  for (let w = 1; w <= 50; w++) {
    const key = String(w);
    const rec = aro.byWard[key];
    let units = 0;
    for (let y = from; y <= to; y++) units += aro.byWardYear[key]?.[String(y)] ?? 0;

    let allUnits = 0;
    for (let y = from; y <= to; y++) allUnits += permits.units[key]?.[String(y)] ?? 0;

    // AMI mix is a property of the building, not of the year, so it is only
    // meaningful across the full record — shown as such in the table.
    const deep = rec ? rec.ARO_30 + rec.ARO_40 + rec.ARO_50 + rec.ARO_60 : 0;

    totalAro += units;
    totalAll += allUnits;
    rows.push({
      ward: w,
      units,
      buildings: rec?.buildings ?? 0,
      allUnits,
      share: allUnits > 0 ? units / allUnits : null,
      deepShare: rec && rec.units > 0 ? deep / rec.units : null,
      rank: 0,
    });
  }

  rows.sort((a, b) => b.units - a.units);
  rows.forEach((r, i) => (r.rank = i + 1));
  return { rows, totalAro, totalAll };
}

/** Citywide ARO units and all permitted units, per year. */
export function aroByYear(
  aro: AroData,
  permits: PermitsData
): { year: number; aro: number; all: number; share: number | null }[] {
  const out: { year: number; aro: number; all: number; share: number | null }[] = [];
  for (let y = permits.meta.firstYear; y <= permits.meta.lastYear; y++) {
    const ys = String(y);
    const a = aro.byYear[ys] ?? 0;
    let all = 0;
    for (const w of Object.keys(permits.units)) all += permits.units[w][ys] ?? 0;
    out.push({ year: y, aro: a, all, share: all > 0 ? a / all : null });
  }
  return out;
}

/** Largest ARO buildings in a ward. */
export function aroProjects(aro: AroData, ward: number, limit = 5): AroProject[] {
  return (aro.projects[String(ward)] ?? []).slice(0, limit);
}

export function aroCsv(rows: AroWardRow[], from: number, to: number): string {
  const head = [
    "ward", "aro_units", "aro_buildings", "all_new_units",
    "aro_share_of_new_units", "share_at_60pct_ami_or_below", "years",
  ];
  const lines = [head.join(",")];
  for (const r of [...rows].sort((a, b) => a.ward - b.ward)) {
    lines.push([
      r.ward, r.units, r.buildings, r.allUnits,
      r.share == null ? "" : r.share.toFixed(5),
      r.deepShare == null ? "" : r.deepShare.toFixed(4),
      `${from}-${to}`,
    ].join(","));
  }
  return lines.join("\n");
}
