# Chicago Housing Tracker

A ward-by-ward site tracking housing in Chicago for *A City That Works*, in partnership with
Abundant Housing Illinois and the Chicago Growth Project — what's on the market and who can
afford it, and what's getting permitted.

Audience is advocates and the general public, with policymakers as a secondary read, so the
site explains its terms rather than assuming them.

## Site structure

Sections are declared in [`src/sections.ts`](src/sections.ts), which drives the header nav, the
landing-page cards, and the routes together. Adding or renaming a section is a one-line change
there — deliberate, since the information architecture will shift as data sources get confirmed.

| Route | Stage | Status |
|---|---|---|
| `/` | Landing — hero, section cards, newsletter coverage | Live |
| `/affordability` | What you can afford — the listings dashboard | Live |
| `/permitting` | What gets built — units permitted by ward | Live |
| `/income` | Who builds — ward income against units permitted | Live |
| `/glossary` | Reference — AMI, ARO, and how to read the numbers | Live |

`/glossary` is intentionally not in the top nav; it is reached from the footer and from the
affordability map's footnote, where the jargon actually appears.

Stub pages state what the section will show, its data source, and what's blocking it. A page
that says only "coming soon" tells a reader nothing and a collaborator less.

> This table duplicates `src/sections.ts` in prose and has drifted twice already. Check it
> whenever a section is renamed or promoted.

## House style

Design tokens in [`src/index.css`](src/index.css) are anchored on the two partner sites, which
converge on the same base: geometric sans, white ground, cool near-black ink, one saturated
cyan-family accent.

- **Chicago Growth Project** supplies the bulk of it — Geologica, ink `#0a1014`, muted `#56626a`,
  azure `#00abe5`, square corners, uppercase tracked eyebrows in the accent.
- **Abundant Housing Illinois** supplies coral `#d85a42`, used for selection state and the
  "less affordable" diverging pole.

Geologica is used throughout; it matches CGP exactly and is freely available, unlike Abundant
Housing's licensed Brandon Text.

Contrast on white: ink 19.1:1, muted 6.3:1, `--accent-text` 5.6:1, coral-text 5.4:1 — all clear
WCAG AA. Brand azure is only 2.6:1, so it is split into `--accent` (fills, rules, marks) and
`--accent-text` (anything text-sized) rather than used indiscriminately.

Accent colours are reserved for **chrome**. Data keeps its own azure sequential ramp — verified
monotone light→dark with every adjacent lightness gap >= 0.06 — so a UI accent never reads as a
data value.

## The data

Ward-by-ward view of how much of Chicago's active for-rent and for-sale housing stock is
actually affordable, built on Zillow listing counts collected by hand in late July 2025 and
late July 2026.

## Running locally

Requires Node 20+ (Node 18 will fail — Vite 8 needs a newer `node:util`).

