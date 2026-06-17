// Stock-style trend chart: gradient area + line + hover crosshair/readout.
// Self-contained; clears its container and renders an SVG sized by viewBox.

let gradSeq = 0;

export function trendChart(container, series, opts = {}) {
  const accent = opts.accent || "#e4572e";
  const showBand = opts.showBand !== false; // confidence-interval band
  const W = 480;
  const H = opts.height || 232;
  const m = { t: 14, r: 14, b: 26, l: 34 };

  container.innerHTML = "";
  const data = (series || []).filter((d) => d.rate != null);
  if (data.length < 2) {
    container.innerHTML = '<p class="muted small">Not enough data to chart.</p>';
    return;
  }

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.year))
    .range([m.l, W - m.r]);

  const lo = d3.min(data, (d) => (showBand && d.lo != null ? d.lo : d.rate));
  const hi = d3.max(data, (d) => (showBand && d.hi != null ? d.hi : d.rate));
  const pad = (hi - lo) * 0.25 + 0.5;
  const y = d3
    .scaleLinear()
    .domain([Math.max(0, lo - pad), hi + pad])
    .range([H - m.b, m.t])
    .nice();

  const svg = d3
    .select(container)
    .append("svg")
    .attr("class", "trend")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const gid = "grad-" + ++gradSeq;
  const grad = svg
    .append("defs")
    .append("linearGradient")
    .attr("id", gid)
    .attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
  grad.append("stop").attr("offset", "0%").attr("stop-color", accent).attr("stop-opacity", 0.3);
  grad.append("stop").attr("offset", "100%").attr("stop-color", accent).attr("stop-opacity", 0);

  // y gridlines + labels
  const yticks = y.ticks(4);
  const gy = svg.append("g").attr("class", "grid");
  gy.selectAll("line")
    .data(yticks)
    .join("line")
    .attr("x1", m.l).attr("x2", W - m.r)
    .attr("y1", (d) => y(d)).attr("y2", (d) => y(d));
  gy.selectAll("text")
    .data(yticks)
    .join("text")
    .attr("class", "axis")
    .attr("x", m.l - 6).attr("y", (d) => y(d)).attr("dy", "0.32em")
    .attr("text-anchor", "end")
    .text((d) => d + "%");

  // x labels (abbreviated years, thinned to avoid crowding)
  const span = data[data.length - 1].year - data[0].year;
  const step = span > 10 ? 3 : span > 6 ? 2 : 1;
  const xt = data.map((d) => d.year).filter((yr, i, a) => (a.length - 1 - i) % step === 0);
  svg.append("g")
    .selectAll("text")
    .data(xt)
    .join("text")
    .attr("class", "axis")
    .attr("x", (d) => x(d)).attr("y", H - 8)
    .attr("text-anchor", "middle")
    .text((d) => "’" + String(d).slice(2));

  // confidence band
  if (showBand && data.some((d) => d.lo != null)) {
    const band = d3
      .area()
      .x((d) => x(d.year))
      .y0((d) => y(d.lo != null ? d.lo : d.rate))
      .y1((d) => y(d.hi != null ? d.hi : d.rate))
      .curve(d3.curveMonotoneX);
    svg.append("path").datum(data).attr("d", band).attr("fill", accent).attr("opacity", 0.1);
  }

  // area + line
  const area = d3.area().x((d) => x(d.year)).y0(H - m.b).y1((d) => y(d.rate)).curve(d3.curveMonotoneX);
  svg.append("path").datum(data).attr("d", area).attr("fill", `url(#${gid})`);

  const line = d3.line().x((d) => x(d.year)).y((d) => y(d.rate)).curve(d3.curveMonotoneX);
  svg.append("path")
    .datum(data)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", accent)
    .attr("stroke-width", 2.5)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round");

  const last = data[data.length - 1];
  svg.append("circle").attr("cx", x(last.year)).attr("cy", y(last.rate)).attr("r", 3.5).attr("fill", accent);

  // hover interaction
  const focus = svg.append("g").attr("class", "focus").style("display", "none");
  focus.append("line").attr("class", "crosshair").attr("y1", m.t).attr("y2", H - m.b);
  focus.append("circle").attr("r", 4).attr("class", "focus-dot").attr("fill", "#fff").attr("stroke", accent).attr("stroke-width", 2);
  const lblG = focus.append("g");
  const lblBg = lblG.append("rect").attr("class", "focus-bg").attr("rx", 4).attr("height", 18);
  const lblTx = lblG.append("text").attr("class", "focus-txt").attr("dy", "0.7em");

  const bisect = d3.bisector((d) => d.year).center;

  svg.append("rect")
    .attr("x", m.l).attr("y", m.t)
    .attr("width", W - m.l - m.r).attr("height", H - m.t - m.b)
    .attr("fill", "transparent")
    .on("mouseenter", () => focus.style("display", null))
    .on("mouseleave", () => focus.style("display", "none"))
    .on("mousemove", function (ev) {
      const mx = d3.pointer(ev, svg.node())[0];
      const d = data[bisect(data, x.invert(mx))];
      const px = x(d.year);
      const py = y(d.rate);
      focus.select(".crosshair").attr("x1", px).attr("x2", px);
      focus.select(".focus-dot").attr("cx", px).attr("cy", py);
      lblTx.text(`’${String(d.year).slice(2)}  ${d.rate.toFixed(1)}%`);
      const w = lblTx.node().getComputedTextLength() + 14;
      const lx = Math.min(Math.max(px - w / 2, m.l), W - m.r - w);
      lblBg.attr("width", w).attr("x", lx).attr("y", m.t - 2);
      lblTx.attr("x", lx + 7).attr("y", m.t - 1);
    });
}
