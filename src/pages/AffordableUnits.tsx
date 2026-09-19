import { useMemo, useState } from "react";
// the dual-handle range slider and table styling live with the permitting page
import "../styles/permitting.css";
import "../styles/affordable.css";
import { AroMap } from "../components/AroMap";
import {
  aroByYear,
  aroCsv,
  aroProjects,
  ARO_BREAK_LABELS,
  ARO_RAMP,
  summariseAro,
  type AroData,
} from "../lib/aro";
import type { PermitsData } from "../lib/permits";
import aroRaw from "../data/aro.json";
import permitsRaw from "../data/permits.json";

const aro = aroRaw as unknown as AroData;
const permits = permitsRaw as unknown as PermitsData;

const FIRST = permits.meta.firstYear;
const LAST = permits.meta.lastYear;
/** The current City Council was seated in May 2023. */
const CYCLE_START = 2023;

type SortKey = "rank" | "ward" | "units" | "buildings" | "allUnits" | "share";

const pct = (v: number | null, digits = 1) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

export function AffordableUnits() {
  const [from, setFrom] = useState(FIRST);
  const [to, setTo] = useState(LAST);
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  const [hoveredWard, setHoveredWard] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "units",
    desc: true,
  });

  const { rows, totalAro, totalAll } = useMemo(
    () => summariseAro(aro, permits, from, to),
    [from, to]
  );
  const years = useMemo(() => aroByYear(aro, permits), []);
  /** AMI mix is a property of the buildings, so it spans the whole record. */
  const amiTotals = useMemo(
    () =>
      aro.amiTiers.map((tier) => ({
        tier,
        units: Object.values(aro.byWard).reduce(
          (sum, w) => sum + ((w as unknown as Record<string, number>)[`ARO_${tier}`] ?? 0),
          0
        ),
      })),
    []
  );
  const maxAro = Math.max(...years.map((y) => y.aro));
  const maxShare = Math.max(...years.map((y) => y.share ?? 0));

  const sortedRows = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return a.ward - b.ward;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av === bv ? a.ward - b.ward : (av < bv ? -1 : 1) * dir;
    });
  }, [rows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "ward" }
    );

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
        <span className="pm-sort-arrow">{on ? (sort.desc ? "↓" : "↑") : ""}</span>
      </button>
    );
  };

  const downloadCsv = () => {
    const blob = new Blob([aroCsv(rows, from, to)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chicago-aro-units-by-ward-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const active = selectedWard ?? hoveredWard;
  const activeRow = active != null ? rows.find((r) => r.ward === active) : null;
  const wardsWithAny = rows.filter((r) => r.units > 0).length;

  const setFromSafe = (v: number) => setFrom(Math.min(v, to));
  const setToSafe = (v: number) => setTo(Math.max(v, from));
  const span = LAST - FIRST;
  const lo = ((from - FIRST) / span) * 100;
  const hi = ((to - FIRST) / span) * 100;
  const isFull = from === FIRST && to === LAST;

  return (
    <div className="permitting affordable">
      <header className="pm-header">
        <p className="eyebrow">What the market is required to build</p>
        <h1 className="page-title">Affordable Units</h1>
        <p className="page-lede">
          Affordable units built under the Affordable Requirements Ordinance, which obliges
          larger residential developments to set aside a share of their homes at restricted
          rents.
        </p>
      </header>

      <section className="pm-controls">
        <div className="pm-range">
          <div className="pm-range-head">
            <span className="eyebrow">Years</span>
            <strong className="pm-range-val">
              {from}–{to}
              {to === LAST && <span className="pm-partial"> (through {permits.meta.lastDate})</span>}
            </strong>
            {!isFull && (
              <button
                className="pm-link"
                onClick={() => {
                  setFrom(FIRST);
                  setTo(LAST);
                }}
              >
                Reset to all years
              </button>
            )}
            {isFull && (
              <button
                className="pm-link"
                onClick={() => {
                  setFrom(CYCLE_START);
                  setTo(LAST);
                }}
              >
                Current Council only
              </button>
            )}
          </div>

          <div className="pm-slider" style={{ ["--lo" as string]: `${lo}%`, ["--hi" as string]: `${hi}%` }}>
            <div className="pm-slider-track" />
            <div className="pm-slider-fill" />
            <input
              type="range" min={FIRST} max={LAST} value={from}
              aria-label="First year"
              onChange={(e) => setFromSafe(Number(e.target.value))}
            />
            <input
              type="range" min={FIRST} max={LAST} value={to}
              aria-label="Last year"
              onChange={(e) => setToSafe(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="pm-summary">
          <div className="pm-stat">
            <span className="pm-stat-value">{totalAro.toLocaleString()}</span>
            <span className="pm-stat-label">ARO units</span>
          </div>
          <div className="pm-stat">
            <span className="pm-stat-value">{pct(totalAll > 0 ? totalAro / totalAll : null)}</span>
            <span className="pm-stat-label">of all new units</span>
          </div>
          <div className="pm-stat">
            <span className="pm-stat-value">{wardsWithAny}</span>
            <span className="pm-stat-label">wards of 50</span>
          </div>
          <button className="pm-export" onClick={downloadCsv}>
            Download CSV
          </button>
        </div>
        <p className="af-caveat">
          A further {(aro.meta.units - aro.meta.datedUnits).toLocaleString()} ARO units in{" "}
          {aro.meta.undatedBuildings} buildings could not be dated to a construction permit and
          are excluded from every figure here. They are mostly rehabs and loft conversions, which
          never had a new-construction permit to match against.
        </p>
      </section>

      {/* Two measures on different scales get two charts, never two y-axes. */}
      <section className="af-charts">
        <figure className="af-chart">
          <figcaption>
            <h2>ARO units by year</h2>
            <p>
              Covers the {aro.meta.datedUnits.toLocaleString()} units whose building could be
              dated from a permit. Hover a bar for the count.
            </p>
          </figcaption>
          <div className="af-bars" role="img" aria-label="ARO units permitted per year">
            {years.map((y) => (
              <div key={y.year} className="af-bar-slot">
                <div
                  className={`af-bar${y.year >= from && y.year <= to ? " in" : ""}`}
                  style={{ height: `${Math.max(2, (y.aro / maxAro) * 100)}%` }}
                >
                  <title>{`${y.year}: ${y.aro.toLocaleString()} ARO units`}</title>
                </div>
              </div>
            ))}
          </div>
          <div className="af-axis">
            <span>{FIRST}</span>
            <span className="af-axis-note">peak {maxAro} units</span>
            <span>{LAST}*</span>
          </div>
        </figure>

        <figure className="af-chart">
          <figcaption>
            <h2>ARO units as a share of all new units</h2>
            <p>
              Against every new housing unit permitted citywide that year.
            </p>
          </figcaption>
          <div className="af-bars" role="img" aria-label="ARO share of all new units per year">
            {years.map((y) => (
              <div key={y.year} className="af-bar-slot">
                <div
                  className={`af-bar share${y.year >= from && y.year <= to ? " in" : ""}`}
                  style={{ height: `${Math.max(2, ((y.share ?? 0) / maxShare) * 100)}%` }}
                >
                  <title>
                    {`${y.year}: ${pct(y.share)} (${y.aro.toLocaleString()} of ${y.all.toLocaleString()})`}
                  </title>
                </div>
              </div>
            ))}
          </div>
          <div className="af-axis">
            <span>{FIRST}</span>
            <span className="af-axis-note">peak {pct(maxShare)}</span>
            <span>{LAST}*</span>
          </div>
        </figure>
      </section>
      <p className="pm-footnote af-footnote">
        * Note that {LAST} data is only through {permits.meta.lastDate}.
      </p>

      <section className="pm-body">
        <div className="pm-map">
          <AroMap
            rows={rows}
            selectedWard={selectedWard}
            hoveredWard={hoveredWard}
            onSelectWard={setSelectedWard}
            onHoverWard={setHoveredWard}
          />
          <div className="pm-overlay">
            <div className="pm-legend">
              <span className="pm-legend-title">ARO units, {from}–{to}</span>
              <div className="pm-legend-steps">
                {ARO_RAMP.map((c, i) => (
                  <div key={c} className="pm-legend-step">
                    <span className="pm-chip" style={{ background: c }} />
                    <span className="pm-chip-label">{ARO_BREAK_LABELS[i]}</span>
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
                    <span className="pm-card-label">ARO units</span>
                    <span className="pm-card-value">{activeRow.units.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="pm-card-label">All new units</span>
                    <span className="pm-card-value">{activeRow.allUnits.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="pm-card-label">ARO share</span>
                    <span className="pm-card-value">{pct(activeRow.share)}</span>
                  </div>
                </div>
                {(() => {
                  const projects = aroProjects(aro, activeRow.ward);
                  return (
                    <div className="pm-projects">
                      <span className="pm-card-label">Largest ARO buildings (all years)</span>
                      {projects.length === 0 ? (
                        <p className="pm-projects-none">No ARO buildings in this ward.</p>
                      ) : (
                        <ul>
                          {projects.map((p) => (
                            <li key={p.a + p.n}>
                              <span className="pm-proj-units">{p.u}</span>
                              <span className="pm-proj-addr">{p.n !== "—" ? p.n : p.a}</span>
                              <span className="pm-proj-date">{p.y ?? "—"}</span>
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
                <th className="num">{sortHead("units", "ARO")}</th>
                <th className="num" title="Buildings containing ARO units, all years">
                  {sortHead("buildings", "Bldgs")}
                </th>
                <th className="num" title="All new housing units permitted in the ward">
                  {sortHead("allUnits", "All new")}
                </th>
                <th className="num" title="ARO units as a share of all new units">
                  {sortHead("share", "ARO %")}
                </th>
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
                  <td className="num muted">{r.buildings || "—"}</td>
                  <td className="num muted">{r.allUnits.toLocaleString()}</td>
                  <td className="num">{r.share == null || r.units === 0 ? "—" : pct(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="af-ami">
        <h2 className="af-ami-title">How deep the affordability goes</h2>
        <p className="af-ami-lede">
          Every ARO unit on record, by the income limit it is restricted to. A lower percentage
          means a unit reachable by a lower-income household.
        </p>
        <div className="af-ami-rows">
          {amiTotals.map(({ tier, units }) => (
            <div key={tier} className="af-ami-row">
              <span className="af-ami-label">{tier}% AMI</span>
              <div className="af-ami-track">
                <div
                  className="af-ami-fill"
                  style={{ width: `${(units / aro.meta.units) * 100}%` }}
                />
              </div>
              <span className="af-ami-value">
                {units.toLocaleString()}
                <span className="af-ami-pct">{pct(units / aro.meta.units, 0)}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <p className="pm-method">
        Rental units created under the Affordable Requirements Ordinance, which requires
        developments of ten or more units that need a zoning change, city land or city money to
        set aside a share of their homes at restricted rents. Figures come from the Department of
        Housing&rsquo;s{" "}
        <a href={aro.meta.sourceUrl} target="_blank" rel="noreferrer">
          ARO rental buildings map
        </a>
        , a snapshot dated {aro.meta.vintage} covering {aro.meta.buildings} buildings and{" "}
        {aro.meta.units.toLocaleString()} units. That source carries no date on any record, so
        each building is dated from its building permit, matched by address &mdash; exactly for{" "}
        {aro.meta.matchMethods.exact} buildings, and within {aro.meta.addrTolerance} house numbers
        on the same street for {aro.meta.matchMethods.address} more, which catches corner lots and
        projects permitted under one of several addresses. Matching on proximity was tried and
        abandoned: checked by hand, about half its matches were wrong. Every candidate must also
        plausibly be a residential building large enough to hold the ARO units, because otherwise
        the permit nearest a site is often a tower crane, a hoist or a temporary event tent.
        Conversions are included: many ARO buildings are adaptive reuse rather than new
        construction, so renovation permits stating a unit count are searched too &mdash; of the
        units dated here, {aro.meta.unitsNewBuild.toLocaleString()} are in newly built
        structures and {aro.meta.unitsConversion.toLocaleString()} in converted ones. Dating
        succeeds for {Math.round(aro.meta.datedShare * 100)}% of units; because every figure on
        this page is filtered by year, the {aro.meta.undatedBuildings} buildings that remain
        undated are excluded throughout, so totals here run below the{" "}
        {aro.meta.units.toLocaleString()} units in the full source. Wards are recomputed on
        current (2023) boundaries, as on the Permitting Map. Two important exclusions: this covers rental
        ARO units only, not for-sale units, and it does not capture units that developers chose
        not to build by paying the ordinance&rsquo;s in-lieu fee instead — a substantial share of
        how the ARO operates in practice.
      </p>
    </div>
  );
}
