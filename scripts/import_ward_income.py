"""
Build src/data/wardIncome.json — median household income per ward.

Source: ACS 2024 5-year estimates at census tract level, aggregated to the
current (2023) wards. Two deliberate choices:

- HOUSEHOLD income, not family income. Chicago's own ACS-by-ward dataset
  (awnk-6fvc) publishes family income, which excludes single-person and
  unrelated-roommate households. Those are ~55% of households citywide and are
  concentrated in exactly the downtown wards that permit the most housing, so
  family income would misdescribe the wards that matter most here.

- Weighted by OCCUPIED HOUSING UNITS, not population. Household income should be
  weighted by households; population weighting over-counts wards with larger
  families. The difference averages ~$1,700 per ward.

Tracts are assigned to wards by centroid, matching the method already used in
the chicago-political-maps repo. Centroids are computed in EPSG:3435 (Illinois
State Plane) rather than a geographic CRS, where they would be distorted.

Inputs are not fetched here because the ACS extract and tract shapefile live in
the sibling chicago-political-maps repo:

    data/raw/demographics/acs_2024_5yr_tracts_cook_county.csv
    data/raw/boundaries/census/cook_county_tracts/

Usage:
    python3 scripts/import_ward_income.py <acs_csv> <tracts_dir> <wards_geojson> [out]

Requires geopandas + pandas (build-time only).
"""
import json
import sys

import geopandas as gpd
import numpy as np
import pandas as pd

acs_csv, tracts_dir, wards_path = sys.argv[1], sys.argv[2], sys.argv[3]
out = sys.argv[4] if len(sys.argv) > 4 else "src/data/wardIncome.json"

tr = gpd.read_file(tracts_dir)
acs = pd.read_csv(acs_csv)
tr["GEOID"] = tr["GEOID"].astype(str)
acs["GEOID"] = acs["GEOID"].astype(str)
tr = tr.merge(acs, on="GEOID", how="inner").to_crs("EPSG:3435")

wards = gpd.read_file(wards_path).to_crs("EPSG:3435")
wards["ward"] = wards["ward"].astype(int)

for c in ["total_population", "median_household_income", "owner_occupied",
          "renter_occupied", "median_gross_rent"]:
    tr[c] = pd.to_numeric(tr[c], errors="coerce")
# ACS marks suppressed values with large negative sentinels
for c in ["median_household_income", "median_gross_rent"]:
    tr.loc[tr[c] < 0, c] = np.nan

centroids = gpd.GeoDataFrame(tr.drop(columns="geometry"),
                             geometry=tr.geometry.centroid, crs=tr.crs)
joined = gpd.sjoin(centroids, wards[["ward", "geometry"]], how="inner", predicate="within")

rows = []
for ward, g in joined.groupby("ward"):
    hh = g["owner_occupied"].fillna(0) + g["renter_occupied"].fillna(0)
    inc = g["median_household_income"]
    ok = inc.notna() & (hh > 0)
    rent = g["median_gross_rent"]
    rok = rent.notna() & (hh > 0)
    rows.append({
        "ward": int(ward),
        "tracts": int(len(g)),
        "households": int(hh.sum()),
        "population": int(g["total_population"].sum()),
        "income": int(round(np.average(inc[ok], weights=hh[ok]))),
        "medianRent": int(round(np.average(rent[rok], weights=hh[rok]))) if rok.any() else None,
    })

if len(rows) != 50:
    print(f"  WARNING: {len(rows)} wards, expected 50", file=sys.stderr)

payload = {
    "meta": {
        "source": "ACS 2024 5-year, tract level, aggregated to 2023 wards by tract centroid",
        "measure": "median household income, weighted by occupied housing units",
        "wards": len(rows),
    },
    "wards": sorted(rows, key=lambda r: r["ward"]),
}
json.dump(payload, open(out, "w"), indent=1)
lo = min(r["income"] for r in rows)
hi = max(r["income"] for r in rows)
print(f"  wrote {out}: {len(rows)} wards, income ${lo:,}-${hi:,}")
