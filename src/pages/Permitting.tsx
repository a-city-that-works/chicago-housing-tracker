import { useMemo, useState } from "react";
import "../styles/permitting.css";
import { PermitMap } from "../components/PermitMap";
import {
  PERMIT_BREAK_LABELS,
  PERMIT_RAMP,
  COUNT_MODE_LABELS,
  summarise,
  toCsv,
  wardProjects,
  WARD_BASIS_LABELS,
  yearlyTotals,
  type CountMode,
  type PermitsData,
  type WardBasis,
} from "../lib/permits";
import raw from "../data/permits.json";

const data = raw as unknown as PermitsData;
const FIRST = data.meta.firstYear;
const LAST = data.meta.lastYear;
/** The current City Council was seated in May 2023. */
const CYCLE_START = 2023;
const PERMITS_DATASET_URL = "https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu";

/** Columns the table can be sorted on. */
type SortKey =
  | "rank" | "ward" | "units" | "sfh" | "mfh" | "mfhShare" | "perYear"
  | "convGained" | "convLost";

export function Permitting() {
  const [from, setFrom] = useState(CYCLE_START);
  const [to, setTo] = useState(LAST);
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  const [hoveredWard, setHoveredWard] = useState<number | null>(null);
  const [basis, setBasis] = useState<WardBasis>("current");
  const [mode, setMode] = useState<CountMode>("new");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "units",
    desc: true,
  });

  const { rows, years, total } = useMemo(
    () => summarise(data, from, to, basis, mode),
    [from, to, basis, mode]
  );
  const atIssue = basis === "atIssue";
  // Conversions are only tabulated on current boundaries.
  const withConv = mode === "withConversions" && !atIssue;
  const trend = useMemo(() => yearlyTotals(data, withConv ? "withConversions" : "new"), [withConv]);
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
    const blob = new Blob([toCsv(rows, from, to, basis, mode)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chicago-permits-by-ward-${from}-${to}${atIssue ? "-wards-at-issue" : ""}.csv`;
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

          <div className="pm-basis">
            <span className="eyebrow">Boundaries</span>
            <div className="pm-toggle" role="group" aria-label="Ward boundaries">
              {(Object.keys(WARD_BASIS_LABELS) as WardBasis[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  className={basis === b ? "pm-tog on" : "pm-tog"}
                  onClick={() => setBasis(b)}
                >
                  {WARD_BASIS_LABELS[b]}
                </button>
              ))}
            </div>
          </div>

          <div className="pm-basis">
            <span className="eyebrow">Count</span>
            <div className="pm-toggle" role="group" aria-label="What to count">
              {(Object.keys(COUNT_MODE_LABELS) as CountMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={mode === m ? "pm-tog on" : "pm-tog"}
                  disabled={atIssue && m === "withConversions"}
                  onClick={() => setMode(m)}
                >
                  {COUNT_MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <p className="pm-basis-hint">
              {withConv
                ? "Gross new construction, plus units created by converting existing buildings, less units lost to deconversion. Demolitions are not counted, so this is not a net figure."
                : "Gross new construction only. Conversions of existing buildings are excluded."}
              {atIssue
                ? " Wards are as drawn when each permit was issued, so conversions are unavailable in this view."
                : ""}
            </p>
          </div>
        </div>

        <div className="pm-summary">
          <div className="pm-stat">
            <span className="pm-stat-value">{total.toLocaleString()}</span>
            <span className="pm-stat-label">
              {withConv ? "units permitted + converted" : "units permitted"}
            </span>
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
            unshaded={atIssue}
            selectedWard={selectedWard}
            hoveredWard={hoveredWard}
            onSelectWard={setSelectedWard}
            onHoverWard={setHoveredWard}
          />
          <div className="pm-overlay">
            {atIssue ? (
              <div className="pm-legend pm-map-note">
                <span className="pm-legend-title">Map unshaded in this view</span>
                <p>
                  These ward numbers are as drawn when each permit was issued. Boundaries moved
                  in 2015 and 2023, so they don&rsquo;t line up with the outlines here. The table
                  carries the figures; the map is for orientation only.
                </p>
              </div>
            ) : (
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
            )}
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
                  const projects = wardProjects(data, activeRow.ward, from, to, 5, basis);
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
                {withConv && (
                  <>
                    <th className="num" title="Units created by converting existing buildings">
                      {sortHead("convGained", "Conv +")}
                    </th>
                    <th className="num" title="Units lost to deconversion">
                      {sortHead("convLost", "Conv \u2212")}
                    </th>
                  </>
                )}
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
                  {withConv && (
                    <>
                      <td className="num">{r.convGained ? `+${r.convGained}` : "—"}</td>
                      <td className="num muted">{r.convLost ? `\u2212${r.convLost}` : "—"}</td>
                    </>
                  )}
                  <td className="num">{r.perYear.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="pm-method">
        Gross new construction units per ward. This map extracts unit counts from the city&rsquo;s
        dataset on building permits. It covers permits typed as new construction, plus permits
        typed as renovations whose own description is of a new building &mdash; Chicago files some
        towers that way, and leaving them out understated whole years. Conversions of existing
        buildings are still excluded. Unit counts are
        extracted from each permit&rsquo;s work description, since the source dataset has no
        unit-count field; note that these figures are not exact, as about{" "}
        {Math.round(data.meta.unclassifiedShare * 100)}% of permits could not be classified (and are
        ignored). Permits staged across several filings for one project are counted once. Ward
        boundaries were redrawn in 2015 and 2023: by default every permit is placed on today&rsquo;s
        map by its coordinates, while the &ldquo;at time of permit&rdquo; view keeps the ward number
        recorded on the permit itself &mdash; the two differ on about a fifth of permits.{" "}
        <strong>Including conversions</strong> adds units created by turning existing buildings
        into housing and subtracts units lost when a building is deconverted into fewer, larger
        homes. Only permits that state the change plainly are counted, so this is a floor.{" "}
        <strong>It is not a net figure: demolitions are excluded.</strong> Around 14,000
        demolition permits since 2010 describe a residential building without saying how many
        homes it held, so the units lost that way cannot be recovered from this dataset and are
        left out entirely rather than guessed at. Source:{" "}
        <a href={PERMITS_DATASET_URL} target="_blank" rel="noreferrer">
          Chicago Building Permits (ydr8-5enu)
        </a>
        , PERMIT - NEW CONSTRUCTION,{" "}
        {data.meta.permits.toLocaleString()} permits from {FIRST} to {data.meta.lastDate}.
      </p>
    </div>
  );
}
