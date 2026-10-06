/** Floor plan viewer extras: isometric campus view and the Analyze charts.
 *  Loaded before app.js; everything here reads app.js globals (state, svg, ...) only when called.
 *
 *  View modes (state.mode), from two toggles: "View All" beside Building (allBuildings) and beside Floor (allFloors):
 *    floor    one floor, 2D        building  every floor of the selected building, 2D
 *    iso      every building as isometric floor stacks   campus  every building and floor, 2D
 */
const modeFrom = (allBuildings, allFloors) => (allBuildings ? (allFloors ? 'campus' : 'iso') : allFloors ? 'building' : 'floor');
const isAllBuildings = () => state.mode === 'iso' || state.mode === 'campus';
const isAllFloors = () => state.mode === 'building' || state.mode === 'campus';

// Shared and phone-room desks are not assignable seats.
const assignable = (ws) => ws.kind !== 'phone';

function setViewMode(mode) {
  state.mode = mode;
  if (mode === 'iso') arrangeIso();
  else if (mode === 'building') arrangeCampus('cols', state.focus.b);
  else arrangeCampus();
  showFocus(true);
}

function ovText(cls, str, x, y, size, anchor) {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('class', cls);
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('font-size', size);
  if (anchor) t.setAttribute('text-anchor', anchor);
  t.textContent = str;
  overlay.appendChild(t);
  return t;
}

// Buildings side by side; each is a stack of floor plates drawn as isometric diamonds, ground floor at the bottom.
function arrangeIso() {
  const COS = 0.866;
  const SIN = 0.5;
  const buildings = [...new Set(state.floors.map((fl) => fl.b))];
  const dims = (b) => { const fl = state.floors.find((x) => x.b === b); return [fl.layout.width * 10, fl.layout.height * 10]; };
  const maxW = Math.max(...state.floors.map((fl) => fl.layout.width * 10));
  const fs = maxW / 14;
  const title = fs * 1.7;
  const gapX = fs * 1.2;
  const labelRoom = fs * 1.6;
  const tallest = Math.max(...buildings.map((b) => state.floors.filter((fl) => fl.b === b).length));
  const tallH = Math.max(...buildings.map((b) => { const [W, H] = dims(b); return SIN * (W + H) + labelRoom; }));

  overlay.replaceChildren();
  let cursor = 0;
  let worldH = title + tallest * tallH;
  state.floors.forEach((fl) => { fl.label = null; });
  for (const b of buildings) {
    const [W, H] = dims(b);
    const ox = cursor + COS * H;
    const floors = state.floors.filter((fl) => fl.b === b).sort((p, q) => p.f - q.f);
    for (const fl of floors) {
      fl.ox = ox;
      fl.oy = title + (tallest - 1 - fl.f) * tallH;
      fl.g.setAttribute('transform', `matrix(${COS} ${SIN} ${-COS} ${SIN} ${fl.ox} ${fl.oy})`);
      fl.label = ovText('ov-floor', '', fl.ox + COS * (W - H), fl.oy + SIN * (W + H) + fs * 0.9, fs * 0.7, 'middle');
      fl.label.addEventListener('click', () => showFloor(fl.b, fl.f));
    }
    ovText('ov-title', floors[0].bName, ox + (COS * (W - H)) / 2, title * 0.75, fs * 1.1, 'middle');
    cursor += COS * (W + H) + gapX;
  }
  const pad = fs * 0.5;
  state.world = { x: -pad, y: -pad, w: cursor - gapX + pad * 2, h: worldH + pad * 2 };
  updateFloorLabels();
}

// ---------- Analyze: dim the plans and draw two charts over every floor in view ----------
const CHART_INK = '#334155';

function chartNode(tag, attrs, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text !== undefined) n.textContent = text;
  return n;
}

