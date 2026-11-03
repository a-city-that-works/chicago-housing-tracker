import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import boundaryPeriods from "../data/wardBoundaryPeriods.json";
import type { PermitsData, WardBasis } from "../lib/permits";
import { annualWardSeries, fractionalYear, segmentDistance, trendTicks, TREND_METRICS, type TrendMetric, type WardSeries } from "../lib/permitTrends";
import "../styles/permit-trends.css";

const number = new Intl.NumberFormat("en-US");
const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function PermitTrends({ data }: { data: PermitsData }) {
  const id = useId();
  const [metric, setMetric] = useState<TrendMetric>("units");
  const [basis, setBasis] = useState<WardBasis>("atIssue");
  const [pinned, setPinned] = useState<number | null>(27);
  const [hovered, setHovered] = useState<number | null>(null);
  const [year, setYear] = useState(data.meta.lastYear);
  const [includePartial, setIncludePartial] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const allSeries = useMemo(() => annualWardSeries(data, metric, basis), [data, metric, basis]);
  const series = useMemo(() => allSeries.map((s) => ({ ...s, points: s.points.filter((p) => includePartial || !p.partial) })), [allSeries, includePartial]);
  const years = series[0].points.map((p) => p.year);
  const first = years[0];
  const last = years.at(-1)!;
  const activeYear = Math.min(year, last);
  const activeWard = pinned ?? hovered;
  const active = series.find((s) => s.ward === activeWard);
  const point = active?.points.find((p) => p.year === activeYear);
  const info = TREND_METRICS[metric];
  const formatValue = (value: number) => `${metric === "conversions" && value > 0 ? "+" : ""}${number.format(value)}`;
  const hasPartial = allSeries[0].points.some((p) => p.partial);
  const ticks = useMemo(() => trendTicks(series.flatMap((s) => s.points.map((p) => p.value))), [series]);
  const height = width < 600 ? 340 : 380;
  const left = width < 600 ? 48 : 60;
  const right = 20;
  const top = 62;
  const bottom = height - 34;
  const plotWidth = width - left - right;
  const x = (value: number) => left + (value - first) / Math.max(1, last - first) * plotWidth;
  const y = (value: number) => bottom - (value - ticks[0]) / (ticks.at(-1)! - ticks[0]) * (bottom - top);
  const path = (s: WardSeries, partial = false) => {
    const points = partial ? s.points.slice(-2) : s.points.filter((p) => !p.partial);
    return points.map((p, i) => `${i ? "L" : "M"}${x(p.year)},${y(p.value)}`).join(" ");
  };
  const remaps = boundaryPeriods.slice(1).filter((p) => fractionalYear(p.start) >= first && fractionalYear(p.start) <= last);
  const tickEvery = width < 480 ? 4 : width < 760 ? 2 : 1;
  const tooltipX = Math.max(left, Math.min(width - right - 150, x(activeYear) + 12));
  const tooltipY = point ? Math.max(top + 8, Math.min(bottom - 60, y(point.value) - 68)) : top;

  function pointerTarget(event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) * width / rect.width;
    const py = (event.clientY - rect.top) * height / rect.height;
    const targetYear = Math.max(first, Math.min(last, Math.round(first + (px - left) / plotWidth * (last - first))));
    let distance = 18;
    let ward: number | null = null;
    if (px >= left && px <= width - right && py >= top && py <= bottom) {
      for (const s of series) {
        for (let i = 1; i < s.points.length; i++) {
          const a = s.points[i - 1];
          const b = s.points[i];
          const d = segmentDistance(px, py, x(a.year), y(a.value), x(b.year), y(b.value));
          if (d < distance) { distance = d; ward = s.ward; }
        }
      }
    }
    return { ward, year: targetYear };
  }

  function clearWard() { setPinned(null); setHovered(null); }

  return (
    <section className="pt" aria-labelledby={`${id}-heading`} id="ward-trends">
      <div className="pt-heading">
        <div>
          <h2 id={`${id}-heading`}>How wards change over time</h2>
          <p>One line per ward. Follow housing activity from {data.meta.firstYear} to {data.meta.lastYear}.</p>
        </div>
        <a href="#permit-map">Explore the ward map</a>
      </div>

      <div className="pt-controls">
        <label className="pt-boundary-control">Ward boundaries
          <select value={basis} onChange={(e) => { setBasis(e.target.value as WardBasis); setHovered(null); }}>
            <option value="atIssue">At time of permit</option>
            <option value="current">Current (2023)</option>
          </select>
        </label>
        <label className="pt-metric-control">Metric
          <select value={metric} onChange={(e) => { setMetric(e.target.value as TrendMetric); setHovered(null); }}>
            {(Object.keys(TREND_METRICS) as TrendMetric[]).map((key) => (
              <option key={key} value={key}>{TREND_METRICS[key].label}</option>
            ))}
          </select>
        </label>
        <label>Highlight a ward
          <select value={pinned ?? ""} onChange={(e) => { setPinned(e.target.value ? Number(e.target.value) : null); setHovered(null); }}>
            <option value="">All 50 wards</option>
            {series.map((s) => <option key={s.ward} value={s.ward}>Ward {s.ward}</option>)}
          </select>
        </label>
        <button className="pt-clear" type="button" disabled={pinned === null} onClick={clearWard}>Clear selection</button>
        {hasPartial && <label className="pt-partial-toggle">
          <input type="checkbox" checked={includePartial} onChange={(e) => setIncludePartial(e.target.checked)} />
          Include {data.meta.lastYear} (partial)
        </label>}
      </div>

      <header className="pt-chart-heading">
        <h3 id={`${id}-chart-title`}>{info.title}</h3>
        <p className="pt-chart-context">
          <strong>{activeWard !== null ? `Ward ${activeWard} highlighted` : "All 50 wards"}</strong>
          {" · Chicago · "}<span className="pt-chart-years">{first}–{last}</span>
        </p>
        <p className="pt-chart-coverage">
          {basis === "atIssue" ? "Ward boundaries at time of permit" : "Current (2023) ward boundaries"}
          {includePartial && hasPartial ? ` · ${last} through ${date(data.meta.lastDate)}` : " · Complete years only"}
        </p>
        <p className="pt-definition" id={`${id}-definition`}>{info.description}</p>
      </header>
      <div className="pt-chart-meta">
        <span>{metric === "conversions" ? "Change in units per year" : "Units per year"}</span>
        <span className="pt-legend"><i /> All wards <i className="pt-selected-key" /> Highlighted ward</span>
      </div>
      <div ref={container} className="pt-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="group" tabIndex={0}
          aria-label={`${info.label} by ward and year. Use left and right arrows for years, up and down for wards, Enter to pin, Escape to clear.`}
          aria-describedby={`${id}-chart-title ${id}-readout ${id}-boundaries ${id}-definition`}
          onPointerMove={(event) => {
            if (event.pointerType === "touch") return;
            const target = pointerTarget(event);
            setYear(target.year);
            setHovered(target.ward);
          }}
          onPointerLeave={() => setHovered(null)}
          onClick={(event) => {
            const target = pointerTarget(event);
            if (target.ward !== null) { setPinned(pinned === target.ward ? null : target.ward); setYear(target.year); setHovered(null); }
          }}
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " ", "Escape", "Home", "End"].includes(event.key)) event.preventDefault();
            if (event.key === "ArrowLeft") setYear(Math.max(first, activeYear - 1));
            if (event.key === "ArrowRight") setYear(Math.min(last, activeYear + 1));
            if (event.key === "Home") setYear(first);
            if (event.key === "End") setYear(last);
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              const next = activeWard === null ? 1 : Math.max(1, Math.min(50, activeWard + (event.key === "ArrowDown" ? 1 : -1)));
              setPinned(next); setHovered(null);
            }
            if (event.key === "Enter" || event.key === " ") { setPinned(pinned === null ? hovered ?? 1 : null); setHovered(null); }
            if (event.key === "Escape") clearWard();
          }}>
          <title>{info.title} · all 50 Chicago wards · {first}–{last}{activeWard !== null ? ` · Ward ${activeWard} highlighted` : ""}</title>
          <g aria-hidden="true">
            {includePartial && hasPartial && <rect className="pt-partial-band" x={x(last - 0.5)} y={top} width={x(last) - x(last - 0.5)} height={bottom - top} />}
            {ticks.map((tick) => <g key={tick}>
              <line className={tick === 0 ? "pt-zero" : "pt-grid"} x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
              <text className="pt-axis" x={left - 10} y={y(tick) + 4} textAnchor="end">{number.format(tick)}</text>
            </g>)}
            {years.filter((value, i) => i % tickEvery === 0 || value === last).map((value) => (
              <text key={value} className="pt-axis" x={x(value)} y={height - 10} textAnchor="middle">{value}{value === data.meta.lastYear && hasPartial ? "*" : ""}</text>
            ))}
            {remaps.map((period) => <g key={period.id} className="pt-remap">
              <line x1={x(fractionalYear(period.start))} x2={x(fractionalYear(period.start))} y1={top - 8} y2={bottom} />
              <text x={x(fractionalYear(period.start))} y={22} textAnchor="middle">{period.id} remap</text>
              <text className="pt-remap-date" x={x(fractionalYear(period.start))} y={40} textAnchor="middle">{date(period.start).replace(`, ${period.id}`, "")}</text>
            </g>)}
            <g className={active ? "pt-lines has-active" : "pt-lines"}>
              {series.map((s) => <g key={s.ward} data-ward={s.ward}>
                <path d={path(s)} />
                {includePartial && hasPartial && <path d={path(s, true)} strokeDasharray="5 4" />}
              </g>)}
            </g>
            {active && <g className="pt-active">
              <path d={path(active)} />
              {includePartial && hasPartial && <path d={path(active, true)} strokeDasharray="5 4" />}
              {active.points.map((p) => <circle key={p.year} cx={x(p.year)} cy={y(p.value)} r={p.year === activeYear ? 5 : 2.5} />)}
              {point && <line className="pt-cursor" x1={x(activeYear)} x2={x(activeYear)} y1={top} y2={bottom} />}
            </g>}
            {active && point && <g className="pt-tooltip" transform={`translate(${tooltipX},${tooltipY})`}>
              <rect width={150} height={56} />
              <text x={10} y={20}>Ward {active.ward} · {activeYear}{point.partial ? "*" : ""}</text>
              <text x={10} y={42}>{formatValue(point.value)} {info.unit}</text>
            </g>}
          </g>
        </svg>
      </div>

      <div className={`pt-readout${active ? " is-active" : ""}`} id={`${id}-readout`}>
        <div className="pt-readout-value" aria-live="polite" aria-atomic="true">
          {active && point ? <><strong>Ward {active.ward}</strong><span>{activeYear}{point.partial ? "*" : ""}</span><strong>{formatValue(point.value)} <small>{info.unit}</small></strong></>
            : <><strong>All 50 wards</strong><span>Hover a line to explore. Click or tap to pin a ward.</span></>}
        </div>
        <label className="pt-year">Year
          <select value={activeYear} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((value) => <option key={value} value={value}>{value}{value === data.meta.lastYear && hasPartial ? "*" : ""}</option>)}
          </select>
        </label>
      </div>
      <p className="pt-interaction">{pinned !== null ? `Ward ${pinned} is pinned. Move across the chart or choose a year to read its values. Click another line to switch.` : "Use “Highlight a ward” to find a line, including wards with overlapping or zero values."}</p>
      <p className="pt-boundaries" id={`${id}-boundaries`}>
        <strong>{basis === "atIssue" ? "Ward numbers follow the boundaries in force at the time." : "Every year uses today’s ward boundaries."}</strong>{" "}
        {basis === "atIssue" ? "A ward can cover different areas after a remap. The 2015 and 2023 annual totals each combine two boundary periods; changes are not solely changes in building activity." : "The remap markers are historical context; permits are assigned to the same 2023 geography throughout."}
      </p>
      <div className="pt-notes">
        {hasPartial && <p>* {data.meta.lastYear} covers Jan 1–{date(data.meta.lastDate)}. {includePartial ? "Dashed lines show the incomplete year; counts are not annualized." : "The incomplete year is hidden."}</p>}
        <p>New boundaries took effect {boundaryPeriods.slice(1).map((period, index) => <span key={period.id}>{index ? " and " : ""}<a href={period.source} target="_blank" rel="noreferrer">{date(period.start)}</a></span>)}. Attribution coverage can differ between maps.</p>
      </div>
      <details className="pt-data">
        <summary>Annual data table{pinned !== null ? ` · Ward ${pinned}` : " · all wards"}</summary>
        <div className="pt-table-scroll" tabIndex={0} role="region" aria-label="Annual ward trend data, scroll horizontally for more years">
          <table>
            <caption>{info.label} · {basis === "atIssue" ? "boundaries at time of permit" : "current (2023) boundaries"}</caption>
            <thead><tr><th scope="col">Ward</th>{years.map((value) => <th key={value} scope="col">{value}{value === data.meta.lastYear && hasPartial ? "*" : ""}</th>)}</tr></thead>
            <tbody>{series.filter((s) => pinned === null || s.ward === pinned).map((s) => <tr key={s.ward}><th scope="row">{s.ward}</th>{s.points.map((p) => <td key={p.year}>{number.format(p.value)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
