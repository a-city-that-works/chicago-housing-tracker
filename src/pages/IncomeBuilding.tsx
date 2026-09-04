import { useMemo, useState } from "react";
// the dual-handle range slider is defined with the permitting page
import "../styles/permitting.css";
import "../styles/income.css";
import { Scatter, type ScatterPoint } from "../components/Scatter";
import { summarise, type PermitsData } from "../lib/permits";
import permitsRaw from "../data/permits.json";
import incomeRaw from "../data/wardIncome.json";

const permits = permitsRaw as unknown as PermitsData;

interface IncomeWard {
  ward: number;
  tracts: number;
  households: number;
  population: number;
  income: number;
  medianRent: number | null;
}
const income = incomeRaw as unknown as { meta: Record<string, unknown>; wards: IncomeWard[] };

const FIRST = permits.meta.firstYear;
const LAST = permits.meta.lastYear;
/** The current City Council was seated in May 2023. */
const CYCLE_START = 2023;

const usd = (v: number) => `$${Math.round(v / 1000)}k`;
const num = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

export function IncomeBuilding() {
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  const [hoveredWard, setHoveredWard] = useState<number | null>(null);
  const [from, setFrom] = useState(CYCLE_START);
  const [to, setTo] = useState(LAST);
  const [mfhOnly, setMfhOnly] = useState(false);

  const { rows, years } = useMemo(() => summarise(permits, from, to), [from, to]);
  const unitsByWard = useMemo(() => new Map(rows.map((r) => [r.ward, r])), [rows]);

  const data = useMemo(
    () =>
      income.wards.map((w) => {
        const p = unitsByWard.get(w.ward);
        const units = mfhOnly ? (p?.mfh ?? 0) : (p?.units ?? 0);
        return {
          ward: w.ward,
          income: w.income,
          households: w.households,
          units,
          perYear: units / years,
          per1k: (units / w.households) * 1000,
        };
      }),
    [unitsByWard, years, mfhOnly]
  );

  const setFromSafe = (v: number) => setFrom(Math.min(v, to));
  const setToSafe = (v: number) => setTo(Math.max(v, from));
  const span = LAST - FIRST;
  const lo = ((from - FIRST) / span) * 100;
  const hi = ((to - FIRST) / span) * 100;
  const isCycle = from === CYCLE_START && to === LAST;

  const rawPoints: ScatterPoint[] = data.map((d) => ({ ward: d.ward, x: d.income, y: d.perYear }));

  /**
   * Which wards are worth naming: the ones that sit furthest from the overall
   * relationship — wards building far more or far less than their income would
   * suggest — plus the extremes of each axis to anchor the corners. Labelling
   * by what fits first just names whichever dots happen to be isolated.
   */
  const label = (pts: ScatterPoint[]) => {
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    const slope = den ? pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den : 0;
    const intercept = my - slope * mx;
    const byResidual = [...pts]
      .sort((a, b) => Math.abs(b.y - (intercept + slope * b.x)) - Math.abs(a.y - (intercept + slope * a.x)))
      .map((p) => p.ward);
    const anchors = [
      ...[...pts].sort((a, b) => b.x - a.x).slice(0, 1),
      ...[...pts].sort((a, b) => a.x - b.x).slice(0, 1),
      ...[...pts].sort((a, b) => b.y - a.y).slice(0, 1),
    ].map((p) => p.ward);
    return [...new Set([...anchors, ...byResidual])];
  };

  const active = selectedWard ?? hoveredWard;
  const activeRow = active != null ? data.find((d) => d.ward === active) : null;

  return (
    <div className="income">
      <header className="in-header">
        <p className="eyebrow">Who builds</p>
        <h1 className="page-title">Income and housing production</h1>
        <p className="page-lede">
          Plotting wards&rsquo; housing permits against their average household incomes.
        </p>
      </header>

      <section className="in-controls">
        <div className="in-range-head">
          <span className="eyebrow">Permit years</span>
          <strong className="in-range-val">
            {from}&ndash;{to}
            {to === LAST && <span className="in-partial"> (through {permits.meta.lastDate})</span>}
          </strong>
          {!isCycle && (
            <button
              className="in-link"
              onClick={() => {
                setFrom(CYCLE_START);
                setTo(LAST);
              }}
            >
              Reset to current Council
            </button>
          )}
        </div>
        <div
          className="pm-slider"
          style={{ ["--lo" as string]: `${lo}%`, ["--hi" as string]: `${hi}%` }}
        >
          <div className="pm-slider-track" />
          <div className="pm-slider-fill" />
          <input type="range" min={FIRST} max={LAST} value={from} aria-label="First permit year"
            onChange={(e) => setFromSafe(Number(e.target.value))} />
          <input type="range" min={FIRST} max={LAST} value={to} aria-label="Last permit year"
            onChange={(e) => setToSafe(Number(e.target.value))} />
        </div>
        <div className="in-toggle-row">
          <div className="in-toggle">
            <button
              className={mfhOnly ? "in-tog" : "in-tog on"}
              onClick={() => setMfhOnly(false)}
            >
              All units
            </button>
            <button
              className={mfhOnly ? "in-tog on" : "in-tog"}
              onClick={() => setMfhOnly(true)}
              title="Units in buildings of two or more homes"
            >
              Multi-family only
            </button>
          </div>
          <p className="in-hint">
            Income is the latest available (ACS 2024) and does not change with these controls.
          </p>
        </div>
      </section>

      <section className="in-charts">
        <figure className="in-chart">
          <figcaption>
            <h2>Units permitted per year, by ward income</h2>
            <p>
              {mfhOnly
                ? "Units in buildings of two or more homes, per year, "
                : "New housing units approved per year, "}
              {from}&ndash;{to}. Where one ward runs far ahead of the rest it is pinned above the
              axis, labelled with its real figure, so the others stay readable. Hover any point for
              its numbers.
            </p>
          </figcaption>
          <Scatter
            points={rawPoints}
            xLabel="Median household income"
            yLabel={mfhOnly ? "Multi-family units per year" : "Units permitted per year"}
            fmtX={usd}
            fmtY={num}
            labelled={label(rawPoints)}
            selectedWard={selectedWard}
            hoveredWard={hoveredWard}
            onSelectWard={setSelectedWard}
            onHoverWard={setHoveredWard}
          />
        </figure>

      </section>

      {activeRow && (
        <div className="in-readout">
          <strong>Ward {activeRow.ward}</strong>
          <span>
            median household income{" "}
            <strong>${activeRow.income.toLocaleString()}</strong>
          </span>
          <span>
            <strong>{activeRow.units.toLocaleString()}</strong>{" "}
            {mfhOnly ? "multi-family units" : "units"}, {from}&ndash;{to}
          </span>
          <span>
            <strong>{activeRow.perYear.toFixed(0)}</strong> per year
          </span>
          <span>
            <strong>{activeRow.per1k.toFixed(1)}</strong> per 1,000 households
          </span>
        </div>
      )}

      <p className="in-method">
        Income is median household income from the 2024 American Community Survey five-year
        estimates, measured at census tract level and aggregated to wards by tract centroid,
        weighted by occupied housing units. Permits are new-construction housing units for the
        selected years; see the <a href="/permitting">Permitting Map</a> for how those are counted.
      </p>
    </div>
  );
}
