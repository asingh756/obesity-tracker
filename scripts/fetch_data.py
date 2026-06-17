#!/usr/bin/env python3
"""
fetch_data.py - Build normalized obesity datasets for the U.S. Obesity Tracker.

Pulls from CDC open data (data.cdc.gov, Socrata) using only the Python standard
library, normalizes it, and writes the static JSON files the website loads:

  data/national.json        National adult obesity trend (BRFSS, 2011 -> latest)
  data/states.json          Per-state latest rate + rank + full trend series
  data/local/<ABBR>.json    County + city/place obesity rankings (PLACES)
  data/meta.json            Sources, fetch date, color domain, disclaimers
  data/us-states-10m.json   US states TopoJSON for the choropleth (us-atlas)

Sources (all crude, self-reported BMI definition for comparability):
  BRFSS  hn4x-zwk7  Nutrition, Physical Activity, and Obesity (direct survey)
  PLACES i46a-9kgh  County obesity, GIS-friendly  (model-based small-area est.)
  PLACES eav7-hnsx  Place / city obesity          (model-based small-area est.)

State + national figures are a direct self-reported survey (BRFSS). County and
city figures are MODEL-BASED estimates (PLACES) and reflect an earlier source
year, so the site labels them distinctly and never treats them as the same
vintage.

Run:  python3 scripts/fetch_data.py
"""

import json
import os
import sys
import urllib.request
import urllib.parse
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
LOCAL = os.path.join(DATA, "local")

BASE = "https://data.cdc.gov/resource/"
OBESITY_Q = "Percent of adults aged 18 years and older who have obesity"
TODAY = date.today().isoformat()

# Min population for a "place" to be eligible for the city ranking. Tiny places
# (a few hundred people) have very wide confidence intervals and produce extreme
# outliers, so we drop them from the ranking but still surface population in the
# UI so the numbers stay honest.
MIN_PLACE_POP = 1000
MAX_PLACES_PER_STATE = 300

# Dataset ids
DS_BRFSS = "hn4x-zwk7"
DS_PLACES_COUNTY = "i46a-9kgh"
DS_PLACES_PLACE = "eav7-hnsx"

# 50 states + DC -> (FIPS, full name). FIPS is used to join data to the map
# geometries (us-atlas uses 2-digit state FIPS ids).
STATES = {
    "AL": ("01", "Alabama"), "AK": ("02", "Alaska"), "AZ": ("04", "Arizona"),
    "AR": ("05", "Arkansas"), "CA": ("06", "California"), "CO": ("08", "Colorado"),
    "CT": ("09", "Connecticut"), "DE": ("10", "Delaware"),
    "DC": ("11", "District of Columbia"), "FL": ("12", "Florida"),
    "GA": ("13", "Georgia"), "HI": ("15", "Hawaii"), "ID": ("16", "Idaho"),
    "IL": ("17", "Illinois"), "IN": ("18", "Indiana"), "IA": ("19", "Iowa"),
    "KS": ("20", "Kansas"), "KY": ("21", "Kentucky"), "LA": ("22", "Louisiana"),
    "ME": ("23", "Maine"), "MD": ("24", "Maryland"), "MA": ("25", "Massachusetts"),
    "MI": ("26", "Michigan"), "MN": ("27", "Minnesota"), "MS": ("28", "Mississippi"),
    "MO": ("29", "Missouri"), "MT": ("30", "Montana"), "NE": ("31", "Nebraska"),
    "NV": ("32", "Nevada"), "NH": ("33", "New Hampshire"), "NJ": ("34", "New Jersey"),
    "NM": ("35", "New Mexico"), "NY": ("36", "New York"),
    "NC": ("37", "North Carolina"), "ND": ("38", "North Dakota"), "OH": ("39", "Ohio"),
    "OK": ("40", "Oklahoma"), "OR": ("41", "Oregon"), "PA": ("42", "Pennsylvania"),
    "RI": ("44", "Rhode Island"), "SC": ("45", "South Carolina"),
    "SD": ("46", "South Dakota"), "TN": ("47", "Tennessee"), "TX": ("48", "Texas"),
    "UT": ("49", "Utah"), "VT": ("50", "Vermont"), "VA": ("51", "Virginia"),
    "WA": ("53", "Washington"), "WV": ("54", "West Virginia"),
    "WI": ("55", "Wisconsin"), "WY": ("56", "Wyoming"),
}


# --------------------------------------------------------------------------- #
# HTTP helpers
# --------------------------------------------------------------------------- #
def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "obesity-tracker/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def socrata(dataset, params, paginate=False, page_size=25000):
    """Fetch Socrata JSON. With paginate=True, walk $offset until drained."""
    if not paginate:
        url = BASE + dataset + ".json?" + urllib.parse.urlencode(params)
        return _get(url)
    out, offset = [], 0
    while True:
        p = dict(params, **{"$limit": page_size, "$offset": offset})
        url = BASE + dataset + ".json?" + urllib.parse.urlencode(p)
        chunk = _get(url)
        out.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return out


