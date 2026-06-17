// Side-panel views: national overview and per-state detail with local rankings.

import { h, clear, fmtSigned, fmtPop, dirOf, makeColorScale } from "./util.js";
import { trendChart } from "./charts.js";

function changeItem(label, val) {
  const cls = val > 0 ? "up" : val < 0 ? "down" : "";
  return h(
    "div",
    { class: "change-item" },
    label,
    h("b", { class: cls }, `${fmtSigned(val)} pts`)
  );
}

export function renderNational(panel, { national }) {
  const dir = dirOf(national.direction);
  clear(panel);

  panel.append(
    h("div", { class: "panel-eyebrow" }, "National overview"),
    h(
      "div",
      { class: "stat-hero" },
      h(
        "div",
        { class: "stat-value num" },
        national.latestRate.toFixed(1),
        h("span", { class: "unit" }, "%")
      ),
      h(
        "div",
        { class: "stat-side" },
        h(
          "span",
          { class: `chip ${dir.cls}` },
          h("span", { class: "arrow" }, dir.arrow),
          dir.label
        ),
        h("span", { class: "chip-meta" }, `adults with obesity · ${national.latestYear}`)
      )
    ),
    h("p", { class: "summary" }, national.summary)
  );

  const chartCard = h(
    "div",
    { class: "chart-card" },
    h(
      "div",
      { class: "chart-head" },
      h("h3", null, "National trend"),
      h("span", { class: "src" }, `CDC BRFSS · ${national.firstYear}–${national.latestYear}`)
    ),
    h("div", { class: "chart" })
  );
  panel.append(chartCard);
  trendChart(chartCard.querySelector(".chart"), national.series, { accent: dir.color });
  chartCard.append(
    h(
      "div",
      { class: "change-row" },
      changeItem(`Since ${national.firstYear}`, national.changeSincestart),
      changeItem("Year over year", national.yoyChange)
    )
  );

  panel.append(
    h("p", { class: "hint" }, "Hover a state for its rate · click any state to drill in.")
  );
}

export function renderState(panel, { state, local, national, total, onBack }) {
  const dir = dirOf(state.direction);
  const vs = state.vsNational;
  clear(panel);

  panel.append(
    h("button", { class: "back-btn", onClick: onBack }, "‹ National overview"),
    h(
      "div",
      { class: "state-title" },
      h("h2", null, state.name),
      h("span", { class: "rank-badge" }, `#${state.rank} of ${total}`)
    ),
    h(
      "div",
      { class: "stat-hero" },
      h(
        "div",
        { class: "stat-value num" },
        state.rate.toFixed(1),
        h("span", { class: "unit" }, "%")
      ),
      h(
        "div",
        { class: "stat-side" },
        h(
          "span",
          { class: `chip ${dir.cls}` },
          h("span", { class: "arrow" }, dir.arrow),
          `${dir.label} since ${state.firstYear}`
        ),
        h(
          "span",
          { class: "chip-meta" },
          `${fmtSigned(vs)} pts vs U.S. avg (${national.latestRate}%)`
        )
      )
    )
  );

  const chartCard = h(
    "div",
    { class: "chart-card" },
    h(
      "div",
      { class: "chart-head" },
      h("h3", null, `${state.abbr} obesity trend`),
      h("span", { class: "src" }, `CDC BRFSS · ${state.firstYear}–${state.year}`)
    ),
    h("div", { class: "chart" })
  );
  panel.append(chartCard);
  trendChart(chartCard.querySelector(".chart"), state.series, { accent: dir.color });
  chartCard.append(
    h(
      "div",
      { class: "change-row" },
      changeItem(`Since ${state.firstYear}`, state.change),
      changeItem("vs U.S. average", state.vsNational)
    )
  );

  const ci =
    state.ciLow != null && state.ciHigh != null
      ? ` · 95% CI ${state.ciLow}–${state.ciHigh}%`
      : "";
  panel.append(
    h("p", { class: "src-line" }, `Self-reported survey estimate${ci} · ${state.year}`)
  );

  panel.append(buildRankings(state, local));
}

