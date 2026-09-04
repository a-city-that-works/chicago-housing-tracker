import type { AmiThreshold, FilterState, MetricGroup, ViewMode, YearKey } from "../types";
import { METRIC_GROUP_LABELS, THRESHOLD_LABELS } from "../lib/metrics";

interface Props {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

const METRIC_GROUPS: MetricGroup[] = ["combined", "rentals", "forSale"];

export function Controls({ filters, onChange }: Props) {
  return (
    <div className="controls">
      <div className="control-group">
        <span className="control-label">View</span>
        <div className="segmented">
          {(["level", "change"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className={filters.viewMode === mode ? "active" : ""}
              onClick={() => onChange({ ...filters, viewMode: mode })}
            >
              {mode === "level" ? "Snapshot" : "2025 → 2026 change"}
            </button>
          ))}
        </div>
      </div>

      {filters.viewMode === "level" && (
        <div className="control-group">
          <span className="control-label">Year</span>
          <div className="segmented">
            {(["2025", "2026"] as YearKey[]).map((year) => (
              <button
                key={year}
                className={filters.year === year ? "active" : ""}
                onClick={() => onChange({ ...filters, year })}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="control-group">
        <span className="control-label">Listings</span>
        <div className="segmented">
          {METRIC_GROUPS.map((group) => (
            <button
              key={group}
              className={filters.metricGroup === group ? "active" : ""}
              onClick={() => onChange({ ...filters, metricGroup: group })}
            >
              {METRIC_GROUP_LABELS[group]}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <span className="control-label" title="60% AMI uses Chicago's ARO per-bedroom rent limits. 100% AMI uses a single flat citywide monthly cutoff.">
          Affordable at
        </span>
        <div className="segmented">
          {(["60ARO", "100AMI"] as AmiThreshold[]).map((t) => (
            <button
              key={t}
              className={filters.threshold === t ? "active" : ""}
              onClick={() => onChange({ ...filters, threshold: t })}
            >
              {THRESHOLD_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
