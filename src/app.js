/* Born Elsewhere, Living Here: interactive azimuthal equidistant map centred on Honduras.
   Modules: Geo (maths) · Model (census flows) · MapView (svg) · Labels · Tip · Panel · App (state). */
"use strict";

/* ---------- Geo: distance, bearing, compass words ---------- */
const Geo = (() => {
  const rad = Math.PI / 180;
  const km = (a, b) => d3.geoDistance(a, b) * 6371;
  function bearing([lon1, lat1], [lon2, lat2]) {
    const p1 = lat1 * rad, p2 = lat2 * rad, dl = (lon2 - lon1) * rad;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }
  const WORDS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  const compass = deg => WORDS[Math.round(deg / 45) % 8];
  return { km, bearing, compass };
})();

/* ---------- Model: countries, departments, flows ---------- */
const Model = (() => {
  const centre = [CONFIG.center.lon, CONFIG.center.lat];
  const groupOf = code => CONFIG.groups.findIndex(g => g.codes.includes(code[0]));
  const depts = DATA.depts.map((d, i) => ({ ...d, i, pt: [d.lon, d.lat], placed: 0 }));
  const countries = DATA.countries.map((c, i) => {
    const pt = [c.lon, c.lat];
    return { ...c, i, pt, placed: 0, group: groupOf(c.code), km: Geo.km(centre, pt), bearing: Geo.bearing(centre, pt) };
  });
  const flows = DATA.flows.map(([d, c, p]) => ({ d, c, p }));
  flows.forEach(f => { depts[f.d].placed += f.p; countries[f.c].placed += f.p; });
  const placed = d3.sum(flows, f => f.p);

  /* Lines to draw for a view. Each: {id, c, d, p, from, to, km} */
  function rays(view) {
    if (view.type === "country") {
      const c = countries[view.i];
      return flows.filter(f => f.c === view.i).map(f => ({
        id: "c" + f.c + "d" + f.d, c: f.c, d: f.d, p: f.p, from: c.pt, to: depts[f.d].pt, km: Geo.km(c.pt, depts[f.d].pt) }));
    }
    if (view.type === "dept") {
      const d = depts[view.i];
      return flows.filter(f => f.d === view.i).map(f => ({
        id: "c" + f.c, c: f.c, d: f.d, p: f.p, from: countries[f.c].pt, to: d.pt, km: Geo.km(countries[f.c].pt, d.pt) }));
    }
    if (view.total) return countries.map(c => ({ id: "c" + c.i, c: c.i, d: null, p: c.placed, from: c.pt, to: centre, km: c.km }));
    return flows.map(f => ({ id: "c" + f.c + "d" + f.d, c: f.c, d: f.d, p: f.p, from: countries[f.c].pt, to: depts[f.d].pt,
      km: Geo.km(countries[f.c].pt, depts[f.d].pt) }));
  }
  /* Distance within which half of the people were born (people-weighted median). */
  function medianKm(rs) {
    const sorted = [...rs].sort((a, b) => a.km - b.km), half = d3.sum(rs, r => r.p) / 2;
    let acc = 0;
    for (const r of sorted) { acc += r.p; if (acc >= half) return r.km; }
    return 0;
  }
  return { centre, depts, countries, flows, placed, rays, medianKm };
})();

const fmt = d3.format(",");
const fmtKm = km => fmt(km < 1000 ? Math.round(km / 10) * 10 : Math.round(km / 50) * 50) + " km";
const pct = (a, b) => b ? (100 * a / b < 1 ? "<1%" : Math.round(100 * a / b) + "%") : "";
const color = c => CONFIG.groups[Model.countries[c].group].color;

/* ---------- Tip ---------- */
const Tip = (() => {
  const el = document.getElementById("tip"), wrap = document.getElementById("mapwrap");
  function show(e, html) {
    el.innerHTML = html; el.hidden = false;
    const b = wrap.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let x = e.clientX - b.left + 14, y = e.clientY - b.top + 14;
    if (x + w > b.width - 6) x = e.clientX - b.left - w - 14;
    if (y + h > b.height - 6) y = e.clientY - b.top - h - 14;
    el.style.left = Math.max(6, x) + "px"; el.style.top = Math.max(6, y) + "px";
  }
  const hide = () => { el.hidden = true; };
  return { show, hide };
})();

