import { useMemo } from "react";

export interface ScatterPoint {
  ward: number;
  x: number;
  y: number;
}

interface Props {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  /** Formatters for the axes and the tooltip. */
  fmtX: (v: number) => string;
  fmtY: (v: number) => string;
  selectedWard: number | null;
  hoveredWard: number | null;
  onSelectWard: (w: number | null) => void;
  onHoverWard: (w: number | null) => void;
  /** Wards to always try to label, before anything else. */
  labelled?: number[];
  /** Cap on labels drawn. Enough to orient, not so many it reads as noise. */
  maxLabels?: number;
}

/**
 * A single runaway value flattens everyone else against the axis. Where the
 * largest point is far clear of the next one, the scale is set by the next
 * one instead and the outlier is pinned to the top edge — visible and
 * labelled, never silently dropped.
 */
const OUTLIER_RATIO = 1.6;

function domainMax(values: number[]): { max: number; clipped: boolean } {
  if (values.length < 3) return { max: Math.max(...values), clipped: false };
  const sorted = [...values].sort((a, b) => b - a);
  const [first, second] = sorted;
  if (second > 0 && first / second >= OUTLIER_RATIO) {
    return { max: second, clipped: true };
  }
  return { max: first, clipped: false };
}

// Wide and short: the chart fills the page column like the other pages'
// content, and container width drives height, so a tall aspect ratio would
// push everything below it off screen.
const W = 760;
const H = 390;
const M = { top: 18, right: 20, bottom: 52, left: 66 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

const DOT = "#0d96c9";
const DOT_ACTIVE = "#d85a42";

/** Round a domain out to readable tick values. */
function ticks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max; v += step) out.push(Number(v.toFixed(6)));
  // The domain is set by the last tick, so it must reach past the largest
  // value — otherwise the extreme points render outside the plot area.
  while (out[out.length - 1] < max) {
    out.push(Number((out[out.length - 1] + step).toFixed(6)));
  }
  return out;
}

/** Least-squares fit, drawn only to show the direction of the relationship. */
function trend(points: ScatterPoint[]) {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (!den) return null;
  const slope = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den;
  return { slope, intercept: my - slope * mx };
}

interface Placed {
  ward: number;
  text: string;
  x: number;
  y: number;
}

/** Approximate box for a 10px label — SVG gives no metrics without measuring. */
const CH = 6.0;
const LH = 11;
/** Padded a little: an exact box lets labels touch, which still reads as a clash. */
const PAD = 1.5;
const box = (l: Placed) => ({
  x: l.x - PAD,
  y: l.y - LH + 2 - PAD,
  w: l.text.length * CH + PAD * 2,
  h: LH + PAD * 2,
});
const hits = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Label as many wards as will fit. Each point is tried in four positions and
 * kept only if its box clears every label already placed and every marker, so
 * the plot stays readable as points cluster.
 */
function placeLabels(
  pts: { ward: number; cx: number; cy: number; text: string; forced: boolean }[],
  priority: number[],
  max: number
): Placed[] {
  const rank = (w: number) => {
    const i = priority.indexOf(w);
    return i === -1 ? priority.length : i;
  };
  const order = [...pts].sort(
    (a, b) => Number(b.forced) - Number(a.forced) || rank(a.ward) - rank(b.ward)
  );
  const placed: Placed[] = [];
  const markers = pts.map((p) => ({ x: p.cx - 6, y: p.cy - 6, w: 12, h: 12 }));

  for (const p of order) {
    if (placed.length >= max && !p.forced) break;
    const w = p.text.length * CH;
    const candidates: Placed[] = [
      { ward: p.ward, text: p.text, x: p.cx + 9, y: p.cy + 4 },
      { ward: p.ward, text: p.text, x: p.cx - 9 - w, y: p.cy + 4 },
      { ward: p.ward, text: p.text, x: p.cx - w / 2, y: p.cy - 9 },
      { ward: p.ward, text: p.text, x: p.cx - w / 2, y: p.cy + 16 },
    ];
    const fit = candidates.find((c) => {
      const b = box(c);
      if (b.x < -4 || b.x + b.w > PW + 4 || b.y < -4 || b.y + b.h > PH + 4) return false;
      if (placed.some((q) => hits(b, box(q)))) return false;
      return !markers.some((m) => hits(b, m));
    });
    if (fit) placed.push(fit);
    else if (p.forced) placed.push(candidates[0]); // never hide a pinned outlier
  }
  return placed;
}