def fnum(x):
    """Parse a Socrata string into a float, or None if missing/blank."""
    try:
        if x is None or x == "":
            return None
        return float(x)
    except (TypeError, ValueError):
        return None


def direction(change):
    if change > 0.3:
        return "rising"
    if change < -0.3:
        return "falling"
    return "stable"


# --------------------------------------------------------------------------- #
# BRFSS: national + state trends
# --------------------------------------------------------------------------- #
def build_state_and_national():
    print("[1/4] BRFSS state + national obesity trends ...")
    rows = socrata(DS_BRFSS, {
        "stratificationcategory1": "Total",
        "question": OBESITY_Q,
        "$select": "yearstart,locationabbr,locationdesc,data_value,"
                   "low_confidence_limit,high_confidence_limit,sample_size",
        "$limit": 5000,
    })

    # abbr -> { year(int): {rate, lo, hi, n} }
    by_loc = defaultdict(dict)
    for r in rows:
        ab = r.get("locationabbr")
        val = fnum(r.get("data_value"))
        yr = r.get("yearstart")
        if val is None or not yr:
            continue
        by_loc[ab][int(yr)] = {
            "rate": round(val, 1),
            "lo": fnum(r.get("low_confidence_limit")),
            "hi": fnum(r.get("high_confidence_limit")),
            "n": int(fnum(r.get("sample_size")) or 0),
        }

    def series_of(ab):
        d = by_loc.get(ab, {})
        return [{"year": y, "rate": d[y]["rate"], "lo": d[y]["lo"], "hi": d[y]["hi"]}
                for y in sorted(d)]

    # ---- National --------------------------------------------------------- #
    nat = series_of("US")
    if not nat:
        sys.exit("ERROR: no national BRFSS obesity rows returned.")
    first, latest = nat[0], nat[-1]
    change = round(latest["rate"] - first["rate"], 1)
    yoy = round(latest["rate"] - nat[-2]["rate"], 1) if len(nat) > 1 else 0.0
    dir_word = direction(change)
    verb = {"rising": "risen", "falling": "fallen", "stable": "held roughly steady"}[dir_word]
    summary = (
        "U.S. adult obesity has {verb} from {a}% in {ay} to {b}% in {by} "
        "({sign}{chg} points over {span} years)."
    ).format(verb=verb, a=first["rate"], ay=first["year"], b=latest["rate"],
             by=latest["year"], sign="+" if change >= 0 else "", chg=change,
             span=latest["year"] - first["year"])

    national = {
        "source": "CDC BRFSS",
        "sourceLong": "CDC Behavioral Risk Factor Surveillance System - "
                      "Nutrition, Physical Activity, and Obesity",
        "datasetId": DS_BRFSS,
        "measure": "Adults aged 18+ with obesity (BMI >= 30), self-reported",
        "fetchedAt": TODAY,
        "latestYear": latest["year"], "latestRate": latest["rate"],
        "firstYear": first["year"], "firstRate": first["rate"],
        "changeSincestart": change, "yoyChange": yoy,
        "direction": dir_word, "summary": summary,
        "series": nat,
    }

    # ---- States ----------------------------------------------------------- #
    recs = []
    for ab, (fips, name) in STATES.items():
        s = series_of(ab)
        if not s:
            print("  ! no BRFSS series for %s" % ab)
            continue
        f, l = s[0], s[-1]
        chg = round(l["rate"] - f["rate"], 1)
        recs.append({
            "fips": fips, "abbr": ab, "name": name,
            "rate": l["rate"], "year": l["year"],
            "ciLow": l["lo"], "ciHigh": l["hi"],
            "firstYear": f["year"], "firstRate": f["rate"],
            "change": chg, "direction": direction(chg),
            "vsNational": round(l["rate"] - latest["rate"], 1),
            "series": s,
        })

    recs.sort(key=lambda r: -r["rate"])
    for i, r in enumerate(recs):
        r["rank"] = i + 1
    rates = [r["rate"] for r in recs]

    states = {
        "source": national["source"], "sourceLong": national["sourceLong"],
        "datasetId": DS_BRFSS, "measure": national["measure"],
        "fetchedAt": TODAY, "latestYear": latest["year"],
        "nationalRate": latest["rate"], "count": len(recs),
        "colorDomain": [min(rates), max(rates)],
        "states": recs,
    }

    write("national.json", national)
    write("states.json", states)
    print("  national %s%%(%s) | %d states | range %.1f-%.1f"
          % (latest["rate"], latest["year"], len(recs), min(rates), max(rates)))
    return national, states


# --------------------------------------------------------------------------- #
# PLACES: county + city/place rankings
# --------------------------------------------------------------------------- #
def latest_place_year():
    try:
        r = socrata(DS_PLACES_PLACE, {
            "measureid": "OBESITY", "$select": "year",
            "$order": "year DESC", "$limit": 1,
        })
        return r[0]["year"] if r else "2023"
    except Exception:
        return "2023"


