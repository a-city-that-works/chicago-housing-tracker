# Backlog

What we intend to build next, in priority order, with enough on each item that
someone could pick it up cold. Shipped work is described in the README; this
file is only what's ahead.

Background on the programs themselves is in
[docs/affordable-housing-categories.md](docs/affordable-housing-categories.md).

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

1. ~~**ARO.**~~ **Shipped** as `/affordable`. Source is the ArcGIS feature
   service behind the city's ARO map page, which is *not* on the data portal
   and is far better than `s6ha-ppgi`: refreshed 2026-02, with ward, unit
   counts and AMI tiers. It carries no date, so buildings are dated by
   matching to the nearest new-construction permit within 75 m (93% of units).
   Importer: `scripts/import_aro.py`.
2. **In-lieu fees — the missing half of the ARO story.** Developers may pay
   instead of building, and nothing published so far quantifies that by year
   or by ward. Until it exists the page understates how the ordinance
   actually works, and says so. Leads: DOH reporting, the Chicago Housing
   Trust, the OIG's ARO administration audit. **Note:** the fee schedule
   quoted in secondary sources (roughly $100k–225k per unit) could not be
   confirmed from the February 2024 ARO Rules PDF, whose text layer did not
   yield a fee table. Do not publish a fee figure without a primary citation.
   Worth stating clearly when we have it: the fee is set well below what it
   costs to actually produce a unit in Chicago, which is why paying is
   attractive.
3. **LIHTC.** HUD's database: 518 Chicago properties, 42,576 low-income
   units, but placed-in-service records stop in 2020 and allocation years
   stop in 2018, so it cannot answer "units added" for recent years. IHDA,
   the state allocator, is the lead for closing that gap; its developer
   pages 404'd on first attempt and need a real look.
4. **Supportive housing.** `MULTIFAMILY_PROPERTIES_ASSISTED`: 330 Chicago
   properties, 30,572 assisted units of 38,643 total, current to 2026-07,
   with a client-group field separating elderly, disabled and family.
5. **CHA.** `Public_Housing_Developments` filtered to `PARTICIPANT_CODE='IL002'`:
   103 developments, 19,651 units, current to 2026-07. No year-added field.
   Show *net* of removals or not at all.

The directory (`s6ha-ppgi`) remains useful as a cross-check on coverage and
as a secondary stock view, normalised per 1,000 households.

**External request, 2026-09-18.** A reader asked for "an additional map/view
that highlights LIHTC/ARO/CHA units added, and maybe another one for shelters
and supportive housing." This is the same pipeline framed by program rather
than by question, and it resolves two decisions:

- *Flow, not stock.* "Units added" is a flow question. The undated directory
  is not a first version; it is a cross-check.
- *CHA is in* — and it is the hardest source. No dataset gives CHA units
  added by year; CHA's annual Moving to Work reports list deliveries per
  development and would be hand-entered. **A CHA "added" figure without
  "removed" misleads:** the Plan for Transformation demolished on the order
  of 25,000 units and replaced fewer. Show net, or say so prominently.

Design consequence: one tab, *program* as a dimension. Map with program
filters (LIHTC, ARO, CHA, supportive), the scatter grouped market-linked vs
subsidized, one table.

**Overlap rule, before any counting.** One building can be LIHTC-financed,
CHA-owned and supportive housing at once — most Plan for Transformation sites
are — so summing programs double- or triple-counts. Assign each development
one primary program by a stated precedence (proposed: CHA > supportive >
LIHTC > ARO) and note the overlap.

**Shelters are a separate section, not a layer.** Different department
(DFSS), measured in beds not units, no year-added, and the most contested
siting question in the city since 2023. Ward-level bed counts only, no
addresses. **Domestic-violence shelters are never mapped** — locations are
confidential for safety. Scope this separately, last.

**Sequence:** LIHTC (best data; proves the pipeline) → ARO → supportive (a
filter on data already loaded) → CHA (after the net-vs-gross decision) →
shelters, if at all.

**Resolved.** The directory's `units` field is *inconsistent*: across 35
mixed-income buildings matched to HUD records, it equalled HUD's total unit
count in 9 cases, HUD's assisted count in 2, and neither in 24. It cannot
carry a headline number without per-row reconciliation, which is another
reason the ARO page uses the DOH service instead. Normalisation settled as
"ARO units as a share of all new units permitted in the ward", which is the
most quotable framing and is what `/affordable` shows.

