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

   The text says "units", "D.U." or "apartments" more or less interchangeably —
   "NEW CONSTRUCTION 12 STORY RESIDENTIAL. 303 RESIDENTIAL APARTMENTS" — so all
   three are read. Counting only the first two left whole towers unclassified.

2. STAGED PERMITS. A large project pulls permits in sequence — caissons, then
   foundation, then full building — each repeating the project's unit count.
   One 339-unit tower appeared three times. Deduplicated on address + unit
   count within a two-year window.

3. THE PERMIT TYPE LIES. Chicago sometimes files a brand-new building as
   PERMIT - RENOVATION/ALTERATION. The Thompson, at 150 N Ashland, has a
   renovation-typed permit reading "FULL BUILDING PERMIT FOR PROPOSED NEW 12
   STORY RESIDENTIAL"; the only new-construction-typed permits at that address
   are a tower crane and a hoist. So renovation permits whose text describes
   new construction are fetched too. Genuine conversions are NOT included —
   this remains a gross new-construction count — and are a separate question.

4. CONVERSIONS ARE A SEPARATE SERIES. An existing building becoming housing
   adds real supply but is not new construction, so it is counted apart rather
   than folded in. Only permits whose text states the change explicitly are
   read: a before-and-after pair ("convert 5 D.U. to 6 D.U."), an explicit
   addition ("to provide 320 new apartments"), or a non-residential building
   converting to N units. Deconversions are the same machinery with the sign
   flipped, so losses come free.

   These are FLOORS. A conversion that never states a count is invisible here,
   and demolition losses are not counted at all.

   Order matters: test for deconversion wording first, or "deconversion of 3
   dwelling units to original 2" reads as +3. A permit whose RESULT is a hotel
   is not housing. And where a permit states a prior count and says "to create
   N" without "add" or "new", N is the total, not the increment.

5. WARD BOUNDARIES MOVED. Wards were redrawn in 2015 and 2023, so a 2012 permit
   carries a ward number that is not today's geography. Every permit is
   reassigned to its current ward by point-in-polygon on its coordinates.
   Validated at 99.87% against 2024+ permits, whose stated ward is already
   current.

   The stated ward is kept too, as a second set of tables ("atIssue"). It is
   the ward as drawn when the permit was issued — agreement with today's map
   is ~70% for 2010-14 and ~80% for 2015-22, stepping up at each redistricting
   — so it answers "whose ward was this at the time" rather than "where is
   this now". The site offers both.

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
# Permits say "apartments" as often as "units"; TAIL deliberately excludes the
# word because "APARTMENT BUILDING" alone is not a count, so it gets its own
# pattern requiring a preceding number.
APARTMENTS = re.compile(r"\b(\d{1,4})\s+(?:NEW\s+)?(?:RESIDENTIAL\s+)?APARTMENTS?\b")

# ---- conversions -------------------------------------------------------

_U = r"(?:D\.?\s?U\.?S?|DWELLING\s+UNITS?|UNITS?|APARTMENTS?)"
_N = r"\(?(\d{1,4})\)?"
#: "convert 5 D.U. to 6 D.U." — the only unambiguous form, gain or loss
BEFORE_AFTER = re.compile(
    rf"(?:FROM|CONVERT\w*|DECONVERT\w*)\s+(?:EXISTING\s+|EXSTG\s+)?{_N}\s*{_U}"
    rf"[^.]{{0,50}}?\b(?:TO|INTO)\s+(?:A\s+)?{_N}\s*{_U}")
DECONVERSION = re.compile(r"\bDECONVER")
#: "...3 dwelling units to a single family residence"
TO_SINGLE = re.compile(
    rf"(?:CONVERT\w*|DECONVERT\w*|FROM)[^.]{{0,60}}?{_N}\s*{_U}"
    rf"[^.]{{0,40}}?\b(?:TO|INTO)\s+(?:A\s+)?(?:ONE|1|SINGLE)\b")
