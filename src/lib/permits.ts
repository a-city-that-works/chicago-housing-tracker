/**
 * Permit data access + the colour scale for the permitting heatmap.
 *
 * The distribution is extremely skewed — over 2010-2026 the top ward permitted
 * ~450x the bottom ward — so a linear scale would paint 47 wards identically.
 * Breaks are therefore geometric (roughly a doubling per step) and expressed as
 * units PER YEAR, so changing the year range moves the map without moving the
 * scale under it.
 */
export interface PermitsData {
  meta: {
    source: string;
    firstYear: number;
    lastYear: number;
    lastDate: string;
    permits: number;
    unclassifiedShare: number;
    note: string;
  };
  /** ward -> year -> units */
  units: Record<string, Record<string, number>>;
  /** ward -> year -> units in 1-unit buildings */
  sfh: Record<string, Record<string, number>>;
  /** ward -> year -> units in 2+ unit buildings */
  mfh: Record<string, Record<string, number>>;
  /** ward -> year -> permit count */
  permits: Record<string, Record<string, number>>;
  /** Smallest project published individually. */
  projectMinUnits: number;
  /** ward -> notable projects, largest first. */
  projects: Record<string, Project[]>;
}

export interface Project {
  /** issue date */
  d: string;
  /** units */
  u: number;
  /** address */
  a: string;
  /** permit number */
  p: string;
}

export interface WardPermits {
  ward: number;
  units: number;
  sfh: number;
  mfh: number;
  permits: number;
  perYear: number;
  /** Share of units in multi-family buildings, or null where nothing was built. */
  mfhShare: number | null;
  rank: number;
}

/** Units per year. Geometric so the long tail stays legible. */
export const PERMIT_BREAKS = [5, 15, 40, 100, 250, 600];

export const PERMIT_BREAK_LABELS = [
  "under 5",
  "5–15",
  "15–40",
  "40–100",
  "100–250",
  "250–600",
  "600+",
];

/** Sequential ramp in the partner azure, matching the affordability map. */
export const PERMIT_RAMP = [
  "#e2f4fc",
  "#b3e2f6",
  "#7cccef",
  "#3fb2e3",
  "#0d96c9",
  "#00718f",
  "#004a63",
];

export const PERMIT_NO_DATA = "#e4e9eb";

export function permitColor(perYear: number | null): string {
  if (perYear == null) return PERMIT_NO_DATA;
  let i = 0;
  while (i < PERMIT_BREAKS.length && perYear > PERMIT_BREAKS[i]) i++;
  return PERMIT_RAMP[Math.min(i, PERMIT_RAMP.length - 1)];
}

/**
 * Totals per ward across [from, to] inclusive.
 * `years` counts the span, with the final year pro-rated when the data stops
 * mid-year, so the per-year rate isn't dragged down by a partial year.
 */
export function summarise(
  data: PermitsData,
  from: number,
  to: number
): { rows: WardPermits[]; years: number; total: number } {
  const lastMonth = Number(data.meta.lastDate.slice(5, 7));
  const partial = to === data.meta.lastYear ? lastMonth / 12 : 1;
  const years = Math.max(0.25, to - from + partial);

  const rows: WardPermits[] = [];
  let total = 0;
  for (let w = 1; w <= 50; w++) {
    const key = String(w);
    let units = 0;
    let sfh = 0;
    let mfh = 0;
    let permits = 0;
    for (let y = from; y <= to; y++) {
      const ys = String(y);
      units += data.units[key]?.[ys] ?? 0;
      sfh += data.sfh[key]?.[ys] ?? 0;
      mfh += data.mfh[key]?.[ys] ?? 0;
      permits += data.permits[key]?.[ys] ?? 0;
    }
    total += units;
    rows.push({
      ward: w, units, sfh, mfh, permits,
      perYear: units / years,
      mfhShare: units > 0 ? mfh / units : null,
      rank: 0,
    });
  }
  rows.sort((a, b) => b.units - a.units);
  rows.forEach((r, i) => (r.rank = i + 1));
  return { rows, years, total };
}

/** Citywide units per year, for the trend strip. */
export function yearlyTotals(data: PermitsData): { year: number; units: number }[] {
  const out: { year: number; units: number }[] = [];
  for (let y = data.meta.firstYear; y <= data.meta.lastYear; y++) {
    let units = 0;
    for (const w of Object.keys(data.units)) units += data.units[w][String(y)] ?? 0;
    out.push({ year: y, units });
  }
  return out;
}


/** Largest projects in a ward within the selected years. */
export function wardProjects(
  data: PermitsData,
  ward: number,
  from: number,
  to: number,
  limit = 5
): Project[] {
  const all = data.projects[String(ward)] ?? [];
  return all
    .filter((p) => {
      const y = Number(p.d.slice(0, 4));
      return y >= from && y <= to;
    })
    .slice(0, limit);
}

/** Rows as CSV, for the download button. */
export function toCsv(rows: WardPermits[], from: number, to: number): string {
  const head = ["ward", "units", "sfh_units", "mfh_units", "mfh_share", "permits", "units_per_year", "years"];
  const lines = [head.join(",")];
  for (const r of [...rows].sort((a, b) => a.ward - b.ward)) {
    lines.push([
      r.ward, r.units, r.sfh, r.mfh,
      r.mfhShare == null ? "" : r.mfhShare.toFixed(4),
      r.permits, r.perYear.toFixed(2), `${from}-${to}`,
    ].join(","));
  }
  return lines.join("\n");
}
