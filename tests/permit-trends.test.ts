import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { annualWardSeries, fractionalYear, segmentDistance, trendTicks, TREND_METRICS, type TrendMetric } from "../src/lib/permitTrends.ts";
import { summarise, type PermitsData } from "../src/lib/permits.ts";

const data = JSON.parse(readFileSync(new URL("../src/data/permits.json", import.meta.url), "utf8")) as PermitsData;

test("all 50 annual series reconcile to existing ward totals in both boundary bases", () => {
  for (const basis of ["current", "atIssue"] as const) {
    for (const metric of Object.keys(TREND_METRICS) as TrendMetric[]) {
      const series = annualWardSeries(data, metric, basis);
      assert.deepEqual(series.map((s) => s.ward), Array.from({ length: 50 }, (_, i) => i + 1));
      for (let year = data.meta.firstYear; year <= data.meta.lastYear; year++) {
        const rows = summarise(data, year, year, basis, "withConversions").rows;
        for (const s of series) {
          const row = rows.find((r) => r.ward === s.ward)!;
          const expected = metric === "combined" ? row.units : metric === "conversions" ? row.convSfh + row.convMfh
            : metric === "units" ? row.newUnits : metric === "sfh" ? row.sfh - row.convSfh
            : row.mfh - row.convMfh;
          assert.equal(s.points.find((p) => p.year === year)!.value, expected, `${basis} ${metric} ward ${s.ward} ${year}`);
        }
      }
    }
  }
});

test("sparse data stays zero, losses stay negative, and partial counts are not annualized", () => {
  const fixture = { ...data, meta: { ...data.meta, firstYear: 2025, lastYear: 2026, lastDate: "2026-06-30" },
    units: { "1": { "2026": 6 } }, conversions: { ...data.conversions, sfh: { "1": { "2026": 1 } }, mfh: { "1": { "2026": -2 } } } };
  assert.deepEqual(annualWardSeries(fixture, "units", "current")[0].points,
    [{ year: 2025, value: 0, partial: false }, { year: 2026, value: 6, partial: true }]);
  assert.equal(annualWardSeries(fixture, "conversions", "current")[0].points[1].value, -1);
  assert.equal(annualWardSeries(fixture, "combined", "current")[0].points[1].value, 5);
  fixture.meta.lastDate = "2026-12-31";
  assert.equal(annualWardSeries(fixture, "units", "current")[0].points[1].partial, false);
});

test("historical series use the historical tables, including attribution coverage differences", () => {
  for (const metric of Object.keys(TREND_METRICS) as TrendMetric[]) {
    const current = annualWardSeries(data, metric, "current");
    const historical = annualWardSeries(data, metric, "atIssue");
    assert.notDeepEqual(current, historical);
  }
  // Some permits can be placed under only one map; do not force totals to agree.
  const fixture = { ...data, units: { "1": { "2012": 3 } }, atIssue: { ...data.atIssue, units: { "1": { "2012": 6 } } } };
  assert.equal(annualWardSeries(fixture, "units", "current").reduce((sum, s) => sum + s.points[2].value, 0), 3);
  assert.equal(annualWardSeries(fixture, "units", "atIssue").reduce((sum, s) => sum + s.points[2].value, 0), 6);
});

test("date annotations use exact fractional years and axes include zero and all extremes", () => {
  assert.equal(fractionalYear("2023-05-15"), 2023 + 134 / 365);
  assert.equal(fractionalYear("2015-05-18"), 2015 + 137 / 365);
  assert.equal(fractionalYear("2024-07-02"), 2024.5);
  for (const values of [[0], [0, 1], [-3, 0, 7], [-500, -1], [100, 3001]]) {
    const ticks = trendTicks(values);
    assert.ok(ticks.includes(0));
    assert.ok(ticks[0] <= Math.min(...values));
    assert.ok(ticks.at(-1)! >= Math.max(...values));
    assert.ok(ticks.at(-1)! > ticks[0]);
  }
});

test("line hit testing handles steep, horizontal and zero-length segments", () => {
  assert.equal(segmentDistance(5, 3, 0, 0, 10, 0), 3);
  assert.equal(segmentDistance(3, 5, 0, 0, 0, 10), 3);
  assert.equal(segmentDistance(3, 4, 0, 0, 0, 0), 5);
  assert.equal(segmentDistance(13, 4, 0, 0, 10, 0), 5);
});
