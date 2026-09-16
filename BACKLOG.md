# Backlog

What we intend to build next, in priority order, with enough on each item that
someone could pick it up cold. Shipped work is described in the README; this
file is only what's ahead.

## 1. Affordable units — where they're being permitted and built

**Question.** Where in the city are affordable units going, and does that track
where market-rate housing is permitted?

**The hunch needs splitting before it can be tested.** "Affordable" covers two
things with opposite geography:

- *ARO on-site units* are carved out of market-rate buildings under the
  Affordable Requirements Ordinance. They are wherever the market builds — by
  construction, not by finding. Plotting them against permits is a tautology.
- *Subsidized developments* (LIHTC, DOH-financed multifamily, senior and
  supportive housing) follow land cost, allocation-plan scoring and city policy.
  Historically they cluster on the South and West sides, where market-rate
  permitting is thinnest.

The expected result is therefore *the affordable units the market produces go
where the market goes; the ones the city funds go where it doesn't.* That is a
sharper and more useful finding than a single correlation, and the page should
be designed to show the two series separately.

**Data.**

| Source | What it gives | Limits |
|---|---|---|
| `s6ha-ppgi` Affordable Rental Housing Developments | 598 city-assisted rental developments, 29,550 units, all geocoded, typed (Multifamily 259 / 12,916 units; Senior 106 / 9,809; ARO 156 / 1,727; supportive and other ~77 / ~5,100) | A **stock** directory: no dates. Drops projects when their ~30-year compliance period expires. Rental only — no for-sale ARO, no in-lieu fees. Excludes CHA and naturally-occurring affordable housing. Check whether `units` is restricted units or all units in mixed-income buildings. |
| Our permit pipeline (`ydr8-5enu`) | Permit dates for developments built since 2010, by address match | Catches new construction only; much subsidized activity is rehab or preservation and will not match. |
| HUD LIHTC database (huduser.gov, downloadable) | Placed-in-service year, address, low-income unit count for every tax-credit property | Federal program only; misses DOH-only deals. |
| DOH ARO project lists (PDF, chicago.gov) | Per project: on-site units vs in-lieu fee, by address | PDF wrangling. No portal dataset for ARO exists. |
| `p293-wvbd` wards | Point-in-polygon to current wards, same as permits | — |

**Phases.**

1. **Stock by ward.** Map and table of city-assisted affordable units per ward
   from `s6ha-ppgi`, split subsidized vs ARO, normalised per 1,000 households
   (ACS, already in the repo). Add a scatter of each series against units
   permitted per year 2010–26. Answers the hunch at the stock level. About a
   day. Ship with the limits above stated on the page.
2. **Flow.** Date the developments: address-match to new-construction permits
   for permit year, and join LIHTC placed-in-service years for the subsidized
   side. Report the match rate honestly — it will not be 100%. Then a year
   slider like the permitting page. Two to three days; the risk is match rate.
3. **The ARO mechanism (stretch).** From DOH's project lists, map projects that
   paid the in-lieu fee against where fee-funded units were built. This is the
   actual mechanism behind the hunch — high-market wards paying instead of
   building, fees funding units elsewhere — and would be the headline chart.
   Effort unknown until the PDFs are inspected.

**Decide before starting phase 1:** whether "affordable" on the page means the
dataset's scope (income-restricted units in city-assisted rental developments)
and say so; whether to show total or restricted units; whether CHA gets its
own layer later.

## 2. Deconversions and demolitions

**Question.** How many units is each ward losing, and what is net production
once losses are subtracted? Two-flats becoming single-family homes is Chicago's
signature affordability loss and it comes from the pipeline we already have.

- **Data.** `ydr8-5enu` permit type `PERMIT - WRECKING/DEMOLITION` (2,366
  since 2023; descriptions like "WRECK AND REMOVE A 2 STORY MASONRY MULTI UNIT
  RESIDENCE"), plus renovation and new-construction descriptions containing
  "deconvert", "convert … to single family", "from 2 to 1 dwelling unit".
- **Output.** Units lost per ward per year; a *net* view on the permitting
  page (gross − demolished − deconverted) or a tab of its own.
- **Risk.** Demolition descriptions often say "multi unit" without a count.
  Start with building counts and a floor estimate, flagged as approximate;
  Cook County Assessor parcel data has unit counts if precision is needed.
- **Policy hooks.** The 606 and Pilsen demolition-surcharge ordinances; two-
  to-four-flat preservation.

## 3. Zoning map amendments by ward

**Question.** Which wards upzone and which downzone? This is aldermanic
prerogative in data form, and it fills the gap the scorecard left without the
editorial problem.

- **Data.** `dj47-wfun` (current zoning) carries `ordinance`, `ordinance_1`
  (a date), `case_numbe` and `case_type` on each polygon.
- **First step.** Profile those fields: how many polygons carry a date, and
  whether the *prior* class is recoverable. The current snapshot stores only
  the latest class, so direction of change may need ordinance text or archived
  zoning snapshots.
- **Output.** Rezonings per ward per year, classified up or down; share of
  residential land rezoned in each direction.

## Also queued

- **Zoning: share of each ward zoned single-family-only vs multi-family.**
  `dj47-wfun` intersected with wards, area-weighted in EPSG:3435. RS-1/2/3 is
  43% of zoned land; RS-3 alone is 21%, and whether it counts as SFH-only is
  the definitional call that swings the result. Group Planned Developments as
  MFH-allowed (`PD 0` alone is 5% of the city — most of downtown); B and C
  districts permit residential above ground floor. Use residentially-usable
  land as the denominator. Pairs naturally with permits per year, same layout
  as the income tab.
- **ADU applications by ward.** `j4h8-ug9m` (496 applications since the
  2026-03-31 ordinance change, with ward, zoning class and status) and
  `xbwc-ntpx` (1,038 from the 2021–26 pilot, with the pilot zone). Pre- vs
  post-ordinance by ward is straightforward. *Ward opt-in status is not a
  dataset* — it is ordinance reading and would be a hand-maintained table.
- **Historic ward boundaries on the map.** The "at time of permit" view leaves
  the map unshaded because it draws current outlines. When the selected years
  fall entirely within one map era, draw that era's polygons (2003 and 2015
  maps are on the portal). A range spanning two eras still cannot be drawn.
- **`permits.json` is now ~450 KB and inlined into the bundle.** Fetch it at
  runtime like the ward geometry.
- **PAC footer link returns 404** — acitythatworks.org has no `/pac` page.
- **Confirm `citythatworks@substack.com` is a monitored inbox** before the
  "let us know" link gets traffic.
- **OG / Twitter card tags** so shared links preview properly.
- **README route table** has drifted from `src/sections.ts` three times; it
  either needs generating or removing.
