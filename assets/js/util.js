// Small shared helpers: formatting, color scale, DOM building.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const fmtPct = (v, d = 1) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(d) + "%";

export const fmtSigned = (v, d = 1) =>
  (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d);

export function fmtPop(n) {
  if (n == null) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return String(n);
}

// rising = obesity going up (bad) -> warm accent; falling = improving -> green.
export const DIRECTION = {
  rising: { label: "Rising", arrow: "▲", cls: "rising", color: "#e4572e" },
  falling: { label: "Falling", arrow: "▼", cls: "falling", color: "#18897a" },
  stable: { label: "Stable", arrow: "→", cls: "stable", color: "#56606e" },
};
export const dirOf = (d) => DIRECTION[d] || DIRECTION.stable;

// Sequential color scale for the choropleth. Input is clamped to the domain so
// local rates that exceed the state-level max still render at full intensity.
export function makeColorScale([min, max]) {
  const interp = (t) => d3.interpolateYlOrRd(0.12 + 0.88 * clamp(t, 0, 1));
  const s = d3.scaleSequential(interp).domain([min, max]);
  const f = (r) => s(clamp(r, min, max));
  f.domain = [min, max];
  f.at = (t) => interp(t); // t in [0,1], for legend gradient
  return f;
}

// Tiny hyperscript-style DOM builder.
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "dataset") Object.assign(e.dataset, v);
      else if (k.startsWith("on") && typeof v === "function")
        e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

export const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
};