/* ---------- MapView ---------- */
const MapView = (() => {
  const HALF = CONFIG.earth_half_circumference_km;
  const wrap = document.getElementById("mapwrap");
  const svg = d3.select("#map");
  const g = svg.append("g");                 // zoomed layer
  const overlay = svg.append("g");           // screen-space layer: labels, ring captions
  const projection = d3.geoAzimuthalEquidistant().rotate([-Model.centre[0], -Model.centre[1]]).clipAngle(179.5).precision(0.3);
  const path = d3.geoPath(projection);
  const land = topojson.feature(WORLD, WORLD.objects.countries).features;
  let W = 0, H = 0, R = 0, cx = 0, cy = 0, t = d3.zoomIdentity, rays = [], ringStep = 0, hooks = {};

  const sphere = g.append("circle").attr("class", "sphere");
  const landSel = g.append("g").selectAll("path").data(land).join("path").attr("class", d => "land" + (d.id === "340" ? " hn" : ""));
  const ringG = g.append("g"), rayG = g.append("g"), hitG = g.append("g"), dotG = g.append("g");
  const ringLblG = overlay.append("g"), compassG = overlay.append("g"), lblG = overlay.append("g");
  const deptSel = dotG.append("g").selectAll("circle").data(Model.depts).join("circle").attr("class", "dept")
    .on("click", (e, d) => hooks.select({ type: "dept", i: d.i }))
    .on("mousemove", (e, d) => hooks.hover(e, { dept: d.i })).on("mouseleave", () => hooks.hover(null));
  const originG = dotG.append("g");

  const zoom = d3.zoom().scaleExtent([1, 90]).on("zoom", e => { t = e.transform; g.attr("transform", t); onZoom(); });
  svg.call(zoom).on("dblclick.zoom", null);

  const xy = pt => projection(pt);
  const screen = pt => t.apply(projection(pt));
  const widthOf = (p, max) => 0.8 + 8.2 * Math.sqrt(p / max);

  function resize() {
    const b = wrap.getBoundingClientRect();
    W = b.width; H = b.height; cx = W / 2; cy = H / 2; R = Math.max(60, Math.min(W, H) / 2 - 22);
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    projection.scale(R / Math.PI).translate([cx, cy]);
    zoom.extent([[0, 0], [W, H]]).translateExtent([[cx - R - 40, cy - R - 40], [cx + R + 40, cy + R + 40]]);
    sphere.attr("cx", cx).attr("cy", cy).attr("r", R);
    landSel.attr("d", path);
    deptSel.attr("cx", d => xy(d.pt)[0]).attr("cy", d => xy(d.pt)[1]);
    ringStep = 0;
    draw();
  }

  function setRays(rs) { rays = rs; draw(); }

  function draw() {
    if (!R) return;
    const max = d3.max(rays, r => r.p) || 1;
    const line = r => path({ type: "LineString", coordinates: [r.from, r.to] });
    const ordered = [...rays].sort((a, b) => b.p - a.p);       // small lines on top, so they stay clickable
    rayG.selectAll("path").data(ordered, r => r.id).join("path").attr("class", "ray")
      .attr("d", line).attr("stroke", r => color(r.c)).attr("stroke-width", r => widthOf(r.p, max)).order();
    hitG.selectAll("path").data(ordered, r => r.id).join("path").attr("class", "hit").attr("d", line).order()
      .on("mousemove", (e, r) => hooks.hover(e, { ray: r })).on("mouseleave", () => hooks.hover(null))
      .on("click", (e, r) => hooks.clickRay(r));
    const byC = d3.rollup(rays, v => d3.sum(v, r => r.p), r => r.c);
    originG.selectAll("circle").data([...byC].map(([c, p]) => ({ c, p, max })), d => d.c).join("circle").attr("class", "origin")
      .attr("cx", d => xy(Model.countries[d.c].pt)[0]).attr("cy", d => xy(Model.countries[d.c].pt)[1]).attr("fill", d => color(d.c))
      .on("click", (e, d) => hooks.select({ type: "country", i: d.c }))
      .on("mousemove", (e, d) => hooks.hover(e, { country: d.c, p: d.p })).on("mouseleave", () => hooks.hover(null));
    onZoom();
  }

  function onZoom() {
    const k = t.k;
    originG.selectAll("circle").attr("r", d => (2.2 + 5.5 * Math.sqrt(d.p / d.max)) / k);
    const view = hooks.view ? hooks.view() : { type: "all" };
    const byD = view.type === "country" ? d3.rollup(rays, v => d3.sum(v, r => r.p), r => r.d) : null;
    const maxD = byD ? d3.max(byD.values()) : 1, maxPlaced = d3.max(Model.depts, d => d.placed);
    deptSel.attr("r", d => (byD ? (byD.has(d.i) ? 2.5 + 6 * Math.sqrt(byD.get(d.i) / maxD) : 0) : (view.type === "dept" ? (view.i === d.i ? 6 : 2.2) : 2.2 + 5 * Math.sqrt(d.placed / maxPlaced))) / k)
      .attr("display", k >= 5 || view.type !== "all" ? null : "none")
      .classed("on", d => view.type === "dept" && view.i === d.i);
    drawRings(k);
    Labels.draw({ k, rays, view, screen, W, H, lblG });
  }

  function drawRings(k) {
    const step = k < 2.2 ? 2500 : k < 7 ? 1000 : k < 28 ? 250 : 100;
    const kmPerPx = HALF / R;
    if (step !== ringStep) {
      ringStep = step;
      const n = Math.min(Math.floor((HALF - 1) / step), 44);
      ringG.selectAll("circle").data(d3.range(1, n + 1).map(i => i * step)).join("circle").attr("class", "ring")
        .attr("cx", cx).attr("cy", cy).attr("r", d => d / kmPerPx);
    }
    const lbls = ringG.selectAll("circle").data().map(d => ({ d, p: t.apply([cx, cy - d / kmPerPx]) }))
      .filter(o => o.p[1] > 14 && o.p[1] < H - 40 && o.p[0] > 30 && o.p[0] < W - 30 && o.d / kmPerPx * k > 48);
    ringLblG.selectAll("text").data(lbls, o => o.d).join("text").attr("class", "ringlbl")
      .attr("x", o => o.p[0]).attr("y", o => o.p[1] + 3).text(o => fmt(o.d) + " km");
    const far = k < 1.6 ? [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]] : [];
    compassG.selectAll("text").data(far, d => d[0]).join("text").attr("class", "compass")
      .attr("x", d => t.apply([cx + d[1] * (R + 12), cy])[0]).attr("y", d => t.apply([cx, cy + d[2] * (R + 12)])[1] + 4).text(d => d[0]);
  }

  function highlight(test) {
    rayG.selectAll("path").classed("dim", r => test && !test(r)).classed("on", r => !!test && test(r));
    originG.selectAll("circle").classed("dim", d => test && !test({ c: d.c, d: null, any: true }));
  }

  function zoomToRadius(km, animate = true) {
    const k = Math.min(90, Math.max(1, HALF / km * (Math.min(W, H) / 2 - 8) / R));
    const target = d3.zoomIdentity.translate(cx, cy).scale(k).translate(-cx, -cy);
    const still = !animate || matchMedia("(prefers-reduced-motion: reduce)").matches;
    (still ? svg : svg.transition().duration(700)).call(zoom.transform, target);
  }
  const visibleKm = () => HALF / R * (Math.min(W, H) / 2) / t.k;

  return { resize, setRays, highlight, zoomToRadius, visibleKm, refresh: onZoom, on: h => { hooks = h; } };
})();