ADDS = re.compile(rf"(?:\bADD|ADDITION OF|TO PROVIDE|TO CREATE|RESULTING IN)\s+{_N}"
                  rf"\s*(?:NEW\s+)?(?:RESIDENTIAL\s+)?{_U}")
#: distinguishes "add N" (an increment) from "to create N" (possibly a total)
ADD_VERB = re.compile(r"\b(?:ADD|ADDITION OF|ADDING)\b")
ADDS_NEW = re.compile(rf"(?:TO PROVIDE|TO CREATE|RESULTING IN)\s+{_N}\s*NEW\s")
PRIOR_COUNT = re.compile(rf"EXISTING\s+{_N}\s*{_U}|{_N}\s+EXISTING\s*{_U}")
#: a building that was not housing before, so its whole unit count is new
NONRES_SOURCE = re.compile(
    r"\b(OFFICE|WAREHOUSE|FACTORY|SCHOOL|CHURCH|HOTEL|MOTEL|NURSING HOME|HOSPITAL|"
    r"COMMERCIAL|INDUSTRIAL|RETAIL|BANK|THEATER|THEATRE|YMCA|CONVENT|RECTORY|"
    r"MANUFACTURING|STORAGE|FUNERAL|CLUB)\b")
#: hotel rooms are not dwelling units, so a hotel as the RESULT is not housing
HOTEL_RESULT = re.compile(r"(?:INTO|TO)\s+(?:A\s+)?(?:NEW\s+)?(?:BOUTIQUE\s+)?(?:HOTEL|MOTEL|HOSTEL)")
CONVERTS_TO = re.compile(rf"CONVER\w+[^.]{{0,120}}?{_N}[- ]?{_U}")


def net_conversion(desc):
    """
    Net dwelling units created (+) or lost (-) by converting an existing
    building, or None where the permit does not say plainly enough to tell.
    """
    t = (desc or "").upper()
    if REVISION.search(t):
        return None

    m = BEFORE_AFTER.search(t)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if 0 < a <= 500 and 0 < b <= 500:
            return b - a

    # deconversion wording must be handled before any gain pattern, or
    # "deconversion of 3 dwelling units to original 2" scores +3
    decon = DECONVERSION.search(t)
    m = TO_SINGLE.search(t)
    if m and (decon or SFR.search(t)):
        a = int(m.group(1))
        if 1 < a <= 20:
            return 1 - a
    if decon:
        return None

    m = ADDS.search(t)
    if m:
        n = int(m.group(1))
        if 0 < n <= 500:
            prior = PRIOR_COUNT.search(t)
            if prior and not ADD_VERB.search(t) and not ADDS_NEW.search(t):
                # "to create N" alongside an existing count means N is the total
                p = int(prior.group(1) or prior.group(2))
                return n - p if 0 < p <= 500 else None
            return n

    if NONRES_SOURCE.search(t) and not EXISTING.search(t) and not HOTEL_RESULT.search(t):
        m = CONVERTS_TO.search(t)
        if m:
            n = int(m.group(1))
            if 0 < n <= 2000:
                return n
    return None


def extract_units(t):
    """Units for the project, or None. Prefers an explicit total; never sums —
    '32 UNIT BUILDING (INCL. 6 EFFICIENCY UNITS)' is 32, not 38."""
    m = TOTAL.search(t)
    if m:
        n = int(m.group(1) or m.group(2))
        if 1 <= n <= 1000:
            return n
    nums = [int(x) for x in NUM.findall(t) if 1 <= int(x) <= 1000]
    m = APARTMENTS.search(t)
    if m and 1 <= int(m.group(1)) <= 2000:
        nums.append(int(m.group(1)))
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
        "$select": ("permit_,permit_type,issue_date,ward,reported_cost,work_description,"
                    "street_number,street_direction,street_name,latitude,longitude"),
        "$where": (
            f"issue_date>='{START_YEAR}-01-01' AND ("
            "permit_type='PERMIT - NEW CONSTRUCTION' OR "
            # new buildings mis-typed as renovations — see note 3 above
            "(permit_type='PERMIT - RENOVATION/ALTERATION' AND ("
            "upper(work_description) like '%NEW CONSTRUCTION%' OR "
            "upper(work_description) like '%PROPOSED NEW%' OR "
            "upper(work_description) like '%ERECT NEW%' OR "
            "upper(work_description) like '%CONSTRUCTION OF A NEW%' OR "
            # conversions and deconversions of existing buildings
            "upper(work_description) like '%DWELLING%' OR "
            "upper(work_description) like '%D.U.%' OR "
            "upper(work_description) like '% UNIT%' OR "
            "upper(work_description) like '%APARTMENT%' OR "
            "upper(work_description) like '%RESIDENTIAL%')))"),
        "$limit": 120000,
        "$order": "issue_date",
    })
    json.dump(rows, open(CACHE, "w"))
    return rows


