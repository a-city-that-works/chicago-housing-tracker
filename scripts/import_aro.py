"""
Build src/data/aro.json — Affordable Requirements Ordinance units by ward and year.

Source: the feature service behind the city's ARO map at
chicago.gov/city/en/sites/affordable-requirements-ordinance/home/aro-map.html.
This is NOT on the open data portal. The portal's only affordable-housing
dataset (s6ha-ppgi) is undated, last refreshed December 2024, and its own
metadata still says "current as of March 2013"; this service was refreshed in
February 2026 and carries ward, unit counts and a full AMI-tier breakdown.

Two corrections do the work:

1. NO DATE FIELD. The service is a snapshot of ARO rental buildings with no
   year on any record, so "units per year" is impossible from it alone. Each
   building is matched to a new-construction permit, and that permit's issue
   year dates it. Three tiers, most trustworthy first:

     exact    the geocoder's normalised address equals the permit's
     address  same street, house number within ±25 (Chicago numbers run 100
              to the block, so this stays on the block face; it catches corner
              lots and buildings permitted under one of several addresses)
     spatial  nearest permit within 75 m, as a last resort

   Address beats coordinates where both fire: of 116 buildings matched both
   ways, they agreed on the year 113 times, and all three disagreements were
   the spatial match landing on a neighbouring parcel. Tiering this way dates
   190 of 206 buildings with 177 on an address rather than a guess, against
   187 on coordinates alone. The method is recorded per building so the page
   can be honest about it. Buildings that are conversions of existing
   structures have no new-construction permit and stay undated by design.

2. THE WARD FIELD IS UNDATED TOO. It is whatever was current when the row was
   written, so wards are recomputed by point-in-polygon against the current
   (2023) map, exactly as the permit importer does. Keeps this page and the
   permitting page on the same geography.

RENTAL ONLY. The layer is "ARO Rental Buildings"; for-sale ARO units are not
in it. In-lieu fees — developers paying instead of building — are not in it
either, and are a large share of how the ordinance actually operates. Both
limits belong on the page.

Requires: shapely, certifi (build-time only).
"""
import collections
import json
import math
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request

ARO_SERVICE = (
    "https://services7.arcgis.com/A03QrhyHnDaUmK0W/arcgis/rest/services/"
    "Geocoding_Result_ARO_Map_and_Dashboard_Data_Updated_02_06_2026_view/FeatureServer/0"
)
ARO_MAP_PAGE = (
    "https://www.chicago.gov/city/en/sites/affordable-requirements-ordinance/home/aro-map.html"
)
WARDS = "https://data.cityofchicago.org/resource/p293-wvbd.geojson"
PERMIT_CACHE = ".permits_cache.json"
OUT = "src/data/aro.json"

# Last-resort match radius. 40 m dates only 74% of buildings; 150 m starts
# picking up the building next door. 75 m is the usable middle.
MATCH_M = 75
# House-number slack for an address match, in street-number units.
ADDR_TOLERANCE = 25

SUFFIXES = {
    "AVENUE": "AVE", "STREET": "ST", "BOULEVARD": "BLVD", "DRIVE": "DR",
    "PLACE": "PL", "ROAD": "RD", "COURT": "CT", "TERRACE": "TER",
    "PARKWAY": "PKWY", "PLAZA": "PLZ", "SQUARE": "SQ", "LANE": "LN",
}


def street_key(number, rest):
    """(house number, normalised street) or None if the number isn't numeric."""
    if not str(number).strip().isdigit():
        return None
    toks = re.sub(r"[.,]", " ", str(rest).upper()).split()
    return int(number), " ".join(SUFFIXES.get(t, t) for t in toks)

AMI_TIERS = ["ARO_30", "ARO_40", "ARO_50", "ARO_60", "ARO_70", "ARO_80", "ARO_100"]