export function Scatter({
  points,
  xLabel,
  yLabel,
  fmtX,
  fmtY,
  selectedWard,
  hoveredWard,
  onSelectWard,
  onHoverWard,
  labelled = [],
  maxLabels = 12,
}: Props) {
  const { xs, ys, xt, yt, yTop, clipped, line } = useMemo(() => {
    const xMin = 0;
    const xTicks = ticks(xMin, Math.max(...points.map((p) => p.x)));
    const { max: yMax, clipped } = domainMax(points.map((p) => p.y));
    const yTicks = ticks(0, yMax);
    const top = yTicks[yTicks.length - 1];
    return {
      xs: (v: number) => ((v - xMin) / (xTicks[xTicks.length - 1] - xMin)) * PW,
      // clamp so an off-scale point sits on the top edge rather than above it
      ys: (v: number) => PH - (Math.min(v, top) / top) * PH,
      xt: xTicks,
      yt: yTicks,
      yTop: top,
      clipped,
      line: trend(points),
    };
  }, [points]);

  const labels = useMemo(() => {
    const prepared = points.map((p) => {
      const off = p.y > yTop;
      return {
        ward: p.ward,
        cx: xs(p.x),
        cy: ys(p.y),
        text: off ? `${p.ward} · ${fmtY(p.y)}` : String(p.ward),
        forced: off,
      };
    });
    return placeLabels(prepared, labelled, maxLabels);
  }, [points, xs, ys, yTop, fmtY, labelled, maxLabels]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="scatter" role="img" aria-label={`${yLabel} against ${xLabel}`}>
      <g transform={`translate(${M.left},${M.top})`}>
        {yt.map((t) => (
          <g key={`y${t}`}>
            <line x1={0} x2={PW} y1={ys(t)} y2={ys(t)} stroke="var(--rule-soft)" strokeWidth={1} />
            <text x={-10} y={ys(t) + 4} textAnchor="end" className="sc-axis">
              {fmtY(t)}
            </text>
          </g>
        ))}
        {xt.map((t) => (
          <text key={`x${t}`} x={xs(t)} y={PH + 20} textAnchor="middle" className="sc-axis">
            {fmtX(t)}
          </text>
        ))}
        <line x1={0} x2={PW} y1={PH} y2={PH} stroke="var(--rule)" strokeWidth={1} />

        {line && (
          <line
            x1={xs(xt[0])}
            y1={ys(Math.max(0, line.intercept + line.slope * xt[0]))}
            x2={xs(xt[xt.length - 1])}
            y2={ys(Math.max(0, line.intercept + line.slope * xt[xt.length - 1]))}
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="5 4"
            opacity={0.7}
          />
        )}

        {points.map((p) => {
          const active = p.ward === selectedWard || p.ward === hoveredWard;
          const off = p.y > yTop;
          const cx = xs(p.x);
          const cy = ys(p.y);
          const handlers = {
            style: { cursor: "pointer" },
            onMouseEnter: () => onHoverWard(p.ward),
            onMouseLeave: () => onHoverWard(null),
            onClick: () => onSelectWard(selectedWard === p.ward ? null : p.ward),
          };
          const tip = (
            <title>
              {`Ward ${p.ward}\n${xLabel}: ${fmtX(p.x)}\n${yLabel}: ${fmtY(p.y)}` +
                (off ? "  (above the axis)" : "")}
            </title>
          );
          return (
            <g key={p.ward}>
              {off ? (
                // pinned to the top edge, drawn as an upward marker
                <polygon
                  points={`${cx},${cy - 9} ${cx - 7},${cy + 4} ${cx + 7},${cy + 4}`}
                  fill={active ? DOT_ACTIVE : DOT}
                  stroke="var(--ground)"
                  strokeWidth={1.5}
                  {...handlers}
                >
                  {tip}
                </polygon>
              ) : (
                <circle
                  cx={cx}
                  cy={cy}
                  r={active ? 8 : 5}
                  fill={active ? DOT_ACTIVE : DOT}
                  fillOpacity={active ? 1 : 0.72}
                  stroke="var(--ground)"
                  strokeWidth={1.5}
                  {...handlers}
                >
                  {tip}
                </circle>
              )}
            </g>
          );
        })}

        {labels.map((l) => (
          <text
            key={l.ward}
            x={l.x}
            y={l.y}
            className={
              l.ward === selectedWard || l.ward === hoveredWard
                ? "sc-point-label active"
                : "sc-point-label"
            }
          >
            {l.text}
          </text>
        ))}

        {clipped && (
          <text x={PW} y={-6} textAnchor="end" className="sc-clip-note">
            ▲ above the axis
          </text>
        )}

        <text transform={`translate(${-50},${PH / 2}) rotate(-90)`} textAnchor="middle" className="sc-axis-title">
          {yLabel}
        </text>
        <text x={PW / 2} y={PH + 44} textAnchor="middle" className="sc-axis-title">
          {xLabel}
        </text>
      </g>
    </svg>
  );
}
