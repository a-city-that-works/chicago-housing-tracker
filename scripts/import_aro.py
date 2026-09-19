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
     address  same street and same side of it, house number within ±25
              (Chicago numbers run 100 to the block, so this stays on the block
              face; odd and even face each other, so a near miss of the wrong
              parity is a different building)

   Proximity matching was tried and dropped: reviewed by hand, roughly half its
   matches were wrong, including two ARO buildings claiming the same permit.

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

   Candidates are ranked: exact address over near, new construction over
   renovation, larger building over smaller, earlier permit over later. A
   permit can only date one ARO building.

   CONVERSIONS COUNT. Many ARO buildings are adaptive reuse — the Duncan is a
   converted YMCA — and never pull a new-construction permit, so the permit
   importer's pool (which now covers renovations too) is used whole. Renovation
   permits must state a unit count, which is the only thing separating a
   conversion from a kitchen remodel.

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
# House-number slack for an address match, in street-number units. Chicago
# numbers run 100 to the block, so this stays on the block face.
ADDR_TOLERANCE = 25

# Things that are emphatically not the building the ARO units are in.
NOT_A_BUILDING = re.compile(
    r"\bTENT\b|\bCANOPY\b|\bTEMPORARY\b|\bBLEACHER\b|\bSTAGE\b|\bTRUSS\b|\bSIGN\b|"
    r"\bFENCE\b|\bSHED\b|\bANTENNA\b|\bSWIMMING POOL\b|\bPARKING LOT\b|\bGREENHOUSE\b|"
    r"\bCRANE\b|\bHOIST\b|\bSCAFFOLD\b|\bSIDEWALK\b|\bWRECK\b|\bDEMOLITION\b|"
    r"\bCAR ?WASH\b|\bSTATION\b|\bTUCKPOINT|\bMAINTENANCE\b|\bPORCH\b|\bLINTEL")
# "320 NEW APARTMENTS" — the permit importer's extractor only knows UNITS and
# D.U., which is fine for counting new construction but loses conversions.
APARTMENTS = re.compile(r"\b(\d{1,4})\s+(?:NEW\s+)?(?:RESIDENTIAL\s+)?APARTMENTS?\b")
RESIDENTIAL = re.compile(
    r"\bDWELLING\b|\bAPARTMENT|\bRESIDEN|\bD\.?\s?U\.?\b|\bCONDO|\bUNITS?\b")

SUFFIXES = {
    "AVENUE": "AVE", "STREET": "ST", "BOULEVARD": "BLVD", "DRIVE": "DR",
    "PLACE": "PL", "ROAD": "RD", "COURT": "CT", "TERRACE": "TER",
    "PARKWAY": "PKWY", "PLAZA": "PLZ", "SQUARE": "SQ", "LANE": "LN",
}


def unit_count(text, classifier):
    """Units stated on a permit, extending the importer's extractor to apartments."""
    n = classifier.extract_units(text)
    m = APARTMENTS.search(text)
    if m:
        a = int(m.group(1))
        if 1 <= a <= 2000:
            n = max(n or 0, a)
    return n


def plausible(permit, need, classifier, require_count=False):
    """
    Unit count if this permit could be the building holding `need` ARO units,
    else None. `classifier` is the permit importer's module, reused for its
    regexes and unit extraction.

    `require_count` is used for renovation permits, where an explicit unit
    count is the only thing separating a conversion from a kitchen remodel.
    """
    t = classifier.CROSS_REF.sub(" ", (permit.get("work_description") or "").upper())
    if NOT_A_BUILDING.search(t) or classifier.REVISION.search(t):
        return None
    # The ARO applies to developments of ten or more units, so a single-family
    # permit is never the building — not even for a one-unit obligation.
    if classifier.SFR.search(t):
        return None
    n = unit_count(t, classifier)
    if n is not None and n < need:
        return None
    if n is None and (require_count or not RESIDENTIAL.search(t)):
        return None
    return n or 0


