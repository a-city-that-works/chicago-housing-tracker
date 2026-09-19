# What counts as an affordable unit in Chicago

Reference for anyone building or reading the affordable-housing sections of
this site. The short version: these are **layers of financing that stack on the
same building**, not mutually exclusive buckets, so they cannot be added
together. Everything below was checked against the live datasets in September
2026; counts will drift.

## The distinction that organises everything

**Unit-based.** The restriction lives on the building. Rent is capped for the
length of a covenant, typically 30 years, whoever lives there. Every category
below except the last.

**Tenant-based.** The subsidy follows the household. A Housing Choice Voucher
holder rents an ordinary market apartment and pays about 30% of income, with
HUD paying the rest; when they move out it is an ordinary apartment again.
Vouchers therefore cannot appear on a map of affordable units, and adding them
to a building count double-counts, because a voucher holder may well live in a
LIHTC building.

## The categories

| Category | What creates the restriction | Who runs it | Chicago scale |
|---|---|---|---|
| Public housing | Federal ownership and operating subsidy | CHA | 103 developments, 19,651 units |
| LIHTC | Federal tax credits in exchange for a ~30-year rent covenant | Allocated by IHDA, the state agency | 518 properties, 42,576 low-income units |
| Project-based federal assistance | A HUD contract attached to the building: Section 8 project-based, Section 202 (elderly), Section 811 (disabled), PRAC | HUD | 330 properties, 30,572 assisted units of 38,643 total |
| ARO / inclusionary zoning | Local ordinance requiring a set-aside when a development needs a zoning change, city land or city money | Chicago DOH | 206 buildings, 2,159 rental units |
| City-financed deals | TIF, multifamily loans, land write-downs, donation tax credits | Chicago DOH | Usually layered onto LIHTC, rarely standalone |
| Chicago Housing Trust | Permanent affordability covenants on for-sale homes, partly funded by ARO in-lieu fees | DOH / the Trust | Small; its own map on the city's ARO page |
| Naturally occurring affordable housing | Nothing. It is simply cheap | Nobody | The largest category in the city, in no dataset |
| Housing Choice Vouchers | Tenant-based subsidy | CHA | Tens of thousands of households, not mappable to buildings |

That last pair matters for framing. If the question is "all affordable units in
existence", the largest category by far is unsubsidised older housing that
happens to be cheap, and nothing tracks it. Everything countable here is the
*subsidised* subset, and pages should say so rather than implying completeness.

## Why they overlap

A typical Chicago deal layers four or five sources: tax credit equity, a city
loan, sometimes TIF, often a project-based Section 8 contract, sometimes CHA
ownership or a ground lease. Each source puts the building in a different
agency's dataset.

Measured by matching coordinates within 60 m (September 2026):

| Overlap | Rate |
|---|---|
| LIHTC properties also in the city directory | 43% |
| HUD-assisted properties also in the city directory | 22% |
| LIHTC properties also carrying a HUD contract | 18% |
| City directory entries in neither federal set | 385 of 598 (152 of them ARO) |

These are lower bounds, since geocoding differs between sources. Practical
consequence: the deduplicated universe is roughly **60,000–70,000
income-restricted rental units**, against about 120,000 if you add the columns.

## Where CHA fits

**CHA is not a category. It is an owner and administrator that appears inside
several of them.** This is the most common confusion in this space. CHA reaches
households four ways:

1. **Traditional public housing** it owns and operates outright.
2. **Mixed-income redevelopments** from the Plan for Transformation, where CHA
   is a partner and the deal is financed with LIHTC. These sit in the tax
   credit data, not the public housing data.
3. **RAD conversions**, which moved a large share of public housing onto
   project-based Section 8 contracts. Same buildings, same tenants, different
   dataset.
4. **Housing Choice Vouchers** it administers, which are not buildings at all.

So "CHA units" and "public housing units" are different numbers, and the 19,651
figure understates CHA's footprint considerably.

**Counting trap.** The Plan for Transformation demolished on the order of
25,000 units and replaced fewer. Any chart of CHA units *added* without units
*removed* tells the opposite of the true story. Show net, or do not show it.

## Rules this implies

1. **Never publish a summed total across programs.** Either assign each
   building one primary program by a stated precedence — proposed: CHA >
   supportive > LIHTC > ARO, on the logic that the deepest subsidy and most
   restrictive covenant wins the label — or present programs as explicitly
   overlapping layers that are never totalled.
2. **Keep the market-produced and publicly-financed split visible.** ARO is the
   only category where the *market* produces the affordable units, so it lands
   where the market builds. Everything else is publicly financed and lands
   where policy and land costs send it. That contrast is the most useful thing
   these datasets can show.
3. **State the scope on the page.** "Income-restricted units in city-assisted
   rental developments" is not the same as "affordable housing", and readers
   will assume the latter unless told.

## Sources

| Dataset | Where | Vintage | Notes |
|---|---|---|---|
| ARO rental buildings | ArcGIS service behind [the city's ARO map](https://www.chicago.gov/city/en/sites/affordable-requirements-ordinance/home/aro-map.html) | 2026-02 | Not on the data portal. Ward, units, AMI tiers. No dates. Used by `/affordable`. |
| `LIHTC` | HUD eGIS | Service 2025-05 | Placed-in-service records stop in 2020, allocation years stop in 2018. Cannot answer "units added" recently. |
| `MULTIFAMILY_PROPERTIES_ASSISTED` | HUD eGIS | 2026-07 | Distinguishes assisted from total units. Client-group field separates elderly, disabled, family. |
| `Public_Housing_Developments` | HUD eGIS | 2026-07 | Filter `PARTICIPANT_CODE='IL002'` for CHA. No year-added field. |
| `s6ha-ppgi` Affordable Rental Housing Developments | Chicago data portal | Data 2024-12, metadata still claims "current as of March 2013" | The portal's only affordable-housing dataset. Undated. **Its `units` field is inconsistent**: across 35 mixed-income buildings matched to HUD, it equalled HUD's total in 9 cases, HUD's assisted count in 2, and neither in 24. Do not use it for a headline number. |

## Open questions

- **In-lieu fees.** Developers may pay instead of building ARO units. Nothing
  published so far quantifies that by year or ward, so `/affordable`
  understates how the ordinance works and says so on the page. The fee
  schedule quoted in secondary sources could not be confirmed from the
  February 2024 ARO Rules PDF; **do not publish a fee figure without a primary
  citation.** Worth stating once sourced: the fee is set well below what it
  costs to produce a unit in Chicago, which is why paying is attractive.
- **The post-2020 LIHTC gap.** IHDA, the state allocator, knows about projects
  years before HUD does and is the lead for closing it.
- **For-sale ARO units** are not in the rental layer.