**Overlap, measured.** Matching on coordinates within 60 m: 43% of LIHTC
properties appear in the city directory, 22% of HUD-assisted properties do,
and 18% of LIHTC properties are also HUD-assisted. 385 of 598 city entries
match neither federal set, of which 152 are ARO. So the deduplicated
universe is roughly 60,000–70,000 income-restricted rental units, not the
~120,000 a naive sum would give.

## 1b. ~~New construction filed as renovation~~ — FIXED

Shipped. Chicago sometimes types a brand-new building as
`PERMIT - RENOVATION/ALTERATION` (the Thompson's permit reads "FULL BUILDING
PERMIT FOR PROPOSED NEW 12 STORY RESIDENTIAL"), and the unit extractor only
understood "units" and "D.U.", not "apartments". Both are fixed in
`scripts/import_permits.py`; the citywide total moved from 89,420 to 92,142.

**Still open: conversions.** Measured, not yet shipped. A net-units extractor
over renovation permits finds four parseable patterns:

| Pattern | Permits | Net units |
|---|---|---|
| Adaptive reuse (non-residential building to housing) | 114 | +2,694 |
| Explicit addition ("to provide 320 new apartments") | 88 | +657 |
| Before/after ("convert 5 D.U. to 6 D.U.") | 1,163 | −302 |
| Deconversion to single family | 516 | −632 |
| **Net** | **1,881** | **+2,417** |

Gains +4,098, losses −1,681, over 2010–2026. Concentrated recently: 2019
+620, 2025 +630, which is the LaSalle Street office-to-residential wave. Every
gain of 25 units or more was reviewed by hand and is correct — a 24-storey
office converting floors 4–24, a nursing home to 160 units, a parking garage
to 72, the Duncan's YMCA to 320.

Order of tests matters: check for deconversion wording *first*, or
"deconversion of 3 dwelling units to original 2" reads as +3. Exclude a hotel
as the *result*, since hotel rooms are not dwelling units.

**Accuracy.** A random sample of 25 was reviewed by hand: 24 correct, one
wrong. The failure was "addition to existing 2 dwelling unit... to create 3
dwelling units", where 3 is the total after the work, not an increment, so it
scored +3 instead of +1. Across the whole corpus only 1 of 94 addition-pattern
matches is ambiguous that way, worth +2 units, but the phrasing will recur and
needs a guard: if a permit states a prior unit count and says "to create/
provide N" without "add" or "new", treat N as the total.

Largest single loss is 2300 N Lincoln Park West, the Belden-Stratford, going
from 278 to 209 units on a $43M gut renovation of a 1920s hotel-residence.
Verified against the permit trail. **Decision: no special-casing.** It is
counted like any other loss, not flagged or framed separately; the table is
sortable if a reader wants to find it.

**These are floors, not totals.** Only permits with explicit parseable
language are caught; a conversion that never states a count is invisible.
Demolition losses are not in here at all — that is item 2.

**Why it matters for ARO.** `/affordable` counts ARO units in conversions
(currently 307 of 1,995) but expresses them as a share of a denominator that
excludes conversions, because `permits.json` is new construction only. That
comparison is inconsistent today. Adding a conversions series fixes it.

## 2. Demolitions — the reason nothing says "net"

Conversions and deconversions shipped; demolitions did not, and they are the
single largest gap in any claim about net housing supply.

17,279 wrecking permits since 2010. Classified:

| | Permits |
|---|---|
| Residential, **no unit count stated** | 13,906 |
| Single family (safe to assume 1) | 2,063 |
| Unclear | 889 |
| Non-residential | 307 |
| Residential **with** a unit count | 114 |

Only 2,413 units are recoverable, and that is a severe floor: the typical
permit reads "WRECK AND REMOVE A 2 STORY FRAME BUILDING", which could be one
home or six. At even 1.5 units per building the 13,906 unknown permits imply
roughly 20,000 units lost, an order of magnitude more than we can count, which
would take the 94,571 shown on the site down towards 75,000.

**This is why the permitting page says "units permitted + converted" and
states plainly that it is not a net figure.** Publishing 2,413 as the
demolition total would be far worse than publishing nothing.

To do it properly the unit count has to come from outside the permit text.
Cook County Assessor parcel data has units per property; joining on address or
PIN before demolition would recover most of it. That is the real project.

## 3. Zoning map amendments by ward## 3. Zoning map amendments by ward

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