def street_key(number, rest):
    """(house number, normalised street) or None if the number isn't numeric."""
    if not str(number).strip().isdigit():
        return None
    toks = re.sub(r"[.,]", " ", str(rest).upper()).split()
    return int(number), " ".join(SUFFIXES.get(t, t) for t in toks)


#: Suffixes the off-site field routinely omits — "2635 W North" is North Ave.
STREET_TYPES = {"AVE", "ST", "BLVD", "DR", "PL", "RD", "CT", "TER", "PKWY",
                "PLZ", "SQ", "LN", "WAY", "HWY"}


def street_core(street):
    """Street without its type, so 'W NORTH' and 'W NORTH AVE' meet."""
    toks = street.split()
    return " ".join(toks[:-1]) if len(toks) > 1 and toks[-1] in STREET_TYPES else street


def parse_address(text):
    """'344 S Canal' -> street_key, or None."""
    m = re.match(r"^\s*(\d+)\s+(.+)$", (text or "").strip())
    return street_key(m.group(1), m.group(2)) if m else None


#: "1257-1301 N Ashland Ave" — the geocoder keeps one end of the range
ADDRESS_RANGE = re.compile(r"^\s*(\d+)\s*[-\u2013]\s*(\d+)")


def candidate_anchors(rec):
    """
    Addresses the building's permit might be filed under, best first.

    Three things the geocoded address alone gets wrong:

    - OFF-SITE UNITS. 19 records put their ARO units at a different address
      entirely and say where: Elm Street Plaza is a Dearborn project whose 34
      units sit at 344 S Canal. Matching the project address dates the wrong
      building, or none.
    - ADDRESS RANGES. 17 records give a range and the geocoder keeps one end,
      which may not be the end the permit used.
    - Both, for a handful.
    """
    out = []
    if (rec.get("Off_site_P") or "").strip().lower() == "yes":
        k = parse_address(rec.get("If_off_sit"))
        if k:
            out.append(k)
    head = (rec.get("Match_addr") or "").split(",")[0].strip()
    geo = parse_address(head)
    if geo:
        out.append(geo)
        m = ADDRESS_RANGE.match((rec.get("Project_Ad") or "").strip())
        if m:
            for n in (int(m.group(1)), int(m.group(2))):
                if n != geo[0]:
                    out.append((n, geo[1]))
    seen, uniq = set(), []
    for k in out:
        if k not in seen:
            seen.add(k)
            uniq.append(k)
    return uniq

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