def stated_ward(r):
    """Ward as recorded on the permit — the map in force when it was issued."""
    try:
        w = int(str(r.get("ward") or "").strip())
    except ValueError:
        return None
    return w if 1 <= w <= 50 else None


def aggregate(kept, ward_index):
    """Per-ward, per-year tables keyed on whichever ward is at `ward_index`."""
    dd = lambda: collections.defaultdict(lambda: collections.defaultdict(int))
    units, sfh, mfh, permits = dd(), dd(), dd(), dd()
    projects = collections.defaultdict(list)
    for rec in kept:
        date, n, addr, permit = rec[0], rec[3], rec[4], rec[5]
        w = rec[ward_index]
        if w is None:
            continue
        y = date[:4]
        permits[w][y] += 1
        if n:
            units[w][y] += n
            # A permit for exactly one unit is a house; two or more is a
            # multi-family building. Split on the unit count rather than the
            # classifier's own label, which also calls some 1-unit buildings
            # "multi-unit" simply because the count was stated explicitly.
            if n == 1:
                sfh[w][y] += n
            else:
                mfh[w][y] += n
            if n >= PROJECT_MIN_UNITS:
                projects[w].append({"d": date, "u": n, "a": title_case(addr), "p": permit})
    return {"units": units, "sfh": sfh, "mfh": mfh, "permits": permits, "projects": projects}


def tables(agg):
    """JSON-ready form of aggregate() output."""
    out = {k: {str(w): dict(agg[k][w]) for w in sorted(agg[k])}
           for k in ("units", "sfh", "mfh", "permits")}
    out["projects"] = {str(w): sorted(agg["projects"][w], key=lambda x: -x["u"])
                       for w in sorted(agg["projects"])}
    return out


