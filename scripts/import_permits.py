"""
Build src/data/permits.json — housing units permitted per ward per year.

Source: data.cityofchicago.org resource ydr8-5enu, permit_type
"PERMIT - NEW CONSTRUCTION", 2010 onward. This is the open-data API, not
scraping. 2006-2009 is excluded: 2006 has no ward on any record and coordinate
coverage is patchier, so 2010 is the first clean year.

Three corrections do most of the work:

1. NO UNIT COUNT EXISTS. The dataset has 47 real columns and none of them is a
   unit count, so counts are extracted from the free-text work_description.
   ~70% of "new construction" permits are not housing at all (garages, porches,
   event tents, permit revisions) and are classified out.

2. STAGED PERMITS. A large project pulls permits in sequence — caissons, then
   foundation, then full building — each repeating the project's unit count.
   One 339-unit tower appeared three times. Deduplicated on address + unit
   count within a two-year window.

3. WARD BOUNDARIES MOVED. Wards were redrawn in 2015 and 2023, so a 2012 permit
   carries a ward number that is not today's geography. Every permit is
   reassigned to its current ward by point-in-polygon on its coordinates.
   Validated at 99.87% against 2024+ permits, whose stated ward is already
   current.

Requires: shapely (build-time only, not a site dependency).
"""
import collections
import datetime
import json
import os
import re
import sys
import ssl
import urllib.parse
import urllib.request

API = "https://data.cityofchicago.org/resource/ydr8-5enu.json"
WARDS = "https://data.cityofchicago.org/resource/p293-wvbd.geojson"
START_YEAR = 2010
# Smallest project listed individually on the site. Below this a permit is
# usually a house or a two-flat — a private address rather than a development,
# so only the aggregate count is published.
PROJECT_MIN_UNITS = 5
OUT = sys.argv[1] if len(sys.argv) > 1 else "src/data/permits.json"
CACHE = ".permits_cache.json"

# ---- unit extraction ---------------------------------------------------

WORDNUM = {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5, "SIX": 6,
           "SEVEN": 7, "EIGHT": 8, "NINE": 9, "TEN": 10, "ELEVEN": 11, "TWELVE": 12}
NONRES = re.compile(
    r"\bGARAGE\b|\bPORCH\b|\bDECK\b|\bFENCE\b|\bSHED\b|\bCANOPY\b|\bTENT\b|"
    r"\bTEMPORARY\b|\bSTAGE\b|\bTRUSS\b|\bBLEACHER\b|\bANTENNA\b|\bSIGN\b|"
    r"\bPARKING LOT\b|\bFOUNDATION ONLY\b|\bPILES ONLY\b|\bSWIMMING POOL\b|"
    r"\bTOWER\b|\bGREENHOUSE\b|\bPARK\b")
REVISION = re.compile(r"\bREVISION\b|\bREVISE[SD]?\b|\bAMEND")
SFR = re.compile(r"SINGLE\s*-?\s*FAMILY|\bSFR\b")
EXISTING = re.compile(r"EXISTING[^.]{0,60}?\b(?:UNITS?|D\.?U\.?)\b")
TAIL = r"(?:UNITS?|D\.\s?U\.?|DU)\b"
TOTAL = re.compile(
    r"\(?\b(\d{1,3})\)?\s*TOTAL\s+(?:DWELLING\s+|RESIDENTIAL\s+)?" + TAIL
    + r"|TOTAL\s+\(?(\d{1,3})\)?\s*(?:DWELLING\s+|RESIDENTIAL\s+)?" + TAIL)
NUM = re.compile(r"(?<!CAR )(?<!CAR)\(?\b(\d{1,3})\)?\s*[- ]?\s*"
                 r"(?:DWELLING\s+|RESIDENTIAL\s+|EFFICIENCY\s+)?" + TAIL)
WORD = re.compile(r"\b(" + "|".join(WORDNUM) + r")\s*[- ]?\s*(?:DWELLING\s+)?" + TAIL)


