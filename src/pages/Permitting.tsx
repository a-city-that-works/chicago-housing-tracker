import { useEffect, useMemo, useState } from "react";
import "../styles/permitting.css";
import { PermitView } from "../components/PermitView";
import { PermitTrends } from "../components/PermitTrends";
import type { PermitViewport } from "../components/PermitMap";
import boundaryPeriods from "../data/wardBoundaryPeriods.json";
import chicagoAttribution from "../data/chicagoDataAttribution.json";
import {
  COUNT_MODE_LABELS,
  summarise,
  summarisePeriods,
  periodsToCsv,
  previousDay,
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
const PERMITS_DATASET_URL =
  "https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu";

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function Permitting() {
  const [from, setFrom] = useState(CYCLE_START);
  const [to, setTo] = useState(LAST);
  const [viewport, setViewport] = useState<PermitViewport | null>(null);
  const [basis, setBasis] = useState<WardBasis>("current");
  const [mode, setMode] = useState<CountMode>("new");
  const summary = useMemo(
    () => summarise(data, from, to, basis, mode),
    [from, to, basis, mode],
  );
  const atIssue = basis === "atIssue";
  const periods = useMemo(
    () =>
      atIssue ? summarisePeriods(data, boundaryPeriods, from, to, mode) : [],
    [atIssue, from, to, mode],
  );
  useEffect(() => {
    setViewport(null);
  }, [basis, periods.length]);
  const { rows } = summary;
  const years = atIssue
    ? periods.reduce((sum, p) => sum + p.years, 0)
    : summary.years;
  const total = atIssue
    ? periods.reduce((sum, p) => sum + p.total, 0)
    : summary.total;
  const withConv = mode === "withConversions";
  const trend = useMemo(
    () => yearlyTotals(data, withConv ? "withConversions" : "new"),
    [withConv],
  );
  const maxTrend = Math.max(...trend.map((t) => t.units));

  const downloadCsv = () => {
    const blob = new Blob(
      [
        atIssue
          ? periodsToCsv(periods, mode)
          : toCsv(rows, from, to, basis, mode),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chicago-permits-by-ward-${from}-${to}${atIssue ? "-wards-at-issue" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <h1 className="page-title">Permitted Units</h1>
        <p className="page-lede">New housing units approved by ward.</p>
      </header>

      <PermitTrends data={data} />

      <h2 className="pm-map-heading" id="permit-map">Explore the ward map</h2>
      <section className="pm-controls" aria-label="Ward map controls">
        <div className="pm-range">
          <div className="pm-range-head">
            <span className="eyebrow">Years</span>
            <strong className="pm-range-val">
              {from}–{to}
              {to === LAST && (
                <span className="pm-partial">
                  {" "}
                  (through {data.meta.lastDate})
                </span>
              )}
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
          <div
            className="pm-slider"
            style={{
              ["--lo" as string]: `${lo}%`,
              ["--hi" as string]: `${hi}%`,
            }}
          >
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
          <div
            className="pm-trend"
            role="group"
            aria-label="Select a single year"
          >
            {trend.map((t) => {
              const inRange = t.year >= from && t.year <= to;
              const partial = t.year === LAST;
              return (
                <button
                  key={t.year}
                  className={`pm-bar${inRange ? " in" : ""}${partial ? " partial" : ""}`}
                  style={{
                    height: `${Math.max(3, (t.units / maxTrend) * 100)}%`,
                  }}
                  aria-label={`Show ${t.year}`}
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
            <span className="pm-trend-note">
              citywide units per year — click a bar for one year
            </span>
            <span>{LAST}*</span>
          </div>
          <p className="pm-footnote">
            * Note that {LAST} data is only through {data.meta.lastDate}.
          </p>

          <div className="pm-basis">
            <span className="eyebrow">Boundaries</span>
            <div
              className="pm-toggle"
              role="group"
              aria-label="Ward boundaries"
            >
              {(Object.keys(WARD_BASIS_LABELS) as WardBasis[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  className={basis === b ? "pm-tog on" : "pm-tog"}
                  aria-pressed={basis === b}
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
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {COUNT_MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <p className="pm-basis-hint">
              {withConv
                ? "Gross new construction plus net units created via conversion. Note this does not include full demolitions."
                : "Gross new construction only. Conversions of existing buildings are excluded."}
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
            <span className="pm-stat-value">
              {Math.round(total / years).toLocaleString()}
            </span>
            <span className="pm-stat-label">per year</span>
          </div>
          <button className="pm-export" onClick={downloadCsv}>
            Download CSV
          </button>
        </div>
      </section>

      {atIssue ? (
        <section
          className="pm-history"
          aria-label="Permits by historical ward boundaries"
        >
          <div className="pm-history-head">
            <h2 className="eyebrow">
              {periods.length === 1
                ? "One boundary period"
                : `${periods.length} boundary periods`}
            </h2>
            <p>
              Each map uses the ward boundaries and permits from its dates.
              Colors show units per year on the same scale; a ward number can
              cover different areas across maps.
            </p>
          </div>
          <div
            className={`pm-period-grid${periods.length === 1 ? " single" : ""}`}
          >
            {periods.map((p) => (
              <section
                className="pm-period"
                key={p.period.id}
                aria-label={p.period.label}
              >
                <header className="pm-period-head">
                  <h3>{p.period.label}</h3>
                  <p>
                    {formatDate(p.start)} – {formatDate(previousDay(p.end))}
                  </p>
                  <p>
                    <strong>{p.total.toLocaleString()}</strong> units ·{" "}
                    <strong>
                      {Math.round(p.total / p.years).toLocaleString()}
                    </strong>{" "}
                    per year
                  </p>
                </header>
                <PermitView
                  rows={p.rows}
                  geometry={p.period.geometry}
                  boundarySource={p.period.source}
                  label={p.period.label}
                  compact={periods.length > 1}
                  projectMinUnits={data.projectMinUnits}
                  projectsForWard={(ward) =>
                    (p.tables.projects[String(ward)] ?? [])
                      .filter((pr) => pr.d >= p.start && pr.d < p.end)
                      .slice(0, 5)
                  }
                  viewport={viewport}
                  onViewportChange={setViewport}
                />
              </section>
            ))}
          </div>
        </section>
      ) : (
        <PermitView
          key="current"
          rows={rows}
          label="Current (2023) boundaries"
          showNeighborhoods
          boundarySource={boundaryPeriods.find((p) => p.id === "2023")!.source}
          projectMinUnits={data.projectMinUnits}
          projectsForWard={(ward) =>
            wardProjects(data, ward, from, to, 5, basis)
          }
          viewport={viewport}
          onViewportChange={setViewport}
        />
      )}

      <div className="pm-method">
        <p>
          Gross new construction units per ward. This map extracts unit counts
          from the city&rsquo;s dataset on building permits. It covers permits
          typed as new construction, plus permits typed as renovations whose own
          description is of a whole new building (not an addition, dormer or
          garage on an existing one). Conversions of existing buildings
          are excluded unless toggled on. Unit counts are extracted from each
          permit&rsquo;s work description, since the source dataset has no
          unit-count field; note that these figures are not exact, as about{" "}
          {Math.round(data.meta.unclassifiedShare * 100)}% of permits could not
          be classified (and are ignored). Permits staged across several filings
          for one project are counted once. Ward boundaries were redrawn in 2015
          and 2023: the map defaults to placing every permit on today&rsquo;s map by
          its coordinates, while the &ldquo;at time of permit&rdquo; view places
          it by its coordinates on the ward map in force when it was issued. It
          splits the selected dates at May 18, 2015 and May 15, 2023, showing a
          separate map and table for each boundary period. Per-year rates in this view use the
          actual days covered, including partial years. The trend chart above
          defaults to boundaries at the time of permit and shows calendar-year
          counts, with its own metric and boundary controls.
        </p>
        <p>
          Including conversions adds units created by turning existing buildings
          into housing and subtracts units lost when a building is deconverted
          into fewer, larger homes. These land in the same single-family and
          multi-family columns as new construction, on the same rule: a building
          counts as single-family at one unit and multi-family at two or more.
          So a two-flat becoming one house removes two multi-family units and
          adds one single-family one. Only permits that state the change plainly
          are counted. Note that this does not give us a true &lsquo;net&rsquo;
          figure, as demolitions are excluded.
        </p>
        <p>
          Source:{" "}
          <a href={PERMITS_DATASET_URL} target="_blank" rel="noreferrer">
            Chicago Building Permits (ydr8-5enu)
          </a>
          , {data.meta.permitTypes.join(" and ")},{" "}
          {data.meta.permitsFetched.toLocaleString()} permits from {FIRST} to{" "}
          {data.meta.lastDate}.
        </p>
        <p>
          Ward boundaries: {chicagoAttribution.publisher} Data Portal —{" "}
          {boundaryPeriods.map((period, index) => (
            <span key={period.id}>
              {index > 0 && "; "}
              <a href={period.source} target="_blank" rel="noreferrer">
                {period.label}
              </a>
            </span>
          ))}
          . Geometry has been simplified for display. See the{" "}
          <a href={chicagoAttribution.termsUrl} target="_blank" rel="noreferrer">
            City of Chicago Data Terms of Use
          </a>
          .
        </p>
        <p>{chicagoAttribution.notice}</p>
      </div>
    </div>
  );
}
