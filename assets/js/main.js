// Entry point: load data, render the map + national overview, wire interactions.

import { loadCore, loadLocal } from "./data.js";
import { makeColorScale, h, clear, fmtSigned, dirOf, clamp } from "./util.js";
import { renderMap } from "./map.js";
import { renderNational, renderState } from "./detail.js";

const $ = (id) => document.getElementById(id);

// Module scripts execute after deferred classic scripts, but poll defensively
// so we never touch d3/topojson before they exist.
async function whenReady() {
  while (typeof window.d3 === "undefined" || typeof window.topojson === "undefined") {
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function init() {
  await whenReady();

  let core;
  try {
    core = await loadCore();
  } catch (e) {
    console.error(e);
    $("map").innerHTML = "";
    $("side-panel").innerHTML =
      '<div class="loading">Couldn’t load data files. If you opened this page directly from disk, serve it over HTTP instead — e.g. <code>python3 -m http.server</code> in the project folder, then open the localhost URL.</div>';
    return;
  }

  const { meta, national, states, topo, byFips } = core;
  const total = states.count;
  const color = makeColorScale(states.colorDomain);

  // header / footer copy
  $("data-dates").innerHTML = `States <b>${meta.state.latestYear}</b> &middot; Local <b>${meta.local.sourceYear}</b>`;
  $("map-year").textContent = states.latestYear;
  $("foot-method").textContent = meta.disclaimer;
  $("foot-fine").innerHTML =
    `Built from CDC open data &middot; fetched ${meta.fetchedAt}. ` +
    "Obesity is defined as adults aged 18+ with BMI&nbsp;&ge;&nbsp;30. " +
    "This dashboard is for public information, not medical advice.";
  fillSources(meta);
  buildLegend($("legend"), color, national.latestRate);

  const tooltip = $("tooltip");
  let selected = null;

  const mapCtrl = renderMap($("map"), {
    topo,
    byFips,
    color,
    handlers: {
      hover: (s) => s && showTip(tooltip, s, total),
      move: (s, ev) => s && ev && moveTip(tooltip, ev),
      leave: () => hideTip(tooltip),
      select: (s) => s && selectState(s),
    },
  });

  function selectState(s) {
    selected = s;
    mapCtrl.select(s.fips);
    hideTip(tooltip);
    $("side-panel").innerHTML = '<div class="loading">Loading local data…</div>';
    loadLocal(s.abbr)
      .then((local) => {
        if (selected !== s) return; // user already moved on
        renderState($("side-panel"), { state: s, local, national, total, onBack: backToNational });
        $("side-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
      })
      .catch((err) => {
        console.error(err);
        if (selected !== s) return;
        renderState($("side-panel"), { state: s, local: null, national, total, onBack: backToNational });
      });
  }

  function backToNational() {
    selected = null;
    mapCtrl.clear();
    renderNational($("side-panel"), { national });
  }

  renderNational($("side-panel"), { national });
}

/* ---------- tooltip ---------- */
function showTip(tip, s, total) {
  const dir = dirOf(s.direction);
  tip.innerHTML =
    `<div class="tt-name">${s.name}</div>` +
    `<div class="tt-row"><span>Obesity</span><span class="tt-rate">${s.rate.toFixed(1)}%</span></div>` +
    `<div class="tt-row"><span>Rank</span><span>#${s.rank} of ${total}</span></div>` +
    `<div class="tt-row"><span>Since ${s.firstYear}</span><span>${fmtSigned(s.change)} pts ${dir.arrow}</span></div>` +
    `<div class="tt-hint">Click for detail →</div>`;
  tip.hidden = false;
}
function moveTip(tip, ev) {
  const pad = 14;
  const w = tip.offsetWidth;
  const ht = tip.offsetHeight;
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
  if (y + ht > window.innerHeight - 8) y = ev.clientY - ht - pad;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
function hideTip(tip) {
  tip.hidden = true;
}

/* ---------- legend + sources ---------- */
function buildLegend(el, color, nationalRate) {
  const [min, max] = color.domain;
  const stops = d3.range(0, 1.0001, 0.1).map((t) => color.at(t));
  const pct = clamp(((nationalRate - min) / (max - min)) * 100, 0, 100);
  const natMarker = h("span", {
    class: "legend-nat",
    style: `left:${pct}%`,
    dataset: { label: "U.S." },
  });
  const bar = h(
    "div",
    { class: "legend-bar", style: `background:linear-gradient(90deg, ${stops.join(",")})` },
    natMarker
  );
  clear(el);
  el.append(
    h("div", { class: "legend-label" }, h("span", null, "Lower"), h("span", null, "Higher")),
    bar,
    h(
      "div",
      { class: "legend-ticks" },
      h("span", null, Math.round(min) + "%"),
      h("span", null, Math.round(max) + "%")
    )
  );
}

function fillSources(meta) {
  const ul = $("foot-sources");
  clear(ul);
  const link = (href, text) => h("a", { href, target: "_blank", rel: "noopener" }, text);
  ul.append(
    h("li", null, "State & national — ", link(meta.state.url, "CDC BRFSS"),
      ` · self-reported survey, ${meta.state.latestYear}`),
    h("li", null, "Counties — ", link(meta.local.countyUrl, "CDC PLACES"),
      ` · model-based estimate, ${meta.local.sourceYear}`),
    h("li", null, "Cities & places — ", link(meta.local.placeUrl, "CDC PLACES"),
      ` · model-based estimate, ${meta.local.sourceYear}`)
  );
}

init();
