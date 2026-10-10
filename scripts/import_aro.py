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

# Permits that ARE one of these are never the building the ARO units are in.
NOT_A_BUILDING = re.compile(
    r"\bTENT\b|\bCANOPY\b|\bTEMPORARY\b|\bBLEACHER\b|\bSTAGE\b|"
    r"\bCRANE\b|\bHOIST\b|\bSCAFFOLD\b|\bWRECK\b|\bDEMOLITION\b")
# Words that disqualify a permit only when it names no new unit count. A real
# building permit mentions these in passing all the time: Somerset Place's
# 160-unit conversion ends "...AND A SURFACE PARKING LOT", 4646 N Damen's 24
# units include "A 6'-0\" TALL FENCE". Treating them as vetoes threw out five
# correct exact-address matches and sent a sixth to the wrong building.
INCIDENTAL = re.compile(
    r"\bTRUSS\b|\bSIGN\b|\bFENCE\b|\bSHED\b|\bANTENNA\b|\bSWIMMING POOL\b|"
    r"\bPARKING LOT\b|\bGREENHOUSE\b|\bSIDEWALK\b|\bCAR ?WASH\b|\bSTATION\b|"
    r"\bTUCKPOINT|\bMAINTENANCE\b|\bPORCH\b|\bLINTEL")
# A count that describes what is already there, not what the permit builds:
# "CURRENT USE : MIXED-USE (A2) 36 RESIDENTIAL DU ... PROPOSED WORK: INTERIOR
# BUILD-OUT FOR DAY CARE" is a day-care fit-out, not a 36-unit building.
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


#: Chicago's convention for filing several buildings of one development
#: together: a master permit's text lists every sibling ("BUILDING # 1, BLDG.
#: # 2 100645755, BLDG. # 3 100645751 ..."), and satellite permits point back
#: at the master ("SEE PERMIT NO. 100645761 FOR APPROVED PLANS").
PERMIT_ID_REF = re.compile(r"\b(\d{9})\b")


def complex_capacity(permit, permit_index, classifier):
    """
    Total units across the multi-building development this permit belongs to,
    if Chicago's cross-referencing convention is detected in its text; None
    otherwise.

    Found because two ARO records (1623 N Talman, 1447 N Washtenaw) both
    named an off-site address that resolved to one 5-unit permit, needing 8
    combined — impossible for a 5-unit building. That building is "Building
    #7" of an 8-building, ~49-unit townhome development spanning Homer,
    Campbell and Cortland, permitted the same week in September 2016; 8 fits
    comfortably once the receiving site's real capacity is counted rather
    than the one building nearest the stated address.
    """
    raw = (permit.get("work_description") or "").upper()
    own = unit_count(raw, classifier) or 0
    ids = set(PERMIT_ID_REF.findall(raw)) - {permit.get("permit_")}
    if not ids:
        return None
    seen = {permit.get("permit_")}
    total = own
    frontier = ids
    for _ in range(2):  # a satellite is one hop from the master; the master
        nxt = set()      # lists every other sibling in that same hop
        for pid in frontier:
            if pid in seen:
                continue
            seen.add(pid)
            sibling = permit_index.get(pid)
            if not sibling:
                continue
            st = (sibling.get("work_description") or "").upper()
            n = unit_count(st, classifier)
            if n:
                total += n
            nxt |= set(PERMIT_ID_REF.findall(st))
        frontier = nxt - seen
    return total if total > own else None


def plausible(permit, need, classifier, require_count=False, permit_index=None):
    """
    Unit count if this permit could be the building holding `need` ARO units,
    else None. `classifier` is the permit importer's module, reused for its
    regexes and unit extraction.

    `require_count` is used for renovation permits, where an explicit unit
    count is the only thing separating a conversion from a kitchen remodel.

    `permit_index` (permit_ -> permit) enables the complex-capacity fallback:
    if this specific permit's own stated count is too small or absent, but it
    is part of a cross-referenced multi-building development whose combined
    capacity covers `need`, that counts as plausible. Pass it only for shared
    off-site matches — everywhere else, a building should stand on its own.
    """
    t = classifier.CROSS_REF.sub(" ", (permit.get("work_description") or "").upper())
    if NOT_A_BUILDING.search(t) or classifier.REVISION.search(t):
        return None
    # The ARO applies to developments of ten or more units, so a single-family
    # permit is never the building — not even for a one-unit obligation.
    if classifier.SFR.search(t):
        return None
    n = unit_count(t, classifier)
    if n is None and INCIDENTAL.search(t):
        return None
    if n is not None and n >= need:
        return n
    if n is None and not (require_count or not RESIDENTIAL.search(t)):
        return 0
    if permit_index is not None:
        cap = complex_capacity(permit, permit_index, classifier)
        if cap is not None and cap >= need:
            return cap
    return None


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