/* ---------- Labels: greedy, biggest first, no overlaps ---------- */
const Labels = (() => {
  function draw({ k, rays, view, screen, W, H, lblG }) {
    const items = [];
    const byC = d3.rollup(rays, v => d3.sum(v, r => r.p), r => r.c);
    if (view.type === "country") {
      const c = Model.countries[view.i];
      items.push({ t: c.name, n: byC.get(c.i), pt: c.pt, pri: 1e9 });
      if (k >= 10) rays.forEach(r => items.push({ t: Model.depts[r.d].name, n: r.p, pt: Model.depts[r.d].pt, hn: true, pri: r.p }));
      else items.push({ t: "Honduras", pt: Model.centre, hn: true, pri: 1e8 });
    } else {
      if (view.type === "dept") items.push({ t: Model.depts[view.i].name, pt: Model.depts[view.i].pt, hn: true, pri: 1e9 });
      else if (k < 10) items.push({ t: "Honduras", pt: Model.centre, hn: true, pri: 1e9 });
      else Model.depts.forEach(d => items.push({ t: d.name, pt: d.pt, hn: true, pri: 1 + d.placed / 1e6 }));
      byC.forEach((p, c) => items.push({ t: Model.countries[c].name, n: p, pt: Model.countries[c].pt, pri: p }));
    }
    items.sort((a, b) => b.pri - a.pri);
    const placed = [], boxes = [];
    const hit = b => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    for (const it of items) {
      const [x, y] = screen(it.pt);
      if (x < 4 || x > W - 4 || y < 12 || y > H - 8) continue;
      const w = it.t.length * 6.9 + (it.n != null ? String(fmt(it.n)).length * 6.6 + 8 : 0) + 4;
      for (const side of [1, -1]) {
        const x0 = side === 1 ? x + 8 : x - 8 - w;
        const b = { x0: x0 - 2, x1: x0 + w + 2, y0: y - 9, y1: y + 7 };
        if (b.x0 < 2 || b.x1 > W - 2 || hit(b)) continue;
        boxes.push(b); placed.push({ ...it, x: side === 1 ? x + 8 : x - 8, y: y + 4, anchor: side === 1 ? "start" : "end" });
        break;
      }
      if (placed.length >= 26) break;
    }
    lblG.selectAll("text").data(placed, d => d.t).join("text").attr("class", d => "lbl" + (d.hn ? " hn" : ""))
      .attr("x", d => d.x).attr("y", d => d.y).attr("text-anchor", d => d.anchor)
      .html(d => d.t + (d.n != null ? ` <tspan class="n">${fmt(d.n)}</tspan>` : ""));
  }
  return { draw };
})();