def fetch_aro():
    fields = ",".join(
        ["Name", "Project_Ad", "Match_addr", "Community", "Ward", "ARO_Units",
         "Off_site_P", "If_off_sit"]
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
    # One pool: the permit importer now fetches new construction and renovation
    # together. Whether a permit built or converted is a property of the permit,
    # not of which file it came from.
    NEWISH = re.compile(r"NEW CONSTRUCTION|PROPOSED NEW|ERECT NEW|CONSTRUCTION OF A NEW")

    def kind_of(p):
        if (p.get("permit_type") or "") == "PERMIT - NEW CONSTRUCTION":
            return "new"
        return "new" if NEWISH.search((p.get("work_description") or "").upper()) else "conversion"

    permits = [p for p in json.load(open(PERMIT_CACHE)) if p.get("latitude")]
    by_street = collections.defaultdict(list)
    kinds_seen = collections.Counter()
    for p in permits:
        kind = kind_of(p)
        kinds_seen[kind] += 1
        k = street_key((p.get("street_number") or "").strip(),
                       f"{(p.get('street_direction') or '').strip()} "
                       f"{(p.get('street_name') or '').strip()}")
        if k:
            by_street[k[1]].append((k[0], p, kind))
            core = street_core(k[1])
            if core != k[1]:
                by_street[core].append((k[0], p, kind))
    print(f"  permit pool: {kinds_seen['new']:,} new construction + "
          f"{kinds_seen['conversion']:,} renovation")

    claimed = set()

    def match_by_address(rec, need):
        """
        Best plausible permit across every address this building might be filed
        under: exact number first, then the larger building, then the earlier
        permit. New construction outranks a renovation at the same address,
        since a conversion permit on a new building is a later fit-out.
        """
        offsite = (rec.get("Off_site_P") or "").strip().lower() == "yes"
        best = None
        for anchor_i, (num, street) in enumerate(candidate_anchors(rec)):
            # the first anchor of an off-site record is the receiving building,
            # which legitimately holds units owed by several projects
            shared = offsite and anchor_i == 0
            pool = by_street.get(street) or by_street.get(street_core(street), [])
            for n, p, kind in pool:
                gap = abs(n - num)
                if gap > ADDR_TOLERANCE:
                    continue
                if p["permit_"] in claimed and not shared:
                    continue
                # Chicago's odd and even numbers face each other across the
                # street, so a near miss of the wrong parity is a different
                # building, not the same one.
                if gap and (n % 2) != (num % 2):
                    continue
                units = plausible(p, need, cls, require_count=(kind == "conversion"))
                if units is None:
                    continue
                rank = (anchor_i, 0 if gap == 0 else 1, 0 if kind == "new" else 1,
                        -units, p["issue_date"])
                if best is None or rank < best[0]:
                    best = (rank, p, gap, kind)
        if not best:
            return None
        if not (offsite and best[0][0] == 0):
            claimed.add(best[1]["permit_"])
        return ("exact" if best[2] == 0 else "address", best[1], best[3])

    by_ward = collections.defaultdict(lambda: {
        "units": 0, "buildings": 0, "dated": 0, "offSite": 0,
        **{t: 0 for t in AMI_TIERS},
    })
    by_year = collections.defaultdict(int)
    by_ward_year = collections.defaultdict(lambda: collections.defaultdict(int))
    projects = collections.defaultdict(list)
    undated, unplaced, dated_units = [], 0, 0
    methods = collections.Counter()
    kinds = collections.Counter()

    # Largest obligation first: a permit can only date one building, and a
    # one-unit set-aside should not take the permit a 40-unit one needs.
    for b in sorted(buildings, key=lambda x: -int(x["ARO_Units"] or 0)):
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

        found = match_by_address(b, units)

        year, how, kind = None, "none", None
        if found:
            how, permit, kind = found
            year = permit["issue_date"][:4]
            by_year[year] += units
            by_ward_year[w][year] += units
            rec["dated"] += 1
            dated_units += units
        else:
            undated.append((b.get("Name") or "").strip() or b.get("Project_Ad"))
        methods[how] += 1
        if kind:
            kinds[kind] += units

        projects[w].append({
            "n": (b.get("Name") or "").strip() or "—",
            "a": (b.get("Project_Ad") or "").strip(),
            "u": units,
            "y": year,
            "m": how,
            "k": kind,
        })

    print(f"  placed in a ward: {len(buildings) - unplaced}/{len(buildings)}")
    print(f"  dated: {sum(v['dated'] for v in by_ward.values())} buildings, "
          f"{dated_units:,}/{total_units:,} units ({dated_units / total_units * 100:.0f}%)")
    print(f"    by exact address:     {methods['exact']}")
    print(f"    by address ±{ADDR_TOLERANCE}:      {methods['address']}")
    print(f"  units in new buildings: {kinds['new']:,}   in conversions: {kinds['conversion']:,}")
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
            "addrTolerance": ADDR_TOLERANCE,
            "unitsNewBuild": kinds["new"],
            "unitsConversion": kinds["conversion"],
            "matchMethods": dict(methods),
            "note": ("Rental ARO units only. Excludes for-sale ARO units and units "
                     "bought out through in-lieu fees. Years are the issue year of the "
                     "nearest new-construction permit, not a field in the source. "
                     "Buildings are matched to that permit by address only, and "
                     "every candidate must plausibly be a residential building "
                     "large enough to contain the ARO units."),
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
