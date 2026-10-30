import type { PermitsData, WardBasis } from "./permits";

export const TREND_METRICS = {
  units: { label: "Housing units", title: "New housing units permitted", unit: "units", description: "Gross new housing units permitted. Excludes conversions and demolitions." },
  sfh: { label: "Single-family", title: "Single-family housing units permitted", unit: "units", description: "New units in single-family (1-unit) buildings. Excludes conversions." },
  mfh: { label: "Multifamily", title: "Multifamily housing units permitted", unit: "units", description: "New units in multifamily (2+ unit) buildings. Counts homes, not buildings; excludes conversions." },
  conversions: { label: "Conversions", title: "Housing units gained or lost through conversions", unit: "units", description: "Units gained minus units lost through documented conversions of existing buildings. Can be negative. Excludes demolitions; not total net housing growth." },
  combined: { label: "Including conversions", title: "New housing units, including conversions", unit: "units", description: "Gross new housing units plus conversion gains and losses. Excludes demolitions; not total net housing growth." },
} as const;

export type TrendMetric = keyof typeof TREND_METRICS;
export interface AnnualPoint { year: number; value: number; partial: boolean }
export interface WardSeries { ward: number; points: AnnualPoint[] }

/** Calendar-year counts, never annualized. Absent sparse table entries mean zero. */
export function annualWardSeries(data: PermitsData, metric: TrendMetric, basis: WardBasis): WardSeries[] {
  const tables = basis === "atIssue" ? data.atIssue : data;
  const conversions = basis === "atIssue" ? data.conversions.atIssue : data.conversions;
  return Array.from({ length: 50 }, (_, index) => {
    const ward = index + 1;
    const points = Array.from({ length: data.meta.lastYear - data.meta.firstYear + 1 }, (_, offset) => {
      const year = data.meta.firstYear + offset;
      const conversion = (conversions.sfh[ward]?.[year] ?? 0) + (conversions.mfh[ward]?.[year] ?? 0);
      const value = metric === "conversions" ? conversion
        : metric === "combined" ? (tables.units[ward]?.[year] ?? 0) + conversion
        : tables[metric][ward]?.[year] ?? 0;
      return { year, value, partial: year === data.meta.lastYear && data.meta.lastDate < `${year}-12-31` };
    });
    return { ward, points };
  });
}

/** Position the effective date within its calendar year, including leap years. */
export function fractionalYear(date: string): number {
  const year = Number(date.slice(0, 4));
  return year + (Date.parse(`${date}T00:00:00Z`) - Date.UTC(year, 0, 1)) /
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1));
}

/** A zero-inclusive linear domain; selecting a ward must not change the scale. */
export function trendTicks(values: number[]): number[] {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const raw = (high - low || 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= raw) ?? 10) * magnitude);
  const start = Math.floor(low / step) * step;
  const end = Math.max(start + step, Math.ceil(high / step) * step);
  return Array.from({ length: Math.round((end - start) / step) + 1 }, (_, i) => start + i * step);
}

/** Distance to a line segment in rendered pixels for consistent pointer hit areas. */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