/* ---------- Panel: pickers, summary, linked list ---------- */
const Panel = (() => {
  const el = document.getElementById("panel"), pd = document.getElementById("pd"), pc = document.getElementById("pc");
  let hooks = {};
  const esc = s => s.replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

  function init(h) {
    hooks = h;
    pd.innerHTML = `<option value="">All of Honduras</option>` + [...Model.depts].sort((a, b) => a.name.localeCompare(b.name))
      .map(d => `<option value="${d.i}">${esc(d.name)}</option>`).join("");
    pc.innerHTML = `<option value="">Any country</option>` + [...Model.countries].sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `<option value="${c.i}">${esc(c.name)}</option>`).join("");
    pd.onchange = () => hooks.select(pd.value === "" ? { type: "all" } : { type: "dept", i: +pd.value });
    pc.onchange = () => hooks.select(pc.value === "" ? { type: "all" } : { type: "country", i: +pc.value });
    const bar = document.getElementById("deptbar");
    const chip = (v, label, n) => `<button type="button" id="chip-${v}" data-v="${v}" aria-pressed="false">${esc(label)}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`;
    bar.innerHTML = chip("total", "Total per country") + chip("all", "All departments") + [...Model.depts].sort((a, b) => b.placed - a.placed).map(d => chip(d.i, d.name, d.placed)).join("");
    bar.querySelectorAll("button").forEach(b => { b.onclick = () => {
      const on = b.getAttribute("aria-pressed") === "true";
      const v = b.dataset.v;
      hooks.select(v === "total" ? { type: "all", total: true } : v === "all" ? { type: "all", total: false } : on ? { type: "all" } : { type: "dept", i: +v });
    }; });
    document.getElementById("legend").innerHTML = CONFIG.groups.map(g => `<span><i style="background:${g.color}"></i>${esc(g.label)}</span>`).join("");
    const s = CONFIG.source;
    document.getElementById("source").innerHTML =
      `Source: ${esc(s.data)}. ${fmt(Model.placed)} people are drawn; ${fmt(DATA.unplaced)} more were born abroad with no country recorded or one that could not be placed on the map. ` +
      `Each line starts at a country's label point (${esc(s.basemap)}). Data preparation: ${esc(s.pipeline)}. ` +
      `Page v${esc(PROVENANCE.page_version)}, built ${esc(PROVENANCE.built_utc)}, data checksum ${esc(Object.values(PROVENANCE.inputs)[0])}.`;
  }

  function kpi(v, k) { return `<div class="kpi"><div class="v">${v}</div><div class="k">${k}</div></div>`; }

  function render(view, rays) {
    pd.value = view.type === "dept" ? view.i : ""; pc.value = view.type === "country" ? view.i : "";
    const cur = view.type === "dept" ? String(view.i) : view.type === "all" ? (view.total ? "total" : "all") : "";
    document.querySelectorAll("#deptbar button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === cur));
    const total = d3.sum(rays, r => r.p); let max = d3.max(rays, r => r.p) || 1;
    const sorted = [...rays].sort((a, b) => b.p - a.p);
    let head, rows;
    if (view.type === "country") {
      const c = Model.countries[view.i], top = sorted[0];
      head = `<div><div class="eyebrow">Born in</div><h2>${esc(c.name)}</h2></div>
        <div class="kpis">${kpi(fmt(total), "people living in Honduras")}${kpi(fmtKm(c.km), "away, to the " + Geo.compass(c.bearing))}</div>
        <p class="lead">They live in ${sorted.length} of the 18 departments. ${top ? `${esc(Model.depts[top.d].name)} is home to ${pct(top.p, total)} of them.` : ""}</p>
        <button class="back" type="button" data-all>Show every country</button>
        <div class="eyebrow" style="margin:4px 0 0">Where they live</div>`;
      rows = sorted.map(r => ({ name: Model.depts[r.d].name, p: r.p, km: null, col: "var(--accent)", go: { type: "dept", i: r.d }, ray: r.id }));
    } else {
      const far = d3.greatest(rays, r => r.km), med = Model.medianKm(rays);
      const byC = d3.rollups(rays, v => ({ p: d3.sum(v, r => r.p), km: view.type === "dept" ? v[0].km : Model.countries[v[0].c].km }), r => r.c)
        .sort((a, b) => b[1].p - a[1].p);
      max = byC[0][1].p;
      const where = view.type === "dept" ? Model.depts[view.i].name : "Honduras";
      head = `<div><div class="eyebrow">Living in</div><h2>${esc(where)}</h2></div>
        <div class="kpis">${kpi(fmt(total), "people born elsewhere")}${kpi(byC.length, byC.length === 1 ? "country of birth" : "countries of birth")}</div>
        <p class="lead">Half of them were born within ${fmtKm(med)} of ${view.type === "dept" ? "this department" : view.total ? "the centre of Honduras" : "the department where they live now"}. The longest path home starts ${fmtKm(far.km)} away, in ${esc(Model.countries[far.c].name)}.</p>
        ${view.type === "dept" ? `<button class="back" type="button" data-all>Show all of Honduras</button>` : ""}
        <div class="eyebrow" style="margin:4px 0 0">Where they were born</div>`;
      rows = byC.map(([c, o]) => ({ name: Model.countries[c].name, p: o.p, km: o.km, col: color(c), go: { type: "country", i: c }, ray: "c" + c }));
    }
    el.innerHTML = head + `<div class="bars">` + rows.map((r, i) =>
      `<button class="row" type="button" data-i="${i}" data-ray="${r.ray}"><span class="name">${esc(r.name)}</span>` +
      `<span class="km">${r.km != null ? fmtKm(r.km) : pct(r.p, total)}</span><span class="num">${fmt(r.p)}</span>` +
      `<span class="bar"><i style="width:${(100 * r.p / max).toFixed(1)}%;background:${r.col}"></i></span></button>`).join("") + `</div>`;
    el.querySelectorAll(".row").forEach(b => {
      const r = rows[+b.dataset.i];
      b.onclick = () => hooks.select(r.go);
      b.onmouseenter = b.onfocus = () => hooks.hoverRow(r.ray);
      b.onmouseleave = b.onblur = () => hooks.hoverRow(null);
    });
    const back = el.querySelector("[data-all]");
    if (back) back.onclick = () => hooks.select({ type: "all" });
    document.getElementById("widthnote").textContent = (view.total ? "One line per country, ending at the centre of Honduras. " : "") + `Line width shows people. The thickest line here is ${fmt(d3.max(rays, r => r.p) || 0)}.`;
  }
  function markRow(rayId) { el.querySelectorAll(".row").forEach(b => b.classList.toggle("hov", b.dataset.ray === rayId)); }
  return { init, render, markRow };
})();

