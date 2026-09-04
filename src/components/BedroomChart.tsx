import { useMemo } from "react";
import type { FilterState, WardRecord } from "../types";
import { getBedroomStats, METRIC_GROUP_LABELS } from "../lib/metrics";

interface Props {
  wards: WardRecord[];
  filters: FilterState;
  selectedWard: WardRecord | null;
}

const BAR_COLOR = "#0d96c9";
const TRACK_COLOR = "#e4e9eb";

export function BedroomChart({ wards, filters, selectedWard }: Props) {
  const scopeWards = selectedWard ? [selectedWard] : wards;
  const stats = useMemo(
    () => getBedroomStats(scopeWards, filters.year, filters.metricGroup),
    [scopeWards, filters.year, filters.metricGroup]
  );

  const maxPct = Math.max(10, ...stats.map((s) => s.pct ?? 0));

  return (
    <div className="chart-panel">
      <div className="chart-head">
        <h2 className="chart-title">Affordability by unit size</h2>
        <p className="chart-sub">
          Share of {METRIC_GROUP_LABELS[filters.metricGroup].toLowerCase()} listings at or under the
          60% AMI ARO rent limit for that bedroom count —{" "}
          {selectedWard ? `Ward ${selectedWard.ward}` : "all 50 wards"}, {filters.year}.
        </p>
      </div>

      <div className="bedroom-rows">
        {stats.map((s) => {
          const pct = s.pct;
          const width = pct == null ? 0 : (pct / maxPct) * 100;
          return (
            <div className="bedroom-row" key={s.size}>
              <span className="bedroom-label">{s.label}</span>
              <div className="bedroom-track" style={{ background: TRACK_COLOR }}>
                {pct != null && (
                  <div
                    className="bedroom-bar"
                    style={{ width: `${width}%`, background: BAR_COLOR }}
                  />
                )}
              </div>
              <span className="bedroom-value">{pct == null ? "—" : `${pct.toFixed(1)}%`}</span>
              <span className="bedroom-count">
                {s.total === 0 ? "no listings" : `${s.affordable.toLocaleString()} of ${s.total.toLocaleString()}`}
              </span>
            </div>
          );
        })}
      </div>

      <p className="chart-note">
        {selectedWard ? (
          <>
            Percentages on small bases move fast — a size with only a handful of listings can swing
            wildly. Read each percentage next to its raw count.
          </>
        ) : (
          <>
            Citywide, rate and supply pull in opposite directions: larger units clear the ARO limit
            more often (limits rise with bedroom count faster than rents do), but there are far fewer
            of them listed. Individual wards can invert this pattern.
          </>
        )}
        {filters.threshold === "100AMI" && (
          <>
            {" "}
            <strong>This chart stays at 60% AMI</strong> — the source sheet only breaks listings out
            by bedroom at the ARO limit, so there is no 100% AMI equivalent.
          </>
        )}
      </p>
    </div>
  );
}
