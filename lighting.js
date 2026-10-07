/** Time-of-day lighting: a colour tint, sunbeams through windows by day and ceiling light pools by night.
 *  Built once per floor as static SVG (north is up); it never affects gameplay. */
const Lighting = (() => {
  const S = 10; // px per cell
  const SKY = {
    // sun: direction light travels across the plan; len: beam length in cells; shadow: pawn shadow offset in px.
    morning: { sun: [-1, -0.3], len: 14, tint: 'rgba(255,178,96,.12)', beam: '255,212,130', alpha: 0.42, shadow: [-2.8, 1] },
    noon: { sun: [0, -1], len: 7, tint: null, beam: '255,248,205', alpha: 0.36, shadow: [0.5, 1] },
    evening: { sun: [1, -0.3], len: 14, tint: 'rgba(255,128,64,.16)', beam: '255,170,90', alpha: 0.44, shadow: [2.8, 1] },
    night: { sun: null, tint: null, shadow: [0.4, 1] }
  };

  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  // Shared soft-edged glow used by every night light.
  function defs() {
    const d = el('defs');
    const g = el('radialGradient', { id: 'lt-pool' });
    [[0, 0.6], [0.55, 0.24], [1, 0]].forEach(([o, a]) => g.append(el('stop', { offset: o, 'stop-color': '#ffeebe', 'stop-opacity': a })));
    d.append(g);
    return d;
  }

  function beams(g, sky, layout) {
    const { grid, windows } = layout;
    const len = Math.hypot(...sky.sun);
    const sun = [sky.sun[0] / len, sky.sun[1] / len];
    const out = (x, y) => grid[y]?.[x] === undefined || grid[y][x] === CELL.OUT;
    const layers = ['', '', ''];
    for (const w of windows) {
      const n = w.h ? [0, out(w.x, w.y - 1) ? -1 : 1] : [out(w.x - 1, w.y) ? -1 : 1, 0]; // outward normal
      const k = -(sun[0] * n[0] + sun[1] * n[1]); // how squarely the sun faces this window
      if (k < 0.2) continue;
      const cx = w.x + 0.5 - n[0] * 0.5;
      const cy = w.y + 0.5 - n[1] * 0.5;
      // March inward until an interior wall stops the beam.
      let reach = 0;
      for (const max = sky.len * k; reach < max;) {
        const c = grid[Math.floor(cy + sun[1] * (reach + 0.5))]?.[Math.floor(cx + sun[0] * (reach + 0.5))];
        if (c === undefined || c === CELL.WALL || c === CELL.OUT) break;
        reach += 0.5;
      }
      if (reach < 1) continue;
      const t = w.h ? [1, 0] : [0, 1];
      const quad = (l, spread) => {
        const ex = sun[0] * l;
        const ey = sun[1] * l;
        const pt = (x, y) => `${(x * S).toFixed(1)} ${(y * S).toFixed(1)}`;
        return `M${pt(cx - t[0] * 0.5, cy - t[1] * 0.5)}L${pt(cx + t[0] * 0.5, cy + t[1] * 0.5)}L${pt(cx + ex + t[0] * (0.5 + spread), cy + ey + t[1] * (0.5 + spread))}L${pt(cx + ex - t[0] * (0.5 + spread), cy + ey - t[1] * (0.5 + spread))}Z`;
      };
      layers[0] += quad(reach, 0.3);
      layers[1] += quad(reach * 0.62, 0.2);
      layers[2] += quad(reach * 0.3, 0.1);
    }
    [0.45, 0.35, 0.3].forEach((share, i) => {
      if (layers[i]) g.append(el('path', { d: layers[i], fill: `rgba(${sky.beam},${(sky.alpha * share).toFixed(3)})` }));
    });
  }

  function pools(g, layout) {
    const { grid, rooms, width, height } = layout;
    const pool = (cx, cy, rx, ry) => g.append(el('ellipse', { cx: cx * S, cy: cy * S, rx: rx * S, ry: ry * S, fill: 'url(#lt-pool)' }));
    for (const r of rooms) {
      const nx = Math.max(1, Math.round(r.w / 12));
      const ny = Math.max(1, Math.round(r.h / 12));
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) pool(r.x + ((i + 0.5) * r.w) / nx, r.y + ((j + 0.5) * r.h) / ny, (r.w / nx) * 0.7, (r.h / ny) * 0.7);
    }
    for (let y = 5; y < height; y += 11) for (let x = 5; x < width; x += 11) if (grid[y][x] === CELL.HALL) pool(x + 0.5, y + 0.5, 6, 6);
  }

  // Light layer for one floor, clipped to the building's footprint.
  let serial = 0;
  function build(fl, timeOfDay) {
    const sky = SKY[timeOfDay] || SKY.noon;
    const layout = fl.layout;
    const points = layout.shellP.map(([x, y]) => `${x * S},${y * S}`).join(' ');
    const g = el('g', { class: 'light', 'pointer-events': 'none' });
    const id = `lt-clip-${fl.idx}-${serial++}`;
    const clip = el('clipPath', { id });
    clip.append(el('polygon', { points }));
    const inner = el('g', { 'clip-path': `url(#${id})` });
    g.append(clip, inner);
    if (sky.tint) inner.append(el('polygon', { points, fill: sky.tint }));
    if (sky.sun) beams(inner, sky, layout); else pools(inner, layout);
    return g;
  }

  // Pawn shadows lean away from the sun; the board carries the offset as CSS variables. secs is how long the theme change eases.
  function apply(board, timeOfDay, secs = 0.6) {
    const sky = SKY[timeOfDay] || SKY.noon;
    const stage = board.closest('#stage');
    stage?.style.setProperty('--dawn', `${secs}s`);
    board.dataset.tod = SKY[timeOfDay] ? timeOfDay : 'noon';
    if (stage) stage.dataset.tod = board.dataset.tod;
    board.style.setProperty('--sx', `${sky.shadow[0]}px`);
    board.style.setProperty('--sy', `${sky.shadow[1]}px`);
  }

  // Fades a floor's lighting into another time of day.
  function transition(fl, timeOfDay, secs) {
    const old = fl.light;
    const next = build(fl, timeOfDay);
    next.style.opacity = 0;
    next.style.transition = old.style.transition = `opacity ${secs}s ease-in-out`;
    old.after(next);
    requestAnimationFrame(() => requestAnimationFrame(() => { next.style.opacity = 1; old.style.opacity = 0; }));
    setTimeout(() => old.remove(), secs * 1000 + 300);
    fl.light = next;
  }

  return { defs, build, apply, transition };
})();