def main():
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree

    rows = fetch_permits()
    print(f"  {len(rows):,} permits fetched since {START_YEAR}")

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

    # A permit is new construction if it is typed that way, or if its text
    # describes a new building despite a renovation type. Everything else that
    # reached the fetch is a conversion candidate.
    NEWISH = re.compile(r"NEW CONSTRUCTION|PROPOSED NEW|ERECT NEW|CONSTRUCTION OF A NEW")

    def is_new_build(r):
        if (r.get("permit_type") or "") == "PERMIT - NEW CONSTRUCTION":
            return True
        return bool(NEWISH.search((r.get("work_description") or "").upper()))

    newbuild = [r for r in rows if is_new_build(r)]
    convrows = [r for r in rows if not is_new_build(r)]
    print(f"  {len(newbuild):,} new-construction permits, "
          f"{len(convrows):,} conversion candidates")

    recs, unmapped, cats = [], 0, collections.Counter()
    for r in newbuild:
        cat, n = classify(r.get("work_description"))
        cats[cat] += 1
        w = current_ward(r)
        if w is None:
            unmapped += 1
        sw = stated_ward(r)
        addr = " ".join(str(r.get(f) or "").strip().upper()
                        for f in ("street_number", "street_direction", "street_name"))
        recs.append((r.get("issue_date", "")[:10], w, sw, n, addr, r.get("permit_")))

    # collapse staged permits for one project
    recs.sort(key=lambda x: x[0])
    seen, kept, dropped = {}, [], 0
    for date, w, sw, n, addr, permit in recs:
        if n:
            k = (addr, n)
            prev = seen.get(k)
            if prev and (datetime.date.fromisoformat(date)
                         - datetime.date.fromisoformat(prev)).days <= 730:
                dropped += 1
                continue
            seen[k] = date
        kept.append((date, w, sw, n, addr, permit))

    print(f"  unmapped to a ward: {unmapped} ({unmapped/len(rows)*100:.2f}%)")
    print(f"  collapsed {dropped} staged duplicates")
    print("  classification: " + ", ".join(f"{k} {v}" for k, v in cats.most_common()))

    current = aggregate(kept, ward_index=1)
    at_issue = aggregate(kept, ward_index=2)
    by_ward_year = current["units"]
    moved = sum(1 for rec in kept if rec[1] and rec[2] and rec[1] != rec[2])
    print(f"  stated ward differs from current ward on {moved:,} of {len(kept):,} "
          f"permits ({moved / len(kept) * 100:.1f}%)")

    # ---- conversions, kept as their own series ---------------------------
    crecs = []
    for r in convrows:
        n = net_conversion(r.get("work_description"))
        if not n:
            continue
        a = " ".join(str(r.get(f) or "").strip().upper()
                     for f in ("street_number", "street_direction", "street_name"))
        crecs.append((r.get("issue_date", "")[:10], current_ward(r), n, a))
    crecs.sort(key=lambda x: x[0])
    cseen, ckept = {}, 0
    gained = collections.defaultdict(lambda: collections.defaultdict(int))
    lost = collections.defaultdict(lambda: collections.defaultdict(int))
    for date, w, n, a in crecs:
        k = (a, n)
        prev = cseen.get(k)
        if prev and (datetime.date.fromisoformat(date)
                     - datetime.date.fromisoformat(prev)).days <= 730:
            continue
        cseen[k] = date
        if w is None:
            continue
        ckept += 1
        y = date[:4]
        if n > 0:
            gained[w][y] += n
        else:
            lost[w][y] += -n
    tg = sum(sum(v.values()) for v in gained.values())
    tl = sum(sum(v.values()) for v in lost.values())
    print(f"  conversions: {ckept:,} permits, +{tg:,} units gained, "
          f"-{tl:,} lost, net {tg - tl:+,}")

    last_date = max(rec[0] for rec in kept)
    years = sorted({rec[0][:4] for rec in kept})
    payload = {
        "meta": {
            "source": "Chicago Building Permits (ydr8-5enu)",
            "firstYear": int(years[0]),
            "lastYear": int(years[-1]),
            "lastDate": last_date,
            "permits": len(newbuild),
            # every permit pulled, new construction and renovation together
            "permitsFetched": len(rows),
            "permitTypes": ["PERMIT - NEW CONSTRUCTION", "PERMIT - RENOVATION/ALTERATION"],
            "unclassifiedShare": round(cats["unclear"] / len(newbuild), 4),
            "note": ("Gross new construction only — excludes conversions, "
                     "deconversions and demolitions. Top-level tables key on "
                     "current (2023) ward boundaries for every year; atIssue "
                     "keys on the ward as stated on the permit."),
        },
        "projectMinUnits": PROJECT_MIN_UNITS,
        "conversions": {
            "note": ("Net dwelling units created or lost by converting existing "
                     "buildings, where the permit says so plainly. A floor, not a "
                     "total: conversions that state no unit count are invisible, "
                     "and demolitions are not counted here."),
            "gained": {str(w): dict(gained[w]) for w in sorted(gained)},
            "lost": {str(w): dict(lost[w]) for w in sorted(lost)},
        },
        **tables(current),
        "atIssue": tables(at_issue),
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
                                    ("permits", prev_permits, len(newbuild))):
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