```bash
nvm use 20
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

The app is a fully static SPA — no backend, no API keys — so `dist/` can be dropped on
Netlify, GitHub Pages, or any static host. `public/_redirects` supplies the SPA fallback so a
direct hit on `/permitting` resolves instead of 404-ing; on a non-Netlify host you'll need the
equivalent rewrite rule.

## What it shows

- **Map** — choropleth of all 50 wards, shaded by share of listings affordable at the selected
  threshold. Click a ward to pin it; hover cross-highlights with the panel.
- **Ward table** — sortable and searchable, with year-over-year rank movement.
- **Unit size** — affordability by bedroom count, citywide or for one ward.
- **Rent vs. buy** — one dot per ward, rental vs. for-sale affordability against a parity line.

Toggles: snapshot year (2025 / 2026) or year-over-year change; rentals / for-sale / both;
and 60% vs 100% AMI.

## Reading the numbers carefully

These caveats are load-bearing — the metrics are easy to misread without them.

**The two AMI thresholds are not methodologically parallel.** 60% AMI uses Chicago's ARO
*per-bedroom* rent limits (a studio and a 4-bedroom have different caps). 100% AMI uses a
single flat citywide monthly cutoff. Switching the toggle changes both the income threshold
and the method, so the difference between the two views is not purely "more income."

**The map uses a fixed color scale, deliberately.** Quantile (rank-based) breaks would
re-scale on every toggle and make 60% and 100% AMI look nearly identical, hiding that roughly
2.6x more listings clear the higher bar. Fixed breaks keep every view comparable. See
`src/lib/color.ts`.

**Affordability rate and housing supply move in opposite directions by unit size.** Citywide,
4-bedrooms clear the ARO limit most often (~26%) and 1-bedrooms least (~9%), because ARO
limits rise with bedroom count faster than real rents do. But there are ~4x fewer 4-bedroom
listings. A high rate on a small base is not abundance. Individual wards invert this pattern.

**Source-data limits**, per the original spreadsheet's own notes:
- Ward boundaries in the sheet were hand-drawn on Zillow's map, so they only approximate real
  ward lines. This app ignores them and joins on ward *number* to the city's official
  boundaries instead.
- Medians were read off Zillow's price filters by hand — treat as directional.
- Rent limits assume landlord-paid utilities, which flatters areas where tenants pay their own.
- Excludes land/empty lots and room-only rentals; includes multifamily buildings.
- The per-bedroom breakdown only exists at 60% AMI, so the Unit size chart does not respond to
  the 100% AMI toggle (it says so in the UI).

## Data pipeline

Source: a Google Sheet with three tabs — `2025`, `2026`, and `2025 vs 2026` — each covering all
50 wards plus a citywide row.

Currently the data is **baked in** as `src/data/wards_data.json`, generated by parsing CSV
exports of those three tabs and merging them by ward number.

Ward geometry lives at `public/chicago_wards.json` and is **fetched at runtime**, not imported,
so it stays out of the JS bundle. It comes from the city's
[Boundaries – Wards (2023–)](https://data.cityofchicago.org/) dataset (resource `p293-wvbd`),
simplified from 3.5 MB to ~150 KB. To regenerate it from a fresh download:

```bash
curl -sL 'https://data.cityofchicago.org/resource/p293-wvbd.geojson?$limit=60' -o raw.geojson

# keep only the ward number, drop the other attributes
# then simplify (topology-preserving) and round coords to ~1m precision
npx mapshaper raw.geojson \
  -filter-fields ward \
  -simplify 8% keep-shapes \
  -o precision=0.00001 public/chicago_wards.json
```

8% retains ~7,000 of the original 89,500 vertices with no visible difference at city zoom;
`keep-shapes` prevents small wards from collapsing, and mapshaper's shared-boundary topology
keeps adjacent wards from developing gaps. mapshaper is intentionally *not* a project
dependency — it is a one-shot tool, so run it via `npx` when needed.

> Note: the sheet's column C holds Zillow search URLs whose `customRegionId` encodes each
> hand-drawn region. Those are the hook for automating the collection step later, replacing
> the manual quarterly pull.

## Refreshing the data

| Dataset | How it refreshes |
|---|---|
| `src/data/permits.json` | **Automated.** `.github/workflows/refresh-permits.yml` re-runs the importer monthly and commits any change. Also runnable by hand from the Actions tab. |
| `src/data/wards_data.json` | Manual — Zillow listing counts collected by hand, see the pipeline notes above. |

The permit importer is safe to run unattended because it fails loudly rather
than committing bad data:

- ward reassignment must still agree with recent permits at >= 99%;
- the pull must not be materially smaller than what is already committed
  (permits only accumulate, so a shrinking dataset means the API, the
  `permit_type` label or the schema moved);
- the workflow typechecks and builds the site before committing.

Requires `shapely` and `certifi`, both build-time only.

## Known issues

- `wards_data.json` (~470 KB) is still imported into the bundle. It is small enough not to
  matter today, but if more years are added it should follow the same runtime-fetch pattern as
  the geometry.
- Data collection is still manual. The `customRegionId` values in the sheet's column C are the
  hook for automating it.
- The newsletter list in `src/data/blogPosts.ts` is hand-maintained. To make it self-updating,
  point it at `citythatworks.substack.com/feed`. Note that titles drift from slugs — several
  posts were retitled after publishing — so read titles from the feed, never from the URL.
- **Permitting data is unresolved.** Chicago's Building Permits dataset (`ydr8-5enu`) has a ward
  on every record but no unit count in any of its 122 columns, and `PERMIT - NEW CONSTRUCTION`
  is polluted with garages, permit revisions, and temporary event structures. Producing a
  trustworthy "units permitted" figure needs text extraction plus a published error rate —
  worth settling before the section's framing is locked.
