import type {
  AmiThreshold,
  BedroomStat,
  FilterState,
  MetricGroup,
  WardRecord,
  YearKey,
} from "../types";

export function getYearDetail(ward: WardRecord, year: YearKey) {
  return year === "2025" ? ward.y2025 : ward.y2026;
}

/** Percent of listings affordable, for the given group and AMI threshold. */
export function getGroupPct(
  ward: WardRecord,
  year: YearKey,
  group: MetricGroup,
  threshold: AmiThreshold = "60ARO"
): number | null {
  const detail = getYearDetail(ward, year);
  if (!detail) return null;
  const g = group === "combined" ? detail.combined : group === "rentals" ? detail.rentals : detail.forSale;
  return threshold === "60ARO" ? g.pctAffordable60ARO : g.pctAffordable100AMI;
}

export function getGroupCounts(ward: WardRecord, year: YearKey, group: MetricGroup) {
  const detail = getYearDetail(ward, year);
  if (!detail) return { affordable: null, total: null };
  const g = group === "combined" ? detail.combined : group === "rentals" ? detail.rentals : detail.forSale;
  return { affordable: g.totalAffordable60ARO, total: g.totalListings0to5br };
}

export function getPctChange(
  ward: WardRecord,
  group: MetricGroup,
  threshold: AmiThreshold = "60ARO"
): number | null {
  const p2025 = getGroupPct(ward, "2025", group, threshold);
  const p2026 = getGroupPct(ward, "2026", group, threshold);
  if (p2025 == null || p2026 == null) return null;
  return p2026 - p2025;
}

export function getRank(ward: WardRecord, year: YearKey): number | null {
  const detail = getYearDetail(ward, year);
  return detail?.ranks.combinedAffordable60ARO ?? null;
}

export function getRankChange(ward: WardRecord): number | null {
  return ward.comparison?.rankChange ?? null;
}

export function getMetricValue(ward: WardRecord, filters: FilterState): number | null {
  if (filters.viewMode === "change") return getPctChange(ward, filters.metricGroup, filters.threshold);
  return getGroupPct(ward, filters.year, filters.metricGroup, filters.threshold);
}

export function getListingsCount(ward: WardRecord, year: YearKey, group: MetricGroup): number | null {
  const detail = getYearDetail(ward, year);
  if (!detail) return null;
  if (group === "combined") return (detail.rentals.listings ?? 0) + (detail.forSale.listings ?? 0);
  if (group === "rentals") return detail.rentals.listings;
  return detail.forSale.listings;
}

export function getMedian(ward: WardRecord, year: YearKey, group: MetricGroup): number | null {
  const detail = getYearDetail(ward, year);
  if (!detail) return null;
  if (group === "forSale") return detail.forSale.medianPrice ?? null;
  return detail.rentals.medianRent ?? null;
}

const BEDROOM_LABELS: Record<string, string> = {
  studio: "Studio",
  "1br": "1 bed",
  "2br": "2 bed",
  "3br": "3 bed",
  "4br": "4 bed",
  "5br": "5 bed",
};

const BEDROOM_ORDER = ["studio", "1br", "2br", "3br", "4br", "5br"];

/**
 * Bedroom-size breakdown. Pass a single ward, or all wards to aggregate citywide.
 * NOTE: the source sheet only breaks listings out by bedroom at the 60% AMI ARO
 * limit, so this view is always 60% AMI regardless of the threshold toggle.
 */
export function getBedroomStats(
  wards: WardRecord[],
  year: YearKey,
  group: MetricGroup
): BedroomStat[] {
  return BEDROOM_ORDER.map((size, i) => {
    let total = 0;
    let affordable = 0;
    for (const w of wards) {
      const detail = getYearDetail(w, year);
      if (!detail) continue;
      const groups =
        group === "combined"
          ? [detail.rentals, detail.forSale]
          : group === "rentals"
            ? [detail.rentals]
            : [detail.forSale];
      for (const g of groups) {
        const b = g.byBedroom[i];
        if (!b) continue;
        total += b.count ?? 0;
        affordable += b.affordable ?? 0;
      }
    }
    return {
      size,
      label: BEDROOM_LABELS[size] ?? size,
      total,
      affordable,
      pct: total > 0 ? (affordable / total) * 100 : null,
    };
  });
}

export const METRIC_GROUP_LABELS: Record<MetricGroup, string> = {
  combined: "Rent + For Sale",
  rentals: "Rentals only",
  forSale: "For sale only",
};

export const THRESHOLD_LABELS: Record<AmiThreshold, string> = {
  "60ARO": "60% AMI",
  "100AMI": "100% AMI",
};