function buildRankings(state, local) {
  const wrap = h("div", { class: "rankings" });
  const counties = (local && local.counties) || [];
  const places = (local && local.places) || [];

  if (!counties.length && !places.length) {
    wrap.append(
      h("p", { class: "rank-empty" }, "No local CDC PLACES data available for this state.")
    );
    return wrap;
  }

  let tab = counties.length ? "counties" : "cities";
  let pop = 10000;

  const tabCounties = h(
    "button",
    { class: "rank-tab", onClick: () => set("counties") },
    "Counties ",
    h("span", { class: "cnt" }, `(${counties.length})`)
  );
  const tabCities = h(
    "button",
    { class: "rank-tab", onClick: () => set("cities") },
    "Cities ",
    h("span", { class: "cnt" }, `(${places.length})`)
  );
  const tabs = h("div", { class: "rank-tabs" }, tabCounties, tabCities);

  const toolbar = h("div", { class: "rank-toolbar" });
  const list = h("div", { class: "rank-list" });
  const srcLine = h("p", { class: "src-line" });
  wrap.append(
    h("div", { class: "panel-eyebrow", style: "margin-top:4px" }, "Local rankings"),
    tabs,
    toolbar,
    list,
    srcLine
  );

  const popOptions = [
    { label: "1k+", v: 1000 },
    { label: "10k+", v: 10000 },
    { label: "50k+", v: 50000 },
  ];
  const set = (t) => ((tab = t), render());
  const setPop = (v) => ((pop = v), render());

  function render() {
    tabCounties.classList.toggle("active", tab === "counties");
    tabCities.classList.toggle("active", tab === "cities");
    clear(toolbar);
    clear(list);

    if (tab === "counties") {
      toolbar.append(
        h("span", { class: "rank-caption" }, `${counties.length} counties · highest first`)
      );
      renderRows(
        list,
        counties.map((c) => ({ name: `${c.name} County`, rate: c.rate, rank: c.rank }))
      );
      srcLine.textContent = `CDC PLACES · model-based county estimate · ${local.sourceYear}`;
    } else {
      const filtered = places.filter((p) => (p.population || 0) >= pop);
      toolbar.append(
        h("span", { class: "rank-caption" }, `${filtered.length} places · pop ${fmtPop(pop)}+`),
        h(
          "div",
          { class: "popfilter" },
          ...popOptions.map((o) =>
            h("button", { class: o.v === pop ? "active" : "", onClick: () => setPop(o.v) }, o.label)
          )
        )
      );
      if (!filtered.length) {
        list.append(
          h("p", { class: "rank-empty" }, "No places this size in the ranked set — try a smaller population.")
        );
      } else {
        renderRows(
          list,
          filtered.map((p, i) => ({ name: p.name, pop: p.population, rate: p.rate, rank: i + 1 }))
        );
      }
      srcLine.textContent = `CDC PLACES · model-based city/place estimate · ${local.sourceYear}`;
    }
  }

  render();
  return wrap;
}

function renderRows(list, items) {
  if (!items.length) return;
  // Local color + width scale: encode within-list variation (rates here often
  // exceed the state-level color domain, so a shared scale would flatten them).
  const max = items[0].rate;
  const min = items[items.length - 1].rate;
  const span = Math.max(max - min, 0.1);
  const color = makeColorScale([min - span * 0.15, max]);
  for (const it of items) {
    const w = 26 + 74 * ((it.rate - min) / span);
    list.append(
      h(
        "div",
        { class: "rank-row" },
        h("span", { class: "rank-num num" }, it.rank),
        h(
          "div",
          null,
          h(
            "div",
            { class: "rank-name" },
            it.name,
            it.pop != null ? h("span", { class: "rank-pop" }, `  · ${fmtPop(it.pop)}`) : null
          ),
          h(
            "div",
            { class: "rank-bar" },
            h("span", { style: `width:${w}%;background:${color(it.rate)}` })
          )
        ),
        h("span", { class: "rank-val num" }, it.rate.toFixed(1) + "%")
      )
    );
  }
}