def in_range_addresses(rec):
    """
    (low, high, street) if Project_Ad names an address range, else None.

    "1257-1301 N Ashland Ave" is one range on one street; the geocoder keeps
    only one end (Match_addr), which may not be the end nearest the permit.
    """
    head = (rec.get("Match_addr") or "").split(",")[0].strip()
    geo = parse_address(head)
    if not geo:
        return None
    m = ADDRESS_RANGE.match((rec.get("Project_Ad") or "").strip())
    if not m:
        return None
    lo, hi = sorted((int(m.group(1)), int(m.group(2))))
    return lo, hi, geo[1]

AMI_TIERS = ["ARO_30", "ARO_40", "ARO_50", "ARO_60", "ARO_70", "ARO_80", "ARO_100"]


#: Buildings whose correct address is verified by hand and appears NOWHERE in
#: the ARO source record — not in Match_addr, Project_Ad, or If_off_sit — so
#: no address-matching logic could ever find them algorithmically. Each entry
#: was confirmed against the permit text before being added here; add a dated
#: note explaining how it was found. Checked first, ahead of every other tier.
MANUAL_OVERRIDES = {
    "Vista on the Park": {
        "addr": "1554 N Talman Ave",
        "note": ("The record's own off-site address (2635 W North) has no permit "
                 "that can hold its 3 ARO units. Confirmed by hand 2026-09: exact "
                 "address, new construction, 30 D.U., 2017-07-10 — a 10% ARO share."),
    },
    "Millie on Michigan": {
        "addr": "88 E Wacker Pl",
        "note": ("The record names no off-site address at all. The building is a "
                 "47-story hotel/residential/retail tower (completed ~2022), "
                 "confirmed by hand 2026-09 via its Phase I permit (100824888, "
                 "2020-08-07). None of its five permits states a residential unit "
                 "count, so this dates the building but cannot verify its ARO share."),
    },
    "The Raven Residences": {
        "addr": "4733 N Wolcott Ave",
        "note": ("Recorded at 1825 W Lawrence, a corner lot; the building is "
                 "permitted on its Wolcott frontage. Confirmed by hand 2026-10: new "
                 "construction, 112 D.U., 2021-04-22 — a 15% ARO share."),
    },
    "District Haus": {
        "addr": "1626 W Hastings St",
        "note": ("Recorded at 1310 S Ashland. It is eight six-flats on Hastings and "
                 "13th St (48 units), all permitted 2024-08-16 to 08-23; 1626 W "
                 "Hastings is one of them. Confirmed by hand 2026-10. The permits "
                 "say '(6) DWELLING TOTAL', which the unit extractor cannot read."),
    },
    "Triangle Square": {
        "addr": "2155 N Elston Ave",
        "note": ("Recorded at 2075 N Elston, 80 house numbers away. Confirmed by "
                 "hand 2026-10: 7-story apartment building, foundation permit "
                 "2019-12-20. No permit there states a unit count."),
    },
    "The Oasis of Bucktown": {
        "addr": "1700 N Western Ave",
        "note": ("Recorded at 2400 W Wabansia, a corner lot with no permit; the "
                 "building is permitted on its Western frontage. Confirmed by hand "
                 "2026-10: new construction, 60 units, 2019-07-08 — a 15% ARO share."),
    },
    "Panorama": {
        "addr": "918 W School St",
        "note": ("Recorded at 3300 N Clark; permitted on its School St frontage. "
                 "Confirmed by hand 2026-10: new construction, 140 D.U., 2019-12-05."),
    },
    "The Henry": {
        "addr": "4346 N Honore St",
        "note": ("Recorded at 1819 W Montrose; permitted on its Honore frontage. "
                 "Confirmed by hand 2026-10: 38 D.U., foundation permit 2017-12-08. "
                 "The permit itself says 4 units will be on-site affordable, which "
                 "is this record's ARO count."),
    },
    "The Westner": {
        "addr": "2407 W Eastwood Ave",
        "note": ("Recorded at 4618 N Western; permitted on its Eastwood frontage. "
                 "Confirmed by hand 2026-10: new construction, 40 units, foundation "
                 "permit 2016-08-22."),
    },
    "4114 W West End Avenue": {
        "addr": "4114 W West End Ave",
        "note": ("An off-site building for 166-67 N Aberdeen. The address is right "
                 "but its permit (2021-02-17) is a gut renovation of an existing "
                 "6-unit building, short of the 8 ARO units recorded, so the size "
                 "test rejected it. A 2-unit coach house was permitted alongside it "
                 "two weeks later, which makes 8. Confirmed by hand 2026-10."),
    },
    "1447 N. Superior Holding": {
        "addr": "1447 W Superior St",
        "note": ("The address is right. Its permit (100840009, 2020-03-10) converts "
                 "a monastery to 'SIXTEEEN (16)APARTMENT UNITS' — a typo and a "
                 "missing space the unit extractor cannot read — so with no count "
                 "the matcher fell through to a 6-unit neighbour at 1459. "
                 "Confirmed by hand 2026-10 against the developer's project page."),
    },
    "Saxony Wilson": {
        "addr": "4601 N Paulina St",
        "note": ("Recorded at 1630 W Wilson; permitted on its Paulina frontage. A "
                 "former masonic temple (later the American Indian Center), also "
                 "let as Paulina Street Lofts. Confirmed by hand 2026-10: "
                 "conversion to 24 D.U., permit 100678169, 2017-10-11."),
    },
    "Wicker Park Place": {
        "addr": "1162 N Milwaukee Ave",
        "note": ("Recorded at 1504 W. Haddon; permitted on its Milwaukee frontage. "
                 "Confirmed by hand 2026-10: new construction, 14 units, permit "
                 "100894530, 2024-06-28. A 2025 fire-alarm permit filed at 1504 W "
                 "Haddon cites that permit number, which ties the two addresses."),
    },
    "2719 W Cermak": {
        "addr": "2719 W Cermak Rd",
        "note": ("The address is right. Its permit (100730505, 2020-09-11) creates "
                 "'(16) NEW RESIDENTIAL UNITS' on the upper floors, a phrasing the "
                 "unit extractor cannot read. Confirmed by hand 2026-10."),
    },
    "20 S Hamlin": {
        "addr": "20 S Hamlin Blvd",
        "note": ("An off-site building for 166-67 N Aberdeen. The address is right: "
                 "permit 100907064, 2021-04-23, a gut renovation of an existing "
                 "'SEVEN (7) DWELLING UNIT BUILDING', adding one. Same developer "
                 "pattern and season as 4114 W West End. Confirmed by hand 2026-10."),
    },
    "3639 W Iowa": {
        "addr": "856 N Monticello Ave",
        "note": ("An off-site building for 1140 W Erie, on the corner of Iowa and "
                 "Monticello; nothing is filed on Iowa. Permit 100929314, "
                 "2021-11-30, is an interior remodel of an existing 4-unit "
                 "building, the record's ARO count. Matched by hand 2026-10 on "
                 "location and unit count; less certain than a same-address match."),
    },
    "3204 N Clifton": {
        "addr": "1138 W Belmont Ave",
        "note": ("Recorded on Clifton, the side street of a corner lot; the "
                 "building is permitted on Belmont. Confirmed by hand 2026-10: "
                 "new construction, 33 dwelling units, 2023-06-06 — a 9% ARO "
                 "share. Without this it matched 3222 N Clifton, a 3-unit "
                 "building permitted in May 2026, after the ARO snapshot itself."),
    },
}