/* ---------- App: state and wiring ---------- */
const App = (() => {
  let view = { type: "all" }, rays = [], lastTotal = false;   // lastTotal: which "all" view to go back to

  function select(v) {
    if (v.type === "all") { if (v.total === undefined) v = { type: "all", total: lastTotal }; lastTotal = v.total; }
    view = v; rays = Model.rays(view);
    MapView.setRays(rays); MapView.highlight(null); Panel.render(view, rays); Tip.hide();
    if (view.type !== "all" && MapView.visibleKm() > 12000 && d3.max(rays, r => r.km) < 4000) setPreset("americas");
  }
  function tipHTML(o) {
    const total = d3.sum(rays, r => r.p);
    if (o.ray) {
      const c = Model.countries[o.ray.c], dest = o.ray.d == null ? "Honduras" : Model.depts[o.ray.d].name;
      return `<i style="background:${color(c.i)}"></i><b>${c.name}</b> to <b>${dest}</b><br><span class="n">${fmt(o.ray.p)}</span> <span class="k">people (${pct(o.ray.p, total)} of this view)</span><br><span class="k">${fmtKm(o.ray.km)}, from the ${Geo.compass(c.bearing)}</span>`;
    }
    if (o.country != null) {
      const c = Model.countries[o.country];
      return `<i style="background:${color(c.i)}"></i><b>${c.name}</b><br><span class="n">${fmt(o.p)}</span> <span class="k">people in this view</span><br><span class="k">${fmtKm(c.km)} from Honduras, to the ${Geo.compass(c.bearing)}</span>`;
    }
    const d = Model.depts[o.dept];
    return `<b>${d.name}</b><br><span class="n">${fmt(d.placed)}</span> <span class="k">people born elsewhere live here</span>`;
  }
  function hover(e, o) {
    if (!e) { Tip.hide(); MapView.highlight(null); Panel.markRow(null); return; }
    Tip.show(e, tipHTML(o));
    if (o.ray) { MapView.highlight(r => r.any ? r.c === o.ray.c : r.id === o.ray.id); Panel.markRow(view.type === "country" ? o.ray.id : "c" + o.ray.c); }
    else if (o.country != null) MapView.highlight(r => r.c === o.country);
  }
  function hoverRow(id) {                       // row key: a ray id in country view, "c<i>" otherwise
    if (!id) return MapView.highlight(null);
    if (view.type === "country") return MapView.highlight(r => r.any ? true : r.id === id);
    const c = +id.slice(1); MapView.highlight(r => r.c === c);
  }
  function clickRay(r) { select(view.type === "country" ? { type: "dept", i: r.d } : { type: "country", i: r.c }); }

  function setPreset(id, animate = true) {
    const p = CONFIG.presets.find(x => x.id === id);
    MapView.zoomToRadius(p.radius_km, animate);
  }
  function start() {
    const bar = document.getElementById("presets");
    CONFIG.presets.forEach(p => {
      const b = document.createElement("button");
      b.type = "button"; b.id = "preset-" + p.id; b.textContent = p.label;
      b.title = `Show ${fmt(p.radius_km)} km around Honduras`;
      b.onclick = () => setPreset(p.id);
      bar.appendChild(b);
    });
    MapView.on({ select, hover, clickRay, view: () => view });
    Panel.init({ select, hoverRow });
    MapView.resize();
    select({ type: "all" });
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { MapView.resize(); MapView.zoomToRadius(MapView.visibleKm(), false); }); })
      .observe(document.getElementById("mapwrap"));
  }
  return { start };
})();

App.start();
