import type { FilterState } from "../types";
import { THRESHOLD_LABELS } from "../lib/metrics";
import {
  DIVERGING_NEGATIVE,
  DIVERGING_NEUTRAL,
  DIVERGING_POSITIVE,
  FIXED_BREAK_LABELS,
  SEQUENTIAL_BLUE,
} from "../lib/color";

interface Props {
  filters: FilterState;
}

export function Legend({ filters }: Props) {
  if (filters.viewMode === "change") {
    return (
      <div className="legend">
        <span className="legend-title">
          Change in % affordable ({THRESHOLD_LABELS[filters.threshold]}), 2025→2026
        </span>
        <div className="legend-diverging">
          <span className="legend-chip" style={{ background: DIVERGING_NEGATIVE }} />
          <span>Less affordable</span>
          <span className="legend-chip" style={{ background: DIVERGING_NEUTRAL }} />
          <span>~Flat</span>
          <span className="legend-chip" style={{ background: DIVERGING_POSITIVE }} />
          <span>More affordable</span>
        </div>
      </div>
    );
  }

  return (
    <div className="legend">
      <span className="legend-title">
        % of listings affordable at {THRESHOLD_LABELS[filters.threshold]}
      </span>
      <div className="legend-sequential">
        {SEQUENTIAL_BLUE.map((color, i) => (
          <div key={color} className="legend-step">
            <span className="legend-chip" style={{ background: color }} />
            <span className="legend-step-label">{FIXED_BREAK_LABELS[i]}</span>
          </div>
        ))}
      </div>
      <span className="legend-foot">Fixed scale — comparable across all toggles</span>
    </div>
  );
}
