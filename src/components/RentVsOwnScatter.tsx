import { useMemo } from "react";
import type { FilterState, WardRecord } from "../types";
import { getGroupPct, THRESHOLD_LABELS } from "../lib/metrics";

interface Props {
  wards: WardRecord[];
  filters: FilterState;
  selectedWard: number | null;
  hoveredWard: number | null;
  onSelectWard: (ward: number | null) => void;
  onHoverWard: (ward: number | null) => void;
}

const W = 460;
const H = 400;
const M = { top: 16, right: 18, bottom: 44, left: 52 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const DOT = "#0d96c9";
/** Selection reads coral everywhere on the site, so the active dot matches. */
const DOT_SELECTED = "#d85a42";

export function RentVsOwnScatter({
  wards,
  filters,
  selectedWard,
  hoveredWard,
  onSelectWard,
  onHoverWard,
}: Props) {
  const points = useMemo(() => {
    return wards
      .map((w) => ({
        ward: w.ward,
        name: w.neighborhoodNames,
        rent: getGroupPct(w, filters.year, "rentals", filters.threshold),
        sale: getGroupPct(w, filters.year, "forSale", filters.threshold),
      }))
      .filter((p): p is { ward: number; name: string; rent: number; sale: number } =>
        p.rent != null && p.sale != null
      );
  }, [wards, filters.year, filters.threshold]);

  const max = Math.max(10, ...points.flatMap((p) => [p.rent, p.sale]));
  const scale = (v: number) => (v / max) * PLOT_W;
  const scaleY = (v: number) => PLOT_H - (v / max) * PLOT_H;

  const ticks = useMemo(() => {
    const step = max > 60 ? 20 : max > 30 ? 10 : 5;
    const out: number[] = [];
    for (let t = 0; t <= max; t += step) out.push(t);
    return out;
  }, [max]);

  const rentierCount = points.filter((p) => p.rent > p.sale).length;

  return (
    <div className="chart-panel">
      <div className="chart-head">
        <h2 className="chart-title">Renting vs. buying</h2>
        <p className="chart-sub">
          Each dot is a ward. Share of listings affordable at {THRESHOLD_LABELS[filters.threshold]},{" "}
          rentals (horizontal) vs. for sale (vertical), {filters.year}.
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="scatter-svg" role="img">
        <g transform={`translate(${M.left},${M.top})`}>
          {ticks.map((t) => (
            <g key={`gx-${t}`}>
              <line
                x1={scale(t)}
                x2={scale(t)}
                y1={0}
                y2={PLOT_H}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              <text
                x={scale(t)}
                y={PLOT_H + 16}
                textAnchor="middle"
                className="axis-text"
              >
                {t}%
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <g key={`gy-${t}`}>
              <line
                x1={0}
                x2={PLOT_W}
                y1={scaleY(t)}
                y2={scaleY(t)}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              <text x={-8} y={scaleY(t) + 4} textAnchor="end" className="axis-text">
                {t}%
              </text>
            </g>
          ))}

          {/* parity line: equal affordability renting and buying */}
          <line
            x1={0}
            y1={PLOT_H}
            x2={PLOT_W}
            y2={0}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text x={PLOT_W - 4} y={12} textAnchor="end" className="axis-text">
            equal
          </text>

          {points.map((p) => {
            const isActive = p.ward === selectedWard || p.ward === hoveredWard;
            return (
              <circle
                key={p.ward}
                cx={scale(p.rent)}
                cy={scaleY(p.sale)}
                r={isActive ? 7 : 4.5}
                fill={isActive ? DOT_SELECTED : DOT}
                fillOpacity={isActive ? 1 : 0.75}
                stroke="var(--surface-1)"
                strokeWidth={2}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => onHoverWard(p.ward)}
                onMouseLeave={() => onHoverWard(null)}
                onClick={() => onSelectWard(selectedWard === p.ward ? null : p.ward)}
              >
                <title>{`Ward ${p.ward} — ${p.name}\nRentals ${p.rent.toFixed(1)}% · For sale ${p.sale.toFixed(1)}%`}</title>
              </circle>
            );
          })}

          <text
            transform={`translate(${-38},${PLOT_H / 2}) rotate(-90)`}
            textAnchor="middle"
            className="axis-title"
          >
            % for-sale affordable
          </text>
          <text
            x={PLOT_W / 2}
            y={PLOT_H + 36}
            textAnchor="middle"
            className="axis-title"
          >
            % rentals affordable
          </text>
        </g>
      </svg>

      <p className="chart-note">
        Dots below the dashed line are wards where renting is more attainable than buying —{" "}
        <strong>{rentierCount} of {points.length} wards</strong> at this threshold. Dots above it are
        wards where the for-sale market is the more accessible one.
      </p>
    </div>
  );
}
