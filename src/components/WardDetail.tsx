import type { FilterState, WardRecord } from "../types";
import {
  getGroupPct,
  getListingsCount,
  getMedian,
  getPctChange,
  getRank,
  getRankChange,
  THRESHOLD_LABELS,
} from "../lib/metrics";

interface Props {
  ward: WardRecord;
  filters: FilterState;
}

export function WardDetail({ ward, filters }: Props) {
  const pct2025 = getGroupPct(ward, "2025", filters.metricGroup, filters.threshold);
  const pct2026 = getGroupPct(ward, "2026", filters.metricGroup, filters.threshold);
  const change = getPctChange(ward, filters.metricGroup, filters.threshold);
  const pctCurrent = filters.year === "2025" ? pct2025 : pct2026;
  const rankChange = getRankChange(ward);
  const listings = getListingsCount(ward, filters.year, filters.metricGroup);
  const median = getMedian(ward, filters.year, filters.metricGroup);
  const rank = getRank(ward, filters.year);

  return (
    <div className="ward-detail">
      <div className="ward-detail-header">
        <span className="ward-detail-number">Ward {ward.ward}</span>
        <span className="ward-detail-name">{ward.neighborhoodNames}</span>
      </div>
      <div className="ward-detail-grid">
        <div className="stat">
          <span className="stat-label">
            {THRESHOLD_LABELS[filters.threshold]} affordable ({filters.year})
          </span>
          <span className="stat-value">{pctCurrent != null ? `${pctCurrent.toFixed(1)}%` : "—"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Rank ({filters.year})</span>
          <span className="stat-value">{rank != null ? `#${rank} of 50` : "—"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Listings</span>
          <span className="stat-value">{listings ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{filters.metricGroup === "forSale" ? "Median price" : "Median rent"}</span>
          <span className="stat-value">{median != null ? `$${median.toLocaleString()}` : "—"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">2025 → 2026</span>
          <span className="stat-value">
            {pct2025 != null ? `${pct2025.toFixed(1)}%` : "—"} → {pct2026 != null ? `${pct2026.toFixed(1)}%` : "—"}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Rank change</span>
          <span className="stat-value">
            {rankChange == null ? "—" : rankChange === 0 ? "No change" : rankChange > 0 ? `↑ ${rankChange}` : `↓ ${Math.abs(rankChange)}`}
          </span>
        </div>
      </div>
      {change != null && (
        <p className="ward-detail-note">
          {change > 0
            ? `Affordability improved by ${change.toFixed(1)} percentage points year over year.`
            : change < 0
              ? `Affordability declined by ${Math.abs(change).toFixed(1)} percentage points year over year.`
              : "No change in affordability year over year."}
        </p>
      )}
    </div>
  );
}