def build_local():
    year = latest_place_year()
    print("[2/4] PLACES county obesity (%s) ..." % DS_PLACES_COUNTY)
    crows = socrata(DS_PLACES_COUNTY, {
        "$select": "stateabbr,countyname,countyfips,obesity_crudeprev,obesity_crude95ci",
        "$limit": 5000,
    }, paginate=True, page_size=5000)
    counties = defaultdict(list)
    for r in crows:
        ab = r.get("stateabbr")
        rate = fnum(r.get("obesity_crudeprev"))
        if ab in STATES and rate is not None:
            counties[ab].append({
                "name": r.get("countyname"), "fips": r.get("countyfips"),
                "rate": round(rate, 1), "ci": r.get("obesity_crude95ci"),
            })

    print("[3/4] PLACES place/city obesity (%s, year=%s) ..." % (DS_PLACES_PLACE, year))
    prows = socrata(DS_PLACES_PLACE, {
        "measureid": "OBESITY", "data_value_type": "Crude prevalence", "year": year,
        "$select": "stateabbr,locationname,locationid,data_value,totalpopulation,"
                   "low_confidence_limit,high_confidence_limit",
    }, paginate=True)
    places = defaultdict(list)
    for r in prows:
        ab = r.get("stateabbr")
        rate = fnum(r.get("data_value"))
        pop = fnum(r.get("totalpopulation"))
        if ab in STATES and rate is not None:
            places[ab].append({
                "name": r.get("locationname"), "fips": r.get("locationid"),
                "rate": round(rate, 1),
                "population": int(pop) if pop else None,
                "lo": fnum(r.get("low_confidence_limit")),
                "hi": fnum(r.get("high_confidence_limit")),
            })

    print("[4/4] writing per-state local files ...")
    os.makedirs(LOCAL, exist_ok=True)
    summary = {}
    for ab, (fips, name) in STATES.items():
        c = sorted(counties.get(ab, []), key=lambda x: -x["rate"])
        for i, row in enumerate(c):
            row["rank"] = i + 1
        p = [x for x in places.get(ab, []) if (x["population"] or 0) >= MIN_PLACE_POP]
        p.sort(key=lambda x: -x["rate"])
        p = p[:MAX_PLACES_PER_STATE]
        for i, row in enumerate(p):
            row["rank"] = i + 1
        write(os.path.join("local", ab + ".json"), {
            "state": ab, "stateName": name,
            "source": "CDC PLACES",
            "sourceLong": "CDC PLACES: Local Data for Better Health "
                          "(model-based estimates)",
            "datasetCounty": DS_PLACES_COUNTY, "datasetPlace": DS_PLACES_PLACE,
            "sourceYear": int(year), "fetchedAt": TODAY,
            "minPlacePopulation": MIN_PLACE_POP,
            "countyCount": len(c), "placeCount": len(p),
            "counties": c, "places": p,
        })
        summary[ab] = {"counties": len(c), "places": len(p)}
    print("  wrote %d state files" % len(STATES))
    return int(year), summary


# --------------------------------------------------------------------------- #
# Map geometry + meta
# --------------------------------------------------------------------------- #
def fetch_topojson():
    path = os.path.join(DATA, "us-states-10m.json")
    if os.path.exists(path):
        print("[map] us-states-10m.json already present, skipping download")
        return
    print("[map] downloading us-atlas states TopoJSON ...")
    topo = _get("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json")
    with open(path, "w") as f:
        json.dump(topo, f, separators=(",", ":"))


def write(rel, obj):
    path = os.path.join(DATA, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)


def main():
    os.makedirs(DATA, exist_ok=True)
    national, states = build_state_and_national()
    place_year, local_summary = build_local()
    fetch_topojson()

    write("meta.json", {
        "title": "U.S. Obesity Tracker",
        "fetchedAt": TODAY,
        "disclaimer": (
            "Obesity figures reflect the latest available reporting year from "
            "public health surveillance, not real-time data. State and national "
            "rates are self-reported survey estimates (CDC BRFSS); county and "
            "city rates are model-based small-area estimates (CDC PLACES) and "
            "reflect an earlier source year, so the two are labeled separately "
            "and should not be read as identical vintages."
        ),
        "state": {
            "source": states["source"], "sourceLong": states["sourceLong"],
            "datasetId": states["datasetId"], "latestYear": states["latestYear"],
            "url": "https://data.cdc.gov/d/" + DS_BRFSS,
        },
        "local": {
            "source": "CDC PLACES", "sourceYear": place_year,
            "countyDataset": DS_PLACES_COUNTY, "placeDataset": DS_PLACES_PLACE,
            "countyUrl": "https://data.cdc.gov/d/" + DS_PLACES_COUNTY,
            "placeUrl": "https://data.cdc.gov/d/" + DS_PLACES_PLACE,
        },
        "national": {
            "latestRate": national["latestRate"], "latestYear": national["latestYear"],
            "direction": national["direction"], "summary": national["summary"],
        },
        "colorDomain": states["colorDomain"],
    })
    print("\nDone. Data current as of %s (national %s%%, %d).\n"
          % (TODAY, national["latestRate"], national["latestYear"]))


if __name__ == "__main__":
    main()