def extract_units(t):
    """Units for the project, or None. Prefers an explicit total; never sums —
    '32 UNIT BUILDING (INCL. 6 EFFICIENCY UNITS)' is 32, not 38."""
    m = TOTAL.search(t)
    if m:
        n = int(m.group(1) or m.group(2))
        if 1 <= n <= 1000:
            return n
    nums = [int(x) for x in NUM.findall(t) if 1 <= int(x) <= 1000]
    if nums:
        return max(nums)
    w = WORD.search(t)
    return WORDNUM[w.group(1)] if w else None


def title_case(addr):
    """'2740 N HOYNE AVE' -> '2740 N Hoyne Ave', keeping directionals upper."""
    return " ".join(
        part if len(part) == 1 or part.isdigit() else part.capitalize()
        for part in addr.split()
    )


def classify(desc):
    t = (desc or "").upper()
    if REVISION.search(t):
        return ("revision", None)
    if not EXISTING.search(t):
        n = extract_units(t)
        if n:
            return ("multi-unit", n)
    if SFR.search(t):
        return ("single family", 1)
    if NONRES.search(t):
        return ("non-residential", 0)
    return ("unclear", None)


# ---- fetch -------------------------------------------------------------

def _ssl_context():
    """python.org macOS builds ship without a usable CA bundle; use certifi's."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None


def get(url, params):
    q = urllib.parse.urlencode(params)
    with urllib.request.urlopen(f"{url}?{q}", timeout=180, context=_ssl_context()) as r:
        return json.load(r)


def fetch_permits():
    if os.path.exists(CACHE):
        print(f"  using cached {CACHE}")
        return json.load(open(CACHE))
    print("  fetching permits from the Chicago open data API…")
    rows = get(API, {
        "$select": ("permit_,issue_date,ward,reported_cost,work_description,"
                    "street_number,street_direction,street_name,latitude,longitude"),
        "$where": (f"permit_type='PERMIT - NEW CONSTRUCTION' "
                   f"AND issue_date>='{START_YEAR}-01-01'"),
        "$limit": 40000,
        "$order": "issue_date",
    })
    json.dump(rows, open(CACHE, "w"))
    return rows


def main():
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree

    rows = fetch_permits()
    print(f"  {len(rows):,} new-construction permits since {START_YEAR}")

    geo = get(WARDS, {"$limit": 60})
    polys = [shape(f["geometry"]) for f in geo["features"]]
    wnum = [int(f["properties"]["ward"]) for f in geo["features"]]
    tree = STRtree(polys)

    def current_ward(r):
        lat, lon = r.get("latitude"), r.get("longitude")
        if not lat or not lon:
            return None
        p = Point(float(lon), float(lat))
        for i in tree.query(p):
            if polys[i].contains(p):
                return wnum[i]
        return None

    # sanity check the reassignment where the stated ward is already current
    agree = total = 0
    for r in rows:
        if (r.get("issue_date") or "") < "2024-01-01" or not r.get("ward"):
            continue
        w = current_ward(r)
        if w is not None:
            total += 1
            agree += (w == int(r["ward"]))
    rate = agree / total * 100 if total else 0
    print(f"  ward reassignment agrees with stated ward on {rate:.2f}% of {total:,} 2024+ permits")
    if rate < 99:
        print("  WARNING: agreement below 99% — check the boundary file", file=sys.stderr)

    recs, unmapped, cats = [], 0, collections.Counter()
    for r in rows:
        cat, n = classify(r.get("work_description"))
        cats[cat] += 1
        w = current_ward(r)
        if w is None:
            unmapped += 1
        addr = " ".join(str(r.get(f) or "").strip().upper()
                        for f in ("street_number", "street_direction", "street_name"))
        recs.append((r.get("issue_date", "")[:10], w, n, addr, r.get("permit_")))

    # collapse staged permits for one project
    recs.sort(key=lambda x: x[0])
    seen, kept, dropped = {}, [], 0
    for date, w, n, addr, permit in recs:
        if n:
            k = (addr, n)
            prev = seen.get(k)
            if prev and (datetime.date.fromisoformat(date)
                         - datetime.date.fromisoformat(prev)).days <= 730:
                dropped += 1
                continue
            seen[k] = date
        kept.append((date, w, n, addr, permit))

    print(f"  unmapped to a ward: {unmapped} ({unmapped/len(rows)*100:.2f}%)")
    print(f"  collapsed {dropped} staged duplicates")
    print("  classification: " + ", ".join(f"{k} {v}" for k, v in cats.most_common()))

    by_ward_year = collections.defaultdict(lambda: collections.defaultdict(int))
    sfh_by_ward_year = collections.defaultdict(lambda: collections.defaultdict(int))
    mfh_by_ward_year = collections.defaultdict(lambda: collections.defaultdict(int))
    permits_by_ward_year = collections.defaultdict(lambda: collections.defaultdict(int))
    projects = collections.defaultdict(list)
    for date, w, n, addr, permit in kept:
        if w is None:
            continue
        y = date[:4]
        permits_by_ward_year[w][y] += 1
        if n:
            by_ward_year[w][y] += n
            # A permit for exactly one unit is a house; two or more is a
            # multi-family building. Split on the unit count rather than the
            # classifier's own label, which also calls some 1-unit buildings
            # "multi-unit" simply because the count was stated explicitly.
            if n == 1:
                sfh_by_ward_year[w][y] += n
            else:
                mfh_by_ward_year[w][y] += n
            if n >= PROJECT_MIN_UNITS:
                projects[w].append({"d": date, "u": n, "a": title_case(addr), "p": permit})

    last_date = max(rec[0] for rec in kept)
    years = sorted({rec[0][:4] for rec in kept})
    payload = {
        "meta": {
            "source": "Chicago Building Permits (ydr8-5enu), PERMIT - NEW CONSTRUCTION",
            "firstYear": int(years[0]),
            "lastYear": int(years[-1]),
            "lastDate": last_date,
            "permits": len(rows),
            "unclassifiedShare": round(cats["unclear"] / len(rows), 4),
            "note": ("Gross new construction only — excludes conversions, "
                     "deconversions and demolitions. Wards are current (2023) "
                     "boundaries for every year."),
        },
        "units": {str(w): dict(by_ward_year[w]) for w in sorted(by_ward_year)},
        "sfh": {str(w): dict(sfh_by_ward_year[w]) for w in sorted(sfh_by_ward_year)},
        "mfh": {str(w): dict(mfh_by_ward_year[w]) for w in sorted(mfh_by_ward_year)},
        "permits": {str(w): dict(permits_by_ward_year[w]) for w in sorted(permits_by_ward_year)},
        "projectMinUnits": PROJECT_MIN_UNITS,
        "projects": {
            str(w): sorted(projects[w], key=lambda x: -x["u"]) for w in sorted(projects)
        },
    }
    # Guard against an upstream change silently gutting the data. Permits only
    # accumulate, so a materially smaller pull means the API, the permit_type
    # label or the schema moved — not that Chicago stopped building.
    if os.path.exists(OUT):
        try:
            prev = json.load(open(OUT))
            prev_units = sum(sum(v.values()) for v in prev.get("units", {}).values())
            new_units = sum(sum(v.values()) for v in by_ward_year.values())
            prev_permits = prev.get("meta", {}).get("permits", 0)
            for label, old, new in (("units", prev_units, new_units),
                                    ("permits", prev_permits, len(rows))):
                if old and new < old * 0.9:
                    print(f"  REFUSING TO WRITE: {label} fell from {old:,} to {new:,} "
                          f"({new / old * 100:.0f}% of previous). Check the upstream dataset.",
                          file=sys.stderr)
                    sys.exit(1)
        except (ValueError, KeyError) as e:
            print(f"  note: could not compare against existing output ({e})")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(payload, open(OUT, "w"), indent=1)
    tot = sum(sum(v.values()) for v in by_ward_year.values())
    print(f"  wrote {OUT}: {len(by_ward_year)} wards, {years[0]}-{years[-1]}, {tot:,} units")


if __name__ == "__main__":
    main()
