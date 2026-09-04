import { useMemo, useState } from "react";
import "../styles/permitting.css";
import { PermitMap } from "../components/PermitMap";
import {
  PERMIT_BREAK_LABELS,
  PERMIT_RAMP,
  summarise,
  toCsv,
  wardProjects,
  yearlyTotals,
  type PermitsData,
} from "../lib/permits";
import raw from "../data/permits.json";

const data = raw as unknown as PermitsData;
const FIRST = data.meta.firstYear;
const LAST = data.meta.lastYear;
/** The current City Council was seated in May 2023. */
const CYCLE_START = 2023;
const PERMITS_DATASET_URL = "https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu";

/** Columns the table can be sorted on. */
type SortKey = "rank" | "ward" | "units" | "sfh" | "mfh" | "mfhShare" | "perYear";

export function Permitting() {
  const [from, setFrom] = useState(CYCLE_START);
  const [to, setTo] = useState(LAST);
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  const [hoveredWard, setHoveredWard] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "units",
    desc: true,
  });

  const { rows, years, total } = useMemo(() => summarise(data, from, to), [from, to]);
  const trend = useMemo(() => yearlyTotals(data), []);
  const maxTrend = Math.max(...trend.map((t) => t.units));

  const sortedRows = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      // wards that built nothing have no MFH share; keep them last either way
      if (av == null && bv == null) return a.ward - b.ward;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av === bv ? a.ward - b.ward : (av < bv ? -1 : 1) * dir;
    });
  }, [rows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, desc: !s.desc }
        // numbers read high-to-low first; ward number reads 1-50 first
        : { key, desc: key !== "ward" }
    );

  const downloadCsv = () => {
    const blob = new Blob([toCsv(rows, from, to)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chicago-permits-by-ward-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortHead = (key: SortKey, label: string) => {
    const on = sort.key === key;
    return (
      <button
        type="button"
        className={on ? "pm-sort on" : "pm-sort"}
        onClick={() => toggleSort(key)}
        aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"}
      >
        {label}
        <span className="pm-sort-arrow">{on ? (sort.desc ? "\u2193" : "\u2191") : ""}</span>
      </button>
    );
  };

  const active = selectedWard ?? hoveredWard;
  const activeRow = active != null ? rows.find((r) => r.ward === active) : null;
  const isCycle = from === CYCLE_START && to === LAST;

  // keep the two handles from crossing
  const setFromSafe = (v: number) => setFrom(Math.min(v, to));
  const setToSafe = (v: number) => setTo(Math.max(v, from));

  const span = LAST - FIRST;
  const lo = ((from - FIRST) / span) * 100;
  const hi = ((to - FIRST) / span) * 100;

  return (
    <div className="permitting">
      <header className="pm-header">
        <p className="eyebrow">What gets built</p>
        <h1 className="page-title">Permitting Map</h1>
        <p className="page-lede">
          New housing units approved by ward.
        </p>
      </header>

      <section className="pm-controls">
        <div className="pm-range">
          <div className="pm-range-head">
            <span className="eyebrow">Years</span>
            <strong className="pm-range-val">
              {from}–{to}
              {to === LAST && <span className="pm-partial"> (through {data.meta.lastDate})</span>}
            </strong>
            {!isCycle && (
              <button
                className="pm-link"
                onClick={() => {
                  setFrom(CYCLE_START);
                  setTo(LAST);
                }}
              >
                Reset to current Council
              </button>
            )}
          </div>

          {/* One track, two thumbs. Both are real range inputs so the control
              stays keyboard-accessible; the track itself is a styled div. */}
          <div className="pm-slider" style={{ ["--lo" as string]: `${lo}%`, ["--hi" as string]: `${hi}%` }}>
            <div className="pm-slider-track" />
            <div className="pm-slider-fill" />
            <input
              type="range"
              min={FIRST}
              max={LAST}
              value={from}
              aria-label="First year"
              onChange={(e) => setFromSafe(Number(e.target.value))}
            />
            <input
              type="range"
              min={FIRST}
              max={LAST}
              value={to}
              aria-label="Last year"
              onChange={(e) => setToSafe(Number(e.target.value))}
            />
          </div>

          {/* citywide trend; selected span highlighted */}
          <div className="pm-trend" aria-hidden="true">
            {trend.map((t) => {
              const inRange = t.year >= from && t.year <= to;
              const partial = t.year === LAST;
              return (
                <button
                  key={t.year}
                  className={`pm-bar${inRange ? " in" : ""}${partial ? " partial" : ""}`}
                  style={{ height: `${Math.max(3, (t.units / maxTrend) * 100)}%` }}
                  title={
                    partial
                      ? `${t.year}: ${t.units.toLocaleString()} units so far (through ${data.meta.lastDate})`
                      : `${t.year}: ${t.units.toLocaleString()} units`
                  }
                  onClick={() => {
                    setFrom(t.year);
                    setTo(t.year);
                  }}
                />
              );
            })}
          </div>
          <div className="pm-trend-axis">
            <span>{FIRST}</span>
            <span className="pm-trend-note">citywide units per year — click a bar for one year</span>
            <span>{LAST}*</span>
          </div>
          <p className="pm-footnote">
            * Note that {LAST} data is only through {data.meta.lastDate}.
          </p>
        </div>

        <div className="pm-summary">
          <div className="pm-stat">
            <span className="pm-stat-value">{total.toLocaleString()}</span>
            <span className="pm-stat-label">units permitted</span>
          </div>
          <div className="pm-stat">
            <span className="pm-stat-value">{Math.round(total / years).toLocaleString()}</span>
            <span className="pm-stat-label">per year</span>
          </div>
          <button className="pm-export" onClick={downloadCsv}>
            Download CSV
          </button>
        </div>
      </section>

      <section className="pm-body">
        <div className="pm-map">
          <PermitMap
            rows={rows}
            selectedWard={selectedWard}
            hoveredWard={hoveredWard}
            onSelectWard={setSelectedWard}
            onHoverWard={setHoveredWard}
          />
          <div className="pm-overlay">
            <div className="pm-legend">
              <span className="pm-legend-title">Units permitted per year</span>
              <div className="pm-legend-steps">
                {PERMIT_RAMP.map((c, i) => (
                  <div key={c} className="pm-legend-step">
                    <span className="pm-chip" style={{ background: c }} />
                    <span className="pm-chip-label">{PERMIT_BREAK_LABELS[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            {activeRow && (
              <div className="pm-card">
                <div className="pm-card-head">
                  <strong>Ward {activeRow.ward}</strong>
                  <span className="pm-card-rank">#{activeRow.rank} of 50</span>
                </div>
                <div className="pm-card-grid">
                  <div>
                    <span className="pm-card-label">Units</span>
                    <span className="pm-card-value">{activeRow.units.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="pm-card-label">Per year</span>
                    <span className="pm-card-value">{activeRow.perYear.toFixed(0)}</span>
                  </div>
                  <div>
                    <span className="pm-card-label">SFH / MFH</span>
                    <span className="pm-card-value">
                      {activeRow.sfh.toLocaleString()} / {activeRow.mfh.toLocaleString()}
                    </span>
                  </div>
                </div>
                {(() => {
                  const projects = wardProjects(data, activeRow.ward, from, to);
                  return (
                    <div className="pm-projects">
                      <span className="pm-card-label">
                        Largest projects ({data.projectMinUnits}+ units)
                      </span>
                      {projects.length === 0 ? (
                        <p className="pm-projects-none">
                          No projects of {data.projectMinUnits} or more units in this period.
                        </p>
                      ) : (
                        <ul>
                          {projects.map((pr) => (
                            <li key={pr.p + pr.d}>
                              <span className="pm-proj-units">{pr.u}</span>
                              <span className="pm-proj-addr">{pr.a}</span>
                              <span className="pm-proj-date">{pr.d.slice(0, 7)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th className="num">{sortHead("rank", "#")}</th>
                <th className="num">{sortHead("ward", "Ward")}</th>
                <th className="num">{sortHead("units", "Units")}</th>
                <th className="num" title="Units in single-family (1-unit) buildings">
                  {sortHead("sfh", "SFH")}
                </th>
                <th className="num" title="Units in multi-family (2+ unit) buildings">
                  {sortHead("mfh", "MFH")}
                </th>
                <th className="num" title="Share of units in multi-family buildings">
                  {sortHead("mfhShare", "MFH %")}
                </th>
                <th className="num">{sortHead("perYear", "Per year")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr
                  key={r.ward}
                  className={
                    r.ward === selectedWard
                      ? "pm-row sel"
                      : r.ward === hoveredWard
                        ? "pm-row hov"
                        : "pm-row"
                  }
                  onMouseEnter={() => setHoveredWard(r.ward)}
                  onMouseLeave={() => setHoveredWard(null)}
                  onClick={() => setSelectedWard(selectedWard === r.ward ? null : r.ward)}
                >
                  <td className="num muted">{r.rank}</td>
                  <td className="num">{r.ward}</td>
                  <td className="num strong">{r.units.toLocaleString()}</td>
                  <td className="num muted">{r.sfh.toLocaleString()}</td>
                  <td className="num">{r.mfh.toLocaleString()}</td>
                  <td className="num muted">
                    {r.mfhShare == null ? "—" : `${(r.mfhShare * 100).toFixed(0)}%`}
                  </td>
                  <td className="num">{r.perYear.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="pm-method">
        Gross new construction units per ward. This map extracts unit counts from the city&rsquo;s
        dataset on building permits, limited to permits for new construction. Unit counts are
        extracted from each permit&rsquo;s work description, since the source dataset has no
        unit-count field; note that these figures are not exact, as about{" "}
        {Math.round(data.meta.unclassifiedShare * 100)}% of permits could not be classified (and are
        ignored). Permits staged across several filings for one project are counted once. As ward
        boundaries were last redrawn in 2023, all permits are assigned to their current wards by
        coordinates. Source:{" "}
        <a href={PERMITS_DATASET_URL} target="_blank" rel="noreferrer">
          Chicago Building Permits (ydr8-5enu)
        </a>
        , PERMIT - NEW CONSTRUCTION,{" "}
        {data.meta.permits.toLocaleString()} permits from {FIRST} to {data.meta.lastDate}.
      </p>
    </div>
  );
}
