# U.S. Obesity Tracker

An interactive public dashboard of **adult obesity across the United States**, built
entirely on trusted CDC public-health data. Open the site and you get a heat map of
every state, national and state-level trend charts, a plain-language read on whether
obesity is rising or falling, and ranked county and city tables when you drill into a
state.

It is a **website**, not an app, and it is intentionally a *zero-build static site*:
plain HTML + CSS + vanilla ES-module JavaScript, with [D3](https://d3js.org/) vendored
locally. There is no backend and no framework to install — any static host (including
GitHub Pages) can serve it directly.

> **Honesty note.** Public-health obesity data is published per *reporting year*, not
> in real time. This dashboard always shows the **latest available year** and labels the
> source and year on every major stat. State/national numbers and local numbers come
> from two different CDC programs with different methods and vintages (see below), so
> they are labeled separately and never presented as the same measurement.

## Data sources (all CDC)

| Layer | Source | Dataset | Method | Latest |
|------|--------|---------|--------|--------|
| National & state rates + trends | **CDC BRFSS** — Nutrition, Physical Activity & Obesity | [`hn4x-zwk7`](https://data.cdc.gov/d/hn4x-zwk7) | Self-reported telephone survey, directly weighted | 2024 |
| County rankings | **CDC PLACES** — County Data (GIS-friendly) | [`i46a-9kgh`](https://data.cdc.gov/d/i46a-9kgh) | Model-based small-area estimate | 2023 source |
| City / place rankings | **CDC PLACES** — Place Data | [`eav7-hnsx`](https://data.cdc.gov/d/eav7-hnsx) | Model-based small-area estimate | 2023 source |

Everything uses the same **crude prevalence** definition — adults aged 18+ with
BMI ≥ 30 — so the layers are comparable in definition. But BRFSS is a *direct survey*
while PLACES is a *statistical model* of small areas, and PLACES reflects an earlier
source year. The UI tags each accordingly.

## Run it locally

No build step. Just serve the folder over HTTP (browsers block `fetch()` of local JSON
over `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Refresh the data

A single Python script (standard library only — no `pip install`) pulls from the CDC
Socrata APIs and writes the normalized JSON the site reads:

```bash
python3 scripts/fetch_data.py
```

It produces:

```
data/national.json          national trend + summary (BRFSS)
data/states.json            per-state latest rate, rank, full trend series (BRFSS)
data/local/<ABBR>.json      county + city obesity rankings per state (PLACES)
data/meta.json              sources, fetch date, color domain, disclaimers
data/us-states-10m.json     US states TopoJSON for the map (us-atlas)
```

Re-running it picks up new CDC releases automatically (the place year is detected, not
hard-coded). Tiny places (population < 1,000) are excluded from city rankings because
their model estimates have very wide confidence intervals; population is shown on every
city row and a population filter (1k / 10k / 50k) keeps the "most obese cities" list
meaningful.

## Deploy (GitHub Pages)

The repo is already Pages-ready (`index.html` at the root, a `.nojekyll` file so JSON
and folders are served verbatim). In the repo settings, set **Pages → Deploy from a
branch → `main` / root**.

## Project layout

```
index.html              markup + layout
assets/css/styles.css   dashboard theme
assets/js/
  main.js               orchestration: load data, wire map ↔ panel
  data.js               static JSON loaders
  map.js                D3 choropleth (adaptive projection)
  charts.js             stock-style trend chart (area + hover readout)
  detail.js             national overview + state detail + rankings
  util.js               formatting, color scale, DOM helpers
vendor/                 d3.min.js, topojson.min.js (vendored, no CDN at runtime)
data/                   generated CDC data (committed)
scripts/fetch_data.py   the data pipeline
```

## Caveats

- **Not real-time.** Figures reflect the latest CDC reporting year.
- **Self-report bias.** BRFSS height/weight are self-reported, which tends to
  *under*-estimate obesity versus measured data.
- **Modeled local values.** County and city numbers are PLACES model outputs, not direct
  local measurements; small places carry wide uncertainty.

Data © CDC, used under its open-data terms. This project is for public information and
is not medical advice.
