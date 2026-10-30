# Ward trends verification

The chart is an extension of the Permitted Units page, using the existing
Geologica typeface, white ground, square controls, azure data marks, and coral
selection. It adds no dependencies or changes to the permit importer.

## Automated checks

`npm test` includes annual-series checks for all 50 wards, every metric, every
available year, and both boundary bases against the existing summary functions.
Fixtures cover sparse zeros, negative conversions, attribution coverage
differences, incomplete versus complete years, and unannualized counts. Other
checks cover exact fractional remap dates, zero-inclusive axes, and pointer
distance to steep, horizontal, and degenerate line segments.

Also run `npm run build`, `npm run lint`, and
`python3 -m unittest discover -s tests -p 'test_permit_periods.py'`.

## Browser verification — October 30, 2026

Tested the production build (`npm run preview`) in Browser at these CSS viewport
sizes. These are responsive viewport checks, not physical-device or cross-engine
certification.

| View | Width × height | Result |
| --- | --- | --- |
| Desktop | 1440 × 1000 | Full chart, both annotations, direct hover/click, keyboard selection |
| App viewport | 918 × 988 | Chart labels and controls fit; current boundaries and hidden partial year |
| Tablet | 768 × 1024 | All metric controls, positive and negative conversion values |
| Phone | 390 × 844 | Full boundary label, ward/year selection, readable annotation labels |
| Small phone | 320 × 740 | No document overflow; annual table scrolls within its own container |
| Landscape phone | 844 × 390 | Controls remain reachable with vertical scrolling |

No document-level horizontal overflow was detected at these sizes. No browser
console errors were captured. The production build succeeds with its existing
large-bundle advisory; lint reports the pre-existing dependency warning in
`BedroomChart.tsx`.

## Repeatable interaction checks

1. Open `/permitting`: historical boundaries, housing units, all 50 lines, and
   the partial year are shown by default, with Ward 27 pinned. Confirm both remap
   annotations and that the ward picker and readout show Ward 27.
2. Clear the default selection, then hover a line: the ward, nearest year, and value appear next to it and below
   the plot. The ward picker remains “All 50 wards.” Click the line to pin it;
   moving away preserves the selection. Click again or clear to unpin.
3. Pick Ward 27 and 2022 in historical mode. With the current snapshot, housing
   units are 3,253, single-family units 14, multifamily units 3,239,
   conversions +7, and including conversions 3,260. A data refresh can change
   these reference values; compare against the refreshed tables.
4. Pick Ward 3, conversions, and 2015: the current snapshot shows −16 units.
   Zero remains on the axis and negative values are not clipped.
5. Focus the plot. Left/right change year; up/down choose wards; Home/End choose
   the first/last year; Enter/Space pin or clear; Escape clears selection.
   Native ward and year selects offer the same data without plot interaction.
6. Switch boundary modes. The attribution explanation and data change; selection
   persists. Hovering or pinning a different ward does not rescale the metric.
7. Hide the partial year: its values, dashed segments, and table column disappear;
   the selected year stays within the visible range. Restore it and verify the
   coverage-date note and starred year.
8. Expand the annual data table. A pinned ward shows one row; clearing the ward
   reveals 50 rows. On a narrow viewport the table scrolls horizontally without
   widening the document.
9. Follow “Explore the ward map.” Its year range, boundary/count toggles, maps,
   ward table, and CSV continue to use their existing independent controls.
10. The Metric dropdown follows Ward boundaries and offers five housing metrics;
    permit counts are not an option. Switch metrics, wards, boundary basis, and
    partial-year visibility: the heading above the plot updates to preserve that
    context in screenshots, including when no ward is selected.