def _ssl_context():
    """python.org macOS builds ship without a usable CA bundle; use certifi's."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None


def get(url, params=None, timeout=120):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as r:
        return json.load(r)


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def fetch_aro():
    fields = ",".join(
        ["Name", "Project_Ad", "Match_addr", "Community", "Ward", "ARO_Units", "Off_site_P"]
        + AMI_TIERS
    )
    d = get(ARO_SERVICE + "/query", {
        "where": "1=1", "outFields": fields, "returnGeometry": "true",
        "outSR": 4326, "f": "json", "resultRecordCount": 2000,
    })
    out = []
    for f in d["features"]:
        g = f.get("geometry")
        if not g:
            continue
        out.append(dict(f["attributes"], lat=g["y"], lon=g["x"]))
    return out


def main():
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree

    buildings = fetch_aro()
    total_units = sum(int(b["ARO_Units"] or 0) for b in buildings)
    print(f"  {len(buildings)} ARO buildings, {total_units:,} units")

    # ---- wards, recomputed on the current map -------------------------------
    geo = get(WARDS, {"$limit": 60})
    polys = [shape(f["geometry"]) for f in geo["features"]]
    nums = [int(f["properties"]["ward"]) for f in geo["features"]]
    tree = STRtree(polys)

    def ward_of(lat, lon):
        pt = Point(lon, lat)
        for i in tree.query(pt):
            if polys[i].contains(pt):
                return nums[i]
        return None

    # ---- dates, borrowed from the permit pipeline ---------------------------
    if not os.path.exists(PERMIT_CACHE):
        print(f"  ERROR: {PERMIT_CACHE} not found — run scripts/import_permits.py first.",
              file=sys.stderr)
        sys.exit(1)
    permits = [p for p in json.load(open(PERMIT_CACHE)) if p.get("latitude")]
    grid = collections.defaultdict(list)
    by_street = collections.defaultdict(list)
    for p in permits:
        la, lo = float(p["latitude"]), float(p["longitude"])
        grid[(round(la, 3), round(lo, 3))].append((la, lo, p))
        k = street_key((p.get("street_number") or "").strip(),
                       f"{(p.get('street_direction') or '').strip()} "
                       f"{(p.get('street_name') or '').strip()}")
        if k:
            by_street[k[1]].append((k[0], p))

    def match_by_address(match_addr):
        """Exact first, then the same street within ADDR_TOLERANCE."""
        head = (match_addr or "").split(",")[0].strip()
        m = re.match(r"^(\d+)\s+(.*)$", head)
        if not m:
            return None
        num, street = street_key(m.group(1), m.group(2)) or (None, None)
        if num is None:
            return None
        near = [(abs(n - num), p) for n, p in by_street.get(street, [])
                if abs(n - num) <= ADDR_TOLERANCE]
        if not near:
            return None
        exact = [p for gap, p in near if gap == 0]
        pool = exact or [p for _, p in near]
        # earliest permit on the parcel is the original build; later ones are
        # staged filings or alterations
        return ("exact" if exact else "address", min(pool, key=lambda p: p["issue_date"]))

    def nearest_permit(lat, lon):
        best = None
        kla, klo = round(lat, 3), round(lon, 3)
        for dla in (-1, 0, 1):
            for dlo in (-1, 0, 1):
                for la, lo, p in grid.get((round(kla + dla * 0.001, 3),
                                           round(klo + dlo * 0.001, 3)), []):
                    d = haversine(lat, lon, la, lo)
                    if d <= MATCH_M and (best is None or d < best[0]):
                        best = (d, p)
        return best

    by_ward = collections.defaultdict(lambda: {
        "units": 0, "buildings": 0, "dated": 0, "offSite": 0,
        **{t: 0 for t in AMI_TIERS},
    })
    by_year = collections.defaultdict(int)
    by_ward_year = collections.defaultdict(lambda: collections.defaultdict(int))
    projects = collections.defaultdict(list)
    undated, unplaced, dated_units = [], 0, 0
    methods = collections.Counter()

    for b in buildings:
        units = int(b["ARO_Units"] or 0)
        w = ward_of(b["lat"], b["lon"])
        if w is None:
            unplaced += 1
            continue
        rec = by_ward[w]
        rec["units"] += units
        rec["buildings"] += 1
        if (b.get("Off_site_P") or "").strip().lower() == "yes":
            rec["offSite"] += 1
        for t in AMI_TIERS:
            rec[t] += int(b[t] or 0)

        found = match_by_address(b.get("Match_addr"))
        if not found:
            hit = nearest_permit(b["lat"], b["lon"])
            found = ("spatial", hit[1]) if hit else None

        year, how = None, "none"
        if found:
            how, permit = found
            year = permit["issue_date"][:4]
            by_year[year] += units
            by_ward_year[w][year] += units
            rec["dated"] += 1
            dated_units += units
        else:
            undated.append((b.get("Name") or "").strip() or b.get("Project_Ad"))
        methods[how] += 1

        projects[w].append({
            "n": (b.get("Name") or "").strip() or "—",
            "a": (b.get("Project_Ad") or "").strip(),
            "u": units,
            "y": year,
            "m": how,
        })

    print(f"  placed in a ward: {len(buildings) - unplaced}/{len(buildings)}")
    print(f"  dated: {sum(v['dated'] for v in by_ward.values())} buildings, "
          f"{dated_units:,}/{total_units:,} units ({dated_units / total_units * 100:.0f}%)")
    print(f"    by exact address:     {methods['exact']}")
    print(f"    by address ±{ADDR_TOLERANCE}:      {methods['address']}")
    print(f"    by coordinates only:  {methods['spatial']}")
    print(f"  undated (no new-construction permit — likely conversions): {len(undated)}")

    payload = {
        "meta": {
            "source": "Chicago Department of Housing, ARO Rental Buildings",
            "sourceUrl": ARO_MAP_PAGE,
            "service": ARO_SERVICE,
            "vintage": "2026-02-06",
            "buildings": len(buildings),
            "units": total_units,
            "datedUnits": dated_units,
            "datedShare": round(dated_units / total_units, 4),
            "undatedBuildings": len(undated),
            "matchMetres": MATCH_M,
            "addrTolerance": ADDR_TOLERANCE,
            "matchMethods": dict(methods),
            "note": ("Rental ARO units only. Excludes for-sale ARO units and units "
                     "bought out through in-lieu fees. Years are the issue year of the "
                     "nearest new-construction permit, not a field in the source. "
                     "Buildings are matched to that permit by address where possible "
                     "and by coordinates only as a fallback."),
        },
        "amiTiers": [t.replace("ARO_", "") for t in AMI_TIERS],
        "byWard": {str(w): by_ward[w] for w in sorted(by_ward)},
        "byYear": dict(sorted(by_year.items())),
        "byWardYear": {str(w): dict(sorted(by_ward_year[w].items())) for w in sorted(by_ward_year)},
        "projects": {str(w): sorted(projects[w], key=lambda p: -p["u"]) for w in sorted(projects)},
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(payload, open(OUT, "w"), indent=1)
    print(f"  wrote {OUT}: {len(by_ward)} wards with ARO units")


if __name__ == "__main__":
    main()