function drawFloorCharts(fl) {
  const fw = fl.layout.width * 10;
  const fh = fl.layout.height * 10;
  let W = fw;
  let H = fh;
  if (state.mode === 'iso') {
    // Size the panel to the floor's diamond and undo the floor's skew so it reads flat, centred on the diamond.
    const COS = 0.866;
    const SIN = 0.5;
    const det = 2 * COS * SIN;
    H = SIN * (fw + fh) * 0.92;
    W = H * 1.6;
    const tx = (COS * (fw - fh)) / 2 - W / 2;
    const ty = (SIN * (fw + fh)) / 2 - H / 2;
    fl.chart.setAttribute('transform', `matrix(${SIN / det} ${-SIN / det} ${COS / det} ${COS / det} ${(SIN * tx + COS * ty) / det} ${(-SIN * tx + COS * ty) / det})`);
  } else fl.chart.removeAttribute('transform');
  const u = Math.min(W / 64, H / 40);
  const ws = state.workstations.filter((w) => w.floor === fl.idx && assignable(w));
  const count = (kind) => { const l = ws.filter((w) => w.kind === kind); return { total: l.length, used: l.filter((w) => w.assignedEmployeeId !== null).length }; };
  const bars = [['Open Seating', count('open')], ['Office', count('office')]];
  const byDept = new Map();
  ws.forEach((w) => { if (w.assignedEmployeeId !== null) { const d = state.employees[w.assignedEmployeeId].dept; byDept.set(d, (byDept.get(d) || 0) + 1); } });

  const g = fl.chart;
  g.replaceChildren();
  const text = (str, x, y, size, anchor = 'start', weight = 700, fill = CHART_INK) => g.append(chartNode('text', { x, y, 'font-size': size, 'text-anchor': anchor, 'font-weight': weight, fill, class: 'chart-text' }, str));
  g.append(chartNode('rect', { x: W * 0.04, y: H * 0.06, width: W * 0.92, height: H * 0.88, rx: u * 2.5, fill: 'rgba(255,255,255,.94)', stroke: '#94a3b8', 'stroke-width': u * 0.25 }));
  text(`${fl.bName} \u00b7 ${fl.name}`, W * 0.07, H * 0.15, u * 2.2, 'start', 800);

  // Stacked bars: assigned (bottom) on top of what is still available.
  const x0 = W * 0.09;
  const top = H * 0.36;
  const base = H * 0.8;
  const max = Math.max(1, ...bars.map(([, c]) => c.total));
  const barW = W * 0.12;
  text('Seats', x0, H * 0.235, u * 1.6, 'start', 800, '#64748b');
  g.append(chartNode('rect', { x: W * 0.31, y: H * 0.19, width: u * 1.4, height: u * 1.4, fill: '#3b82f6', rx: u * 0.3 }));
  text('Assigned', W * 0.31 + u * 2, H * 0.19 + u * 1.2, u * 1.3);
  g.append(chartNode('rect', { x: W * 0.31, y: H * 0.19 + u * 2, width: u * 1.4, height: u * 1.4, fill: '#cbd5e1', rx: u * 0.3 }));
  text('Available', W * 0.31 + u * 2, H * 0.19 + u * 3.2, u * 1.3);
  g.append(chartNode('line', { x1: x0 - u, y1: base, x2: x0 + W * 0.34, y2: base, stroke: '#94a3b8', 'stroke-width': u * 0.2 }));
  bars.forEach(([label, c], i) => {
    const bx = x0 + i * (barW + W * 0.07) + W * 0.02;
    const full = ((base - top) * c.total) / max;
    const usedH = c.total ? (full * c.used) / c.total : 0;
    g.append(chartNode('rect', { x: bx, y: base - full, width: barW, height: Math.max(0, full - usedH), fill: '#cbd5e1', rx: u * 0.3 }));
    if (usedH > 0) g.append(chartNode('rect', { x: bx, y: base - usedH, width: barW, height: usedH, fill: '#3b82f6', rx: u * 0.3 }));
    text(`${c.used}/${c.total}`, bx + barW / 2, base - full - u * 0.6, u * 1.7, 'middle', 800);
    text(label, bx + barW / 2, base + u * 2.1, u * 1.35, 'middle');
  });

  // Pie: assigned employees by department.
  const cx = W * 0.73;
  const cy = H * 0.5;
  const r = Math.min(W * 0.13, H * 0.22);
  const total = [...byDept.values()].reduce((a, n) => a + n, 0);
  text('Employees by department', cx, H * 0.235, u * 1.6, 'middle', 800, '#64748b');
  if (!total) {
    g.append(chartNode('circle', { cx, cy, r, fill: '#e2e8f0', stroke: '#cbd5e1', 'stroke-width': u * 0.2 }));
    text('No one assigned', cx, cy + u * 0.5, u * 1.5, 'middle', 700, '#64748b');
  } else {
    let a0 = -Math.PI / 2;
    for (const [dept, n] of byDept) {
      const a1 = a0 + (n / total) * Math.PI * 2;
      const color = TEAM_COLORS[dept];
      if (byDept.size === 1) g.append(chartNode('circle', { cx, cy, r, fill: color }));
      else {
        const p = (a) => `${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`;
        g.append(chartNode('path', { d: `M${cx} ${cy}L${p(a0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}Z`, fill: color, stroke: '#fff', 'stroke-width': u * 0.2 }));
      }
      a0 = a1;
    }
    // Legend under the pie, two columns.
    const entries = [...byDept].sort((p, q) => q[1] - p[1]).slice(0, 8);
    entries.forEach(([dept, n], i) => {
      const lx = cx - W * 0.17 + (i % 2) * W * 0.18;
      const ly = H * 0.5 + r + u * 2.4 + Math.floor(i / 2) * u * 2;
      g.append(chartNode('circle', { cx: lx, cy: ly - u * 0.4, r: u * 0.55, fill: TEAM_COLORS[dept] }));
      const label = DEPT_LABELS[dept].length > 13 ? `${DEPT_LABELS[dept].slice(0, 12)}\u2026` : DEPT_LABELS[dept];
      text(`${label} ${n}`, lx + u, ly, u * 1.2);
    });
  }
}

function updateCharts() {
  const on = !!state.analyze;
  svg.classList.toggle('analyze', on);
  const btn = document.getElementById('analyze-btn');
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
  if (!on) return;
  for (const fl of state.floors) if (fl.g.style.display !== 'none') drawFloorCharts(fl);
}

document.getElementById('analyze-btn').addEventListener('click', () => {
  state.analyze = !state.analyze;
  updateCharts();
});
