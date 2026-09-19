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

   Every candidate must first pass a plausibility gate, because proximity and
   even a shared address say nothing about whether the permit is a building.
   Ungated, this produced nonsense: Elm Street Plaza's 34 ARO units were dated
   from a temporary tent permit for a New Year's Eve party, Axis Apartments
   from an event canopy, The Mabel Exchange from a carwash, 4801 N Ravenswood
   from the Metra station foundation, and 50 of 177 address matches picked a
   tower crane or a foundation-only filing because those are simply the
   earliest permit on the parcel.

   The gate rejects anything that is not a building (tents, canopies, cranes,
   hoists, scaffolds, signs, demolitions), rejects single-family permits for
   buildings owing more than one ARO unit, and rejects any permit whose own
   stated unit count is smaller than the ARO obligation. Note that it cannot
   reuse classify() from the permit importer: that deliberately calls
   foundation-only permits non-residential to avoid double-counting units, but
   a foundation permit for a 267-apartment project is a perfectly good date.

   Candidates are then ranked: exact address over near address, larger
   building over smaller, earlier permit over later.

   The gate costs coverage and is worth it. A wrong year is worse than no
   year, and buildings that fail are mostly rehabs and loft conversions that
   never had a new-construction permit at all. The method is recorded per
   building so the page can report it.

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
# House-number slack for an address match, in street-number units. Chicago
# numbers run 100 to the block, so this stays on the block face.
ADDR_TOLERANCE = 25

# Things that are emphatically not the building the ARO units are in.
NOT_A_BUILDING = re.compile(
    r"\bTENT\b|\bCANOPY\b|\bTEMPORARY\b|\bBLEACHER\b|\bSTAGE\b|\bTRUSS\b|\bSIGN\b|"
    r"\bFENCE\b|\bSHED\b|\bANTENNA\b|\bSWIMMING POOL\b|\bPARKING LOT\b|\bGREENHOUSE\b|"
    r"\bCRANE\b|\bHOIST\b|\bSCAFFOLD\b|\bSIDEWALK\b|\bWRECK\b|\bDEMOLITION\b|"
    r"\bCAR ?WASH\b|\bSTATION\b")
RESIDENTIAL = re.compile(
    r"\bDWELLING\b|\bAPARTMENT|\bRESIDEN|\bD\.?\s?U\.?\b|\bCONDO|\bUNITS?\b")

SUFFIXES = {
    "AVENUE": "AVE", "STREET": "ST", "BOULEVARD": "BLVD", "DRIVE": "DR",
    "PLACE": "PL", "ROAD": "RD", "COURT": "CT", "TERRACE": "TER",
    "PARKWAY": "PKWY", "PLAZA": "PLZ", "SQUARE": "SQ", "LANE": "LN",
}


def plausible(permit, need, classifier):
    """
    Unit count if this permit could be the building holding `need` ARO units,
    else None. `classifier` is the permit importer's module, reused for its
    regexes and unit extraction.
    """
    t = (permit.get("work_description") or "").upper()
    if NOT_A_BUILDING.search(t) or classifier.REVISION.search(t):
        return None
    if classifier.SFR.search(t) and need > 1:
        return None
    n = classifier.extract_units(t)
    if n is not None and n < need:
        return None
    if n is None and not RESIDENTIAL.search(t):
        return None
    return n or 0


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


def load_classifier():
    """The permit importer's regexes and unit extraction, reused not copied."""
    import importlib.util
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "import_permits.py")
    spec = importlib.util.spec_from_file_location("import_permits", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree

    cls = load_classifier()

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

    def match_by_address(match_addr, need):
        """Best plausible permit on the address: exact, then bigger, then earlier."""
        head = (match_addr or "").split(",")[0].strip()
        m = re.match(r"^(\d+)\s+(.*)$", head)
        if not m:
            return None
        key = street_key(m.group(1), m.group(2))
        if key is None:
            return None
        num, street = key
        best = None
        for n, p in by_street.get(street, []):
            gap = abs(n - num)
            if gap > ADDR_TOLERANCE:
                continue
            units = plausible(p, need, cls)
            if units is None:
                continue
            rank = (0 if gap == 0 else 1, -units, p["issue_date"])
            if best is None or rank < best[0]:
                best = (rank, p, gap)
        if not best:
            return None
        return ("exact" if best[2] == 0 else "address", best[1])

    def nearest_permit(lat, lon, need):
        """Nearest plausible permit — proximity alone is not evidence."""
        best = None
        kla, klo = round(lat, 3), round(lon, 3)
        for dla in (-1, 0, 1):
            for dlo in (-1, 0, 1):
                for la, lo, p in grid.get((round(kla + dla * 0.001, 3),
                                           round(klo + dlo * 0.001, 3)), []):
                    d = haversine(lat, lon, la, lo)
                    if d <= MATCH_M and (best is None or d < best[0]):
                        if plausible(p, need, cls) is not None:
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

        found = match_by_address(b.get("Match_addr"), units)
        if not found:
            hit = nearest_permit(b["lat"], b["lon"], units)
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
    print(f"  undated (no plausible new-construction permit — mostly rehabs "
          f"and conversions): {len(undated)}")

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
                     "and by coordinates only as a fallback, and every candidate "
                     "must plausibly be a residential building large enough to "
                     "contain the ARO units."),
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