# Buildings with no usable building permit at all, dated by hand from other
# evidence. Kept apart from MANUAL_OVERRIDES because the year here is an
# estimate, not a permit's issue date.
ESTIMATED_YEARS = {
    "3121 W Monroe": {
        "year": "2021",
        "kind": "conversion",
        "note": ("An off-site building for 1140 W Erie; a rehab of an existing "
                 "four-flat with no renovation permit on record. A construction "
                 "loan was recorded 2020-11, and an easy permit of 2021-09-28 "
                 "(100941788) fits out exactly four units, the ARO count. The "
                 "other 1140 W Erie off-site buildings date to 2021-22. "
                 "Estimated by hand 2026-10."),
    },
}

# Buildings whose permit was found by hand but predates the permit record used
# here (2010 on). They are dated, but to a year outside the series, so they are
# labelled "pre-2010" and kept out of every by-year figure.
PRE_SERIES = {
    "Glenlake LLC": {
        "kind": "conversion",
        "note": ("1544 W Glenlake, permit of 2009-04-24: renovation and 3-story "
                 "addition taking a 6-unit building to 32 dwelling units. 3 ARO "
                 "units of 32 is about 10%. Found by hand 2026-10."),
    },
    "Axis Apartments and Lofts": {
        "kind": "conversion",
        "note": ("The 441 E Erie tower dates from 1986; the ARO units belong to "
                 "the 'Lofts', offices converted on the Ontario side. Permit of "
                 "2009-05-14 at 448 E Ontario converts a 12-story building to 32 "
                 "residential units. Found by hand 2026-10."),
    },
}
PRE_SERIES_LABEL = "pre-2010"


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
    permit_by_id = {p["permit_"]: p for p in permits}

    claimed = set()

    def match_by_address(rec, need):
        """
        Best plausible permit for this building, searched in strict tiers
        rather than by nearest-wins: a confirmed address always beats a
        nearby guess, however close the guess is.

         -1. a hand-verified MANUAL_OVERRIDES address — checked first,
             for the handful of buildings whose real address is not in
             the source record under any field
          0. the off-site address, if the record names one — explicit in
             the source, and may legitimately be shared by several projects
             paying into one receiving building
          1. either endpoint of a declared address range, or the single
             geocoded address when there is no range — an exact number
          2. any address strictly inside a declared range, correct parity
          3. proximity fallback, +/- ADDR_TOLERANCE house numbers

        "1257-1301 N Ashland Ave" is the case this matters for: the geocoder
        kept 1301, and the nearest building AT 1301 was a plausible but wrong
        9-unit permit 20 doors off. Ranking by proximity picked that over the
        real, exact 24-unit permit at 1257 — the range's other end — because
        proximity from the wrong anchor still beat an exact match from the
        right one. Tiering by confidence first fixes that.

        Within a tier: new construction outranks a renovation at the same
        address, since a conversion permit on a new building is a later
        fit-out; the larger building outranks the smaller; the earlier permit
        outranks the later one.
        """
        offsite = (rec.get("Off_site_P") or "").strip().lower() == "yes"
        best = None

        override = MANUAL_OVERRIDES.get((rec.get("Name") or "").strip())
        if override:
            k = parse_address(override["addr"])
            if k:
                pool = by_street.get(k[1]) or by_street.get(street_core(k[1]), [])
                # The address was checked by a person, so the size test is
                # waived (need=0) — District Haus is eight six-flats, none of
                # which alone holds its 14 ARO units. The permit must still be
                # a building; new construction first, then the earliest.
                for n, p, kind in sorted(pool, key=lambda x: (x[2] != "new", x[1]["issue_date"])):
                    if n == k[0] and p["permit_"] not in claimed:
                        if plausible(p, 0, cls) is not None:
                            best = ((-1,), p, 0, kind, -1)
                            break

        def consider(tier, num, street, gap, p, kind, shared=False):
            nonlocal best
            if p["permit_"] in claimed and not shared:
                return
            # A shared off-site match may legitimately need more than its own
            # building holds — the receiving site can be several buildings
            # filed together — so it also gets the complex-capacity fallback.
            units = plausible(p, need, cls, require_count=(kind == "conversion"),
                               permit_index=(permit_by_id if shared else None))
            if units is None:
                return
            rank = (tier, 0 if gap == 0 else 1, 0 if kind == "new" else 1,
                    -units, p["issue_date"])
            if best is None or rank < best[0]:
                best = (rank, p, gap, kind, tier)

        def scan(tier, num, street):
            pool = by_street.get(street) or by_street.get(street_core(street), [])
            for n, p, kind in pool:
                gap = abs(n - num)
                if gap > ADDR_TOLERANCE:
                    continue
                # Chicago's odd and even numbers face each other across the
                # street, so a near miss of the wrong parity is a different
                # building, not the same one.
                if gap and (n % 2) != (num % 2):
                    continue
                consider(tier, num, street, gap, p, kind)

        rng = in_range_addresses(rec) if best is None else None
        head = (rec.get("Match_addr") or "").split(",")[0].strip()
        geo = parse_address(head) if best is None else None

        if offsite and best is None:
            k = parse_address(rec.get("If_off_sit"))
            if k:
                pool = by_street.get(k[1]) or by_street.get(street_core(k[1]), [])
                for n, p, kind in pool:
                    gap = abs(n - k[0])
                    if gap > ADDR_TOLERANCE or (gap and (n % 2) != (k[0] % 2)):
                        continue
                    consider(0, k[0], k[1], gap, p, kind, shared=True)

        if rng:
            lo, hi, street = rng
            # tier 1 — either declared endpoint, exactly
            for endpoint in (lo, hi):
                pool = by_street.get(street) or by_street.get(street_core(street), [])
                for n, p, kind in pool:
                    if n == endpoint:
                        consider(1, endpoint, street, 0, p, kind)
            # tier 2 — strictly inside the range, correct parity: a confirmed
            # address even though it isn't a number named anywhere on record
            pool = by_street.get(street) or by_street.get(street_core(street), [])
            parity = lo % 2
            for n, p, kind in pool:
                if lo < n < hi and (n % 2) == parity:
                    consider(2, n, street, 0, p, kind)
            # tier 3 — proximity fallback from the geocoded end, last resort
            if geo:
                scan(3, geo[0], geo[1])
        elif geo:
            # no range: the geocoded address is exact if hit, else a guess
            scan(1, geo[0], geo[1])

        if not best:
            return None
        _, p, gap, kind, tier = best
        if not (offsite and tier == 0):
            claimed.add(p["permit_"])
        label = "manual" if tier == -1 else ("exact" if gap == 0 else "address")
        return (label, p, kind)

    by_ward = collections.defaultdict(lambda: {
        "units": 0, "buildings": 0, "dated": 0, "offSite": 0,
        **{t: 0 for t in AMI_TIERS},
    })
    by_year = collections.defaultdict(int)
    by_ward_year = collections.defaultdict(lambda: collections.defaultdict(int))
    projects = collections.defaultdict(list)
    undated, unplaced, dated_units = [], 0, 0
    pre_series, undated_units = [], 0
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
        elif (b.get("Name") or "").strip() in ESTIMATED_YEARS:
            est = ESTIMATED_YEARS[(b.get("Name") or "").strip()]
            how, year, kind = "estimated", est["year"], est["kind"]
            by_year[year] += units
            by_ward_year[w][year] += units
            rec["dated"] += 1
            dated_units += units
        elif (b.get("Name") or "").strip() in PRE_SERIES:
            how, year = "preSeries", PRE_SERIES_LABEL
            kind = None  # kinds counts only units that appear in the series
            pre_series.append(units)
        else:
            undated.append((b.get("Name") or "").strip() or b.get("Project_Ad"))
            undated_units += units
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
    print(f"    by manual override:   {methods['manual']}")
    print(f"    by estimated year:    {methods['estimated']}")
    print(f"  permitted before the series starts: {len(pre_series)} buildings, "
          f"{sum(pre_series)} units")
    print(f"  units in new buildings: {kinds['new']:,}   in conversions: {kinds['conversion']:,}")
    print(f"  undated (no building permit found): {len(undated)} buildings, "
          f"{undated_units} units")

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
            "undatedUnits": undated_units,
            "preSeriesBuildings": len(pre_series),
            "preSeriesUnits": sum(pre_series),
            "preSeriesLabel": PRE_SERIES_LABEL,
            "addrTolerance": ADDR_TOLERANCE,
            "unitsNewBuild": kinds["new"],
            "unitsConversion": kinds["conversion"],
            "matchMethods": {k: methods[k] for k in ("exact", "address", "manual", "estimated")},
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
