// Interactive U.S. choropleth. Returns a small controller for selection state.

const VIEW_W = 975;
const VIEW_H = 610;

export function renderMap(container, { topo, byFips, color, handlers = {} }) {
  container.innerHTML = "";

  const all = topojson.feature(topo, topo.objects.states).features;
  // Only render the 50 states + DC we actually have data for (drops territories
  // that have no obesity row and that geoAlbersUsa can't place cleanly).
  const features = all.filter((f) => byFips.has(f.id));

  // Adaptive projection: us-atlas 10m ships pre-projected to a ~975x610 box, so
  // an identity geoPath is correct. If the coordinates instead look like
  // lon/lat, fall back to geoAlbersUsa().fitSize so the map still renders.
  let path = d3.geoPath();
  const b = path.bounds({ type: "FeatureCollection", features });
  const projected =
    b[0][0] >= -10 && b[1][0] <= 1100 && b[1][1] <= 800 && b[1][0] > 60;
  if (!projected) {
    const proj = d3
      .geoAlbersUsa()
      .fitSize([VIEW_W, VIEW_H], { type: "FeatureCollection", features });
    path = d3.geoPath(proj);
  }

  const svg = d3
    .select(container)
    .append("svg")
    .attr("class", "us-map")
    .attr("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img")
    .attr("aria-label", "Choropleth map of U.S. adult obesity rate by state");

  const g = svg.append("g");

  const paths = g
    .selectAll("path")
    .data(features)
    .join("path")
    .attr("d", path)
    .attr("class", "state")
    .attr("fill", (f) => {
      const s = byFips.get(f.id);
      return s ? color(s.rate) : "#e8eaed";
    })
    .attr("tabindex", 0)
    .attr("aria-label", (f) => {
      const s = byFips.get(f.id);
      return s ? `${s.name}, ${s.rate}% obesity` : "";
    });

  const stateOf = (f) => byFips.get(f.id);

  paths
    .on("mouseenter", (ev, f) => setHover(f))
    .on("mousemove", (ev, f) => handlers.move && handlers.move(stateOf(f), ev))
    .on("mouseleave", () => setHover(null))
    .on("click", (ev, f) => handlers.select && handlers.select(stateOf(f)))
    .on("focus", (ev, f) => {
      setHover(f);
      handlers.move && handlers.move(stateOf(f), centerEvent(ev, f));
    })
    .on("blur", () => setHover(null))
    .on("keydown", (ev, f) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        handlers.select && handlers.select(stateOf(f));
      }
    });

  function setHover(f) {
    svg.classed("has-hover", !!f);
    paths.classed("hover", (d) => f && d.id === f.id);
    if (!f && handlers.leave) handlers.leave();
    else if (f && handlers.hover) handlers.hover(stateOf(f));
  }

  // Build a synthetic event near a feature's centroid for keyboard focus.
  function centerEvent(ev, f) {
    const rect = container.getBoundingClientRect();
    const [cx, cy] = path.centroid(f);
    return {
      clientX: rect.left + (cx / VIEW_W) * rect.width,
      clientY: rect.top + (cy / VIEW_H) * rect.height,
    };
  }

  return {
    select(fips) {
      paths.classed("selected", (f) => f.id === fips);
    },
    clear() {
      paths.classed("selected", false);
    },
  };
}
