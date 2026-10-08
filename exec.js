/** Stages after Planning: Execute (Mover pawns deliver every object) and Feedback (employees arrive and react).
 *  Loaded before app.js; everything here reads app.js globals (state, CFG, ...) only when called. */

// Time To Deploy: seconds a Mover stands at the destination before an object of this type is placed.
const OBJECT_TYPES = {
  plant: { emoji: '🪴', secs: 1, name: 'Plant' },
  box: { emoji: '📦', secs: 5, name: 'Boxes' },
  computer: { emoji: '🖥️', secs: 8, name: 'Computer' },
  furniture: { emoji: '🪑', secs: 15, name: 'Furniture' }
};
const SPAWN_GAP = 0.5; // one pawn may spawn or despawn per entrance in this many seconds
const DAWN_SECS = 6; // simulated seconds the day takes to break between the Moving and Feedback stages
// Elevator cars: a pawn counts 1 unit of capacity and each object it carries counts its weight below. Cargo holds the most, Passenger the least.
const ELEVATORS = {
  passenger: { name: 'Passenger', cap: 6, floorSecs: 1.5, dwell: 1.5 },
  service: { name: 'Service', cap: 10, floorSecs: 2, dwell: 2 },
  cargo: { name: 'Cargo', cap: 16, floorSecs: 2.5, dwell: 3 }
};
const LOAD_UNITS = { plant: 0.5, box: 1, computer: 1, furniture: 2 };
const DELIVERY_ORDER = { furniture: 0, box: 1 }; // everything else (plants, computers) goes last
const SIM_SPEEDS = [1, 2, 4, 8];
const CARGO_LABELS = ['Light', 'Moderate', 'Heavy', 'Brutal'];
const cargoLabel = (load = 0) => CARGO_LABELS[Math.min(3, Math.floor(load / 0.25))];

const cargoOf = (emp) => emp.cargo || ['box'];

// Every employee has a box; heavier jobs add plants, computers and furniture.
function rollCargo(emp, rng, load) {
  const cargo = ['box'];
  if (rng() < 0.3 + 0.3 * load) cargo.push('plant');
  if (rng() < 0.25 + 0.4 * load) cargo.push('computer');
  if (rng() < 0.08 + 0.5 * load + (emp.officeRequired ? 0.15 : 0)) cargo.push('furniture');
  return cargo;
}

const moverSpeed = () => (CFG.walkSpeed * Perks.speedMult()) / Perks.walkMult();

function reactionFor(emp, ws) {
  const flags = [...requirementStatus(emp).map((r) => r.met), preferenceMet(emp, ws)];
  const ratio = flags.filter(Boolean).length / flags.length;
  if (ratio === 1) return { face: '😊👍', mood: 'happy' };
  if (ratio >= 0.5) return { face: '🙂', mood: 'ok' };
  if (ratio > 0) return { face: '😕', mood: 'meh' };
  return { face: '😡', mood: 'angry' };
}

const PHASES = {
  planning: ['Planning', 'Execute'],
  execute: ['Execute', 'Executing\u2026'],
  feedback: ['Feedback', 'Feedback\u2026'],
  done: ['Complete', 'Results']
};

function setPhase(phase, detail = '') {
  state.phase = phase;
  document.body.dataset.phase = phase;
  const btn = document.getElementById('finish-btn');
  if (btn) {
    btn.textContent = PHASES[phase][1] + (typeof detail === 'string' && detail ? ` ${detail}` : '');
    btn.disabled = phase === 'execute' || phase === 'feedback';
  }
  const sp = document.getElementById('speed-btn');
  if (sp) sp.hidden = phase === 'planning' || phase === 'done';
  if (typeof updateHeatmap === 'function') updateHeatmap();
}

const Exec = (() => {
  let raf = 0;
  let sim = null;
  let speed = 1;
  let lastTs = 0;

  const node = (tag, attrs = {}, text) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // ----- Pawns -----
  // Each floor keeps a live set so pawns can keep their distance. Routes put walkers in the right-hand lane, and anyone waiting
  // at a pad or the dock stands on its own spot instead of stacking on the others.
  const SEP = 9; // px kept between pawns
  const LANE = 3; // px right of the route's centre line
  const LATERAL = 5; // px off the line beyond which a pawn is not in the way
  const STUCK_SECS = 1.5; // jammed this long, a pawn squeezes past
  const ARRIVE_R = 16; // px from a pad or dock where a blocked pawn stops and takes a spot
  // Waiting pawns bunch in a loose crowd round a pad or dock, slightly overlapping, rather than standing on a grid.
  const SPOT_OFFSETS = Array.from({ length: 40 }, (_, k) => {
    const a = (k + 1) * 2.399963;
    const r = 3.6 * Math.sqrt(k + 1);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

  // Movers fetching the next object gather in a ring round the company truck.
  const TRUCK_OFFSETS = Array.from({ length: 40 }, (_, k) => {
    const a = (k + 1) * 2.399963;
    const r = 11 + 3.4 * Math.sqrt(k);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

  const SKIN = ['#f2c9a0', '#e0a97a', '#c68b59', '#8d5a3a'];
  const HAIR = ['#2b1d12', '#5b3a1e', '#a0522d', '#d4a537', '#1f2937'];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // Top-down sprite facing +x: feet, swinging arms, torso, head and a hard hat (Movers) or hair. Animation is CSS only (see styles.css).
  function makePawn(fl, kind, shirt) {
    const g = node('g', { class: 'pawn idle' });
    const shadow = node('ellipse', { class: 'pw-shadow', rx: 5, ry: 4.2, fill: 'rgba(15,23,42,.28)' });
    const track = node('circle', { r: 8, fill: 'none', stroke: 'rgba(0,0,0,.18)', 'stroke-width': 2.2, visibility: 'hidden' });
    const prog = node('circle', { r: 8, fill: 'none', stroke: '#22c55e', 'stroke-width': 2.2, 'stroke-linecap': 'round', pathLength: 100, 'stroke-dasharray': '0 100', transform: 'rotate(-90)', visibility: 'hidden' });
    const mover = kind === 'mover';
    const cloth = mover ? '#f97316' : shirt;
    const edge = { stroke: 'rgba(0,0,0,.4)', 'stroke-width': 0.4 };
    const body = node('g');
    const torso = node('ellipse', { class: 'pw-torso', rx: 2.5, ry: 4, fill: cloth, ...edge });
    torso.style.animationDelay = `${-Math.random() * 2}s`;
    body.append(
      node('ellipse', { class: 'pw-fl', cy: -1.7, rx: 1.9, ry: 1.1, fill: '#1f2937' }),
      node('ellipse', { class: 'pw-fr', cy: 1.7, rx: 1.9, ry: 1.1, fill: '#1f2937' }),
      node('ellipse', { class: 'pw-al', cy: -4.3, rx: 1.7, ry: 1.1, fill: cloth, ...edge }),
      node('ellipse', { class: 'pw-ar', cy: 4.3, rx: 1.7, ry: 1.1, fill: cloth, ...edge }),
      torso,
      node('circle', { cx: 0.5, r: 2.3, fill: pick(SKIN) }),
      ...(mover
        ? [node('circle', { cx: 0.3, r: 2.8, fill: '#facc15', stroke: '#a16207', 'stroke-width': 0.4 }), node('ellipse', { cx: 2.9, rx: 1.1, ry: 1.9, fill: '#eab308' })]
        : [node('ellipse', { cx: -0.3, rx: 2, ry: 2.3, fill: pick(HAIR) })])
    );
    const cargo = node('text', { x: 5, y: -5, 'font-size': 6.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    g.append(shadow, track, prog, body, cargo);
    fl.walkers.append(g);
    const pawn = { g, track, prog, body, cargo, x: 0, y: 0, hx: 1, hy: 0, fl, hidden: false, spotted: false, lx: 0, ly: 0, ang: 0, still: 9, moving: false };
    fl.live.add(pawn);
    return pawn;
  }

  // Once per frame: swap between the walking and waiting animations and turn each pawn to face where it is heading.
  function animatePawns() {
    for (const fl of state.floors) {
      for (const p of fl.live) {
        const moved = Math.hypot(p.x - p.lx, p.y - p.ly) > 0.15;
        p.lx = p.x;
        p.ly = p.y;
        p.still = moved ? 0 : p.still + 1;
        const moving = p.still < 6;
        if (moving !== p.moving) {
          p.moving = moving;
          p.g.setAttribute('class', moving ? 'pawn walk' : 'pawn idle');
        }
        if (!moved) continue;
        const want = (Math.atan2(p.hy, p.hx) * 180) / Math.PI;
        const diff = ((want - p.ang + 540) % 360) - 180;
        if (Math.abs(diff) > 1) {
          p.ang += diff * 0.35;
          p.body.setAttribute('transform', `rotate(${p.ang.toFixed(0)})`);
        }
      }
    }
  }

  function setPawnFloor(pawn, fl) {
    if (pawn.fl === fl) return;
    pawn.fl.live.delete(pawn);
    pawn.fl = fl;
    pawn.tx = undefined;
    if (!pawn.hidden) fl.live.add(pawn);
    fl.walkers.append(pawn.g);
  }
  function setHidden(pawn, v) {
    pawn.hidden = v;
    pawn.tx = undefined;
    pawn.g.style.display = v ? 'none' : '';
    if (v) pawn.fl.live.delete(pawn); else pawn.fl.live.add(pawn);
  }
  function dropPawn(pawn) {
    pawn.fl.live.delete(pawn);
    pawn.g.remove();
  }
  function putPawn(pawn, x, y) {
    pawn.x = x;
    pawn.y = y;
    pawn.g.setAttribute('transform', `translate(${x} ${y})`);
  }

  // Position (px) and travel heading at progress f along a route; rev walks it backwards.
  function lanePos(pts, f, rev) {
    const last = pts.length - 1;
    if (last < 1) return { x: pts[0].x * 10, y: pts[0].y * 10, hx: 0, hy: 0 };
    const i = Math.max(0, Math.min(Math.floor(f), last - 1));
    const t = Math.max(0, Math.min(1, f - i));
    const a = pts[i];
    const b = pts[i + 1];
    const s = rev ? -1 : 1;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Lane offset at a vertex: to the right of travel, easing in from both ends so pawns meet pads and desks head on.
    const side = (j) => {
      if (j <= 0 || j >= last) return [0, 0];
      const p0 = pts[j - 1];
      const p2 = pts[j + 1];
      const l = Math.hypot(p2.x - p0.x, p2.y - p0.y) || 1;
      return [(-(p2.y - p0.y) / l) * s * LANE, ((p2.x - p0.x) / l) * s * LANE];
    };
    const [ax, ay] = side(i);
    const [bx, by] = side(i + 1);
    return {
      x: (a.x + (b.x - a.x) * t) * 10 + ax + (bx - ax) * t,
      y: (a.y + (b.y - a.y) * t) * 10 + ay + (by - ay) * t + Math.sin(f * 2.4) * 0.6,
      hx: ((b.x - a.x) / len) * s,
      hy: ((b.y - a.y) / len) * s
    };
  }

  // Free distance (px) ahead of a walking pawn before it would touch another pawn on its floor.
  function clearance(w) {
    const me = w.pawn;
    const leg = w.leg;
    const pts = leg.pts;
    const near = (pt) => Math.hypot(me.x - pt.x * 10, me.y - pt.y * 10) < ARRIVE_R;
    const atEnds = w.trav < 2 || near(pts[0]) || near(pts[pts.length - 1]);
    let lim = Infinity;
    for (const q of me.fl.live) {
      if (q === me || (q.spotted && atEnds)) continue;
      const vx = q.x - me.x;
      const vy = q.y - me.y;
      const ahead = vx * me.hx + vy * me.hy;
      if (ahead <= 0.5 || ahead > 45 || Math.abs(vx * me.hy - vy * me.hx) >= LATERAL) continue;
      lim = Math.min(lim, ahead - SEP);
    }
    return lim;
  }

  function placeWalker(w) {
    const leg = w.leg;
    const p = lanePos(leg.pts, w.f, leg.rev);
    const k = w.lead ? Math.max(0, 1 - w.trav / w.leadLen) : 0;
    putPawn(w.pawn, p.x + (k ? w.lead.x * k : 0), p.y + (k ? w.lead.y * k : 0));
    w.pawn.hx = p.hx;
    w.pawn.hy = p.hy;
  }

  // Advances along the current leg at cps cells per second; true once the end is reached.
  function walkStep(w, dt, cps) {
    const leg = w.leg;
    const last = leg.pts.length - 1;
    const remain = leg.rev ? w.f : last - w.f;
    if (remain <= 1e-6) return true;
    let step = Math.min(cps * dt, remain);
    let blocked = false;
    if (w.free > 0) w.free -= dt;
    else {
      const lim = clearance(w);
      if (lim < step * 10) { step = Math.max(0, lim) / 10; blocked = true; }
    }
    if (blocked && step < 0.01) {
      if (leg.spot && remain * 10 <= ARRIVE_R) return true;
      w.stuck += dt;
      if (w.stuck > STUCK_SECS) { w.free = 0.8; w.stuck = 0; }
    } else w.stuck = 0;
    w.f += leg.rev ? -step : step;
    w.trav += step;
    placeWalker(w);
    return leg.rev ? w.f <= 1e-6 : w.f >= last - 1e-6;
  }

  // Nearest free spot around a pad or dock; spot 0 (the centre) stays clear for arrivals and departures.
  function claimSpot(w, fl, key, cell) {
    const used = (fl.spots[key] ||= new Set());
    const p = w.pawn;
    const cx = (cell.x + 0.5) * 10;
    const cy = (cell.y + 0.5) * 10;
    let best = -1;
    let bestD = Infinity;
    const offsets = key === 'dock' ? TRUCK_OFFSETS : SPOT_OFFSETS;
    offsets.forEach(([dx, dy], k) => {
      if (used.has(k)) return;
      const d = Math.hypot(cx + dx - p.x, cy + dy - p.y);
      if (d < bestD) { bestD = d; best = k; }
    });
    if (best < 0) best = offsets.length - 1;
    used.add(best);
    w.spot = { fl, key, k: best, x: cx + offsets[best][0], y: cy + offsets[best][1] };
  }
  function releaseSpot(w) {
    if (!w.spot) return;
    w.spot.fl.spots[w.spot.key].delete(w.spot.k);
    w.spot = null;
    w.pawn.spotted = false;
  }
  function slideStep(w, dt, cps) {
    const s = w.spot;
    const p = w.pawn;
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    const step = cps * 10 * dt;
    p.hx = (s.x - p.x) / (d || 1);
    p.hy = (s.y - p.y) / (d || 1);
    if (d <= step) { putPawn(p, s.x, s.y); return true; }
    putPawn(p, p.x + ((s.x - p.x) / d) * step, p.y + ((s.y - p.y) / d) * step);
    return false;
  }
  const cellClear = (fl, cell) => {
    const cx = (cell.x + 0.5) * 10;
    const cy = (cell.y + 0.5) * 10;
    for (const q of fl.live) if (!q.spotted && Math.hypot(q.x - cx, q.y - cy) < SEP - 1) return false;
    return true;
  };
  const cellCentre = (cell) => ({ x: (cell.x + 0.5) * 10, y: (cell.y + 0.5) * 10 });

  // Routes are lists of cell centres, cached per floor. Movers keep to Primary and Secondary Pathways: the only other
  // cells they may use are the destination room itself (plus a two-tile apron for Open Seating, which has no door onto a pathway).
  function pathwayGrid(fl, goal, reach, rooms) {
    const { grid, pathType } = fl.layout;
    const inRoom = (x, y) => rooms.some((room) => {
      const pad = room.type === 'open' ? 2 : 1;
      return x >= room.x - pad && x < room.x + room.w + pad && y >= room.y - pad && y < room.y + room.h + pad;
    });
    const near = (x, y) => Math.abs(x - goal.x) + Math.abs(y - goal.y) <= reach;
    return fl.navGrid.map((row, y) => row.map((c, x) => {
      if (c !== 0 || inRoom(x, y)) return c;
      const t = grid[y][x];
      return t === CELL.HALL ? (pathType[y][x] || near(x, y) ? 0 : 1) : 1;
    }));
  }
  function routePts(fl, from, to, pathwaysOnly, ws = null) {
    fl.legCache ||= {};
    const key = `${from.x},${from.y}>${ws ? `w${ws.id}` : `${to.x},${to.y}`}${pathwaysOnly ? 'p' : ''}`;
    if (!fl.legCache[key]) {
      const goal = ws ? { x: ws.gridX, y: ws.gridY } : to;
      let cells = [];
      if (pathwaysOnly) {
        // Rooms a route may cross: the desk's room, and any room it starts or ends in (the dock room, say).
        const inside = (c, r) => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;
        const rooms = new Set(ws ? [fl.layout.rooms[ws.roomId]] : []);
        for (const r of fl.layout.rooms) if (inside(from, r) || (!ws && inside(to, r))) rooms.add(r);
        for (const reach of [0, 2, 4, 8, 16]) { cells = findPath(pathwayGrid(fl, goal, reach, [...rooms]), from, goal); if (cells.length) break; }
      }
      if (!cells.length) cells = findPath(fl.navGrid, from, goal);
      const pts = cells.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 }));
      if (ws && pts.length) pts[pts.length - 1].x = ws.desk.x + ws.desk.w / 2;
      fl.legCache[key] = pts.length ? pts : [{ x: from.x + 0.5, y: from.y + 0.5 }];
    }
    return fl.legCache[key];
  }
  const routeFrom = (ws, spawn, pathwaysOnly = false) => routePts(floorOf(ws), spawn, null, pathwaysOnly, ws);

  function effect(fl, cls, text, x, y) {
    const n = node('text', { class: cls, x, y, 'font-size': 9, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'pointer-events': 'none' }, text);
    fl.walkers.append(n);
    setTimeout(() => n.remove(), 900);
  }

  const setProgress = (text) => status.count(text);
  const progressText = () => `${sim.delivered}/${sim.total} objects${state.broken ? ` · ${state.broken} replaced` : ''}`;

  // ----- Progress Status widget: two stage bars (Moving, Feedback), a spinner, a live headline and an expandable task log -----
  const status = (() => {
    let lastHead = 0;
    let open = false;
    const $ = (id) => document.getElementById(id);
    const stamp = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const setOpen = (v) => {
      open = v;
      $('exec-log').hidden = !v;
      $('exec-toggle').setAttribute('aria-expanded', String(v));
      $('exec-toggle').textContent = v ? '▼' : '▲';
    };
    $('exec-toggle')?.addEventListener('click', () => setOpen(!open));
    return {
      show() {
        $('exec-log').replaceChildren();
        $('exec-status').hidden = false;
        lastHead = 0;
        setOpen(open);
        this.stage('moving');
        this.bar('moving', 0);
        this.bar('feedback', 0);
      },
      hide() { $('exec-status').hidden = true; },
      stage(name) {
        $('stage-moving').classList.toggle('active', name === 'moving');
        $('stage-moving').classList.toggle('done', name === 'feedback');
        $('stage-feedback').classList.toggle('active', name === 'feedback');
      },
      bar(name, frac) { $(`exec-fill-${name}`).style.width = `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`; },
      count(text) { $('exec-count').textContent = text; },
      // The headline is throttled so it stays readable at high playback speed.
      head(text, force = false) {
        const now = performance.now();
        if (!force && now - lastHead < 900) return;
        lastHead = now;
        $('exec-status-text').textContent = text;
      },
      // Newest entry on top, so the scrollbar leads back to older ones; a scrolled-away view keeps its place.
      log(text) {
        const box = $('exec-log');
        const row = document.createElement('div');
        row.className = 'exec-log-row';
        const ts = document.createElement('span');
        ts.className = 'exec-ts';
        ts.textContent = stamp(sim ? sim.t : 0);
        row.append(ts, text);
        const keep = box.scrollTop;
        box.prepend(row);
        if (keep > 0) box.scrollTop = keep + row.offsetHeight;
      }
    };
  })();
  // ----- Completion summary: the Progress Status widget's celebratory last state, with the mood tally and confetti -----
  const celebration = (() => {
    const $ = (id) => document.getElementById(id);
    const COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#a855f7', '#ef4444'];
    return {
      show(tally, total) {
        const box = $('exec-summary');
        const moods = [['\u{1F60A}', tally.happy], ['\u{1F642}', tally.ok], ['\u{1F615}', tally.meh], ['\u{1F621}', tally.angry]];
        $('sum-chips').replaceChildren(...moods.map(([face, n], i) => {
          const chip = document.createElement('span');
          chip.className = `sum-chip${n ? '' : ' zero'}`;
          chip.style.animationDelay = `${0.2 + i * 0.12}s`;
          chip.textContent = `${face} ${n}`;
          return chip;
        }));
        $('sum-hint').textContent = `All ${total} employees have moved in. Press Results to collect your payout.`;
        const confetti = $('sum-confetti');
        confetti.replaceChildren(...Array.from({ length: 36 }, () => {
          const bit = document.createElement('i');
          bit.style.cssText = `left:${Math.random() * 100}%;background:${COLORS[Math.floor(Math.random() * COLORS.length)]};animation-delay:${Math.random() * 0.6}s;animation-duration:${1.6 + Math.random() * 1.2}s`;
          return bit;
        }));
        box.hidden = false;
        box.classList.remove('pop');
        void box.offsetWidth;
        box.classList.add('pop');
        FX.play('win');
        const r = box.getBoundingClientRect();
        [0.2, 0.5, 0.8].forEach((f, i) => setTimeout(() => FX.burst(r.left + r.width * f, r.top + 8, COLORS[i * 2]), i * 140));
      },
      hide() { $('exec-summary').hidden = true; }
    };
  })();
  const floorTag = (fl) => (new Set(state.floors.map((f) => f.b)).size > 1 ? `${buildingLetter(fl.b)} ${fl.f + 1}F` : `${fl.f + 1}F`);
  const DEPLOY = { plant: ['Placing plant', 'Placed plant'], box: ['Unpacking boxes', 'Unpacked boxes'], computer: ['Installing computer', 'Installed computer'], furniture: ['Assembling furniture', 'Assembled furniture'] };

  // ----- Elevators: each multi-storey building runs Cargo, Service and Passenger cars on a timed schedule with limited loads -----
  const PAD_OF = { passenger: 'publicElevator', service: 'serviceElevator', cargo: 'cargoElevator', stairs: 'stairs' };
  const UP_MOVER = ['cargo', 'service', 'passenger'];
  const DOWN_MOVER = ['service', 'cargo', 'passenger'];
  const UP_STAFF = ['passenger', 'service', 'cargo'];
  const ACT_GAP = 0.35; // seconds between pawns boarding or leaving a car
  const padCell = (fl, kind) => fl.layout.spawns[PAD_OF[kind]] || null;
  const dockOf = (bs) => bs.ground.fl.layout.spawns.dock || bs.ground.fl.layout.spawns.entrance;
  // Where returning Movers gather: round the company truck in the dock room (or at the dock door when there is no room).
  const truckCell = (bs) => {
    const t = bs.ground.fl.layout.dock?.truck;
    return t ? { x: t.x - 0.5, y: t.y - 0.5 } : dockOf(bs);
  };
  const unitsOf = (w) => 1 + (w.carry ? LOAD_UNITS[w.carry] : 0);
  const carLoad = (car) => car.riders.reduce((t, r) => t + unitsOf(r), 0);

  function makeCar(bs, kind) {
    const car = { kind, cfg: ELEVATORS[kind], bs, at: 0, from: 0, target: 0, dir: 1, state: 'idle', t: 0, idle: 0, gap: 0, lastAct: 0, riders: [], waiters: [], labels: [], shown: [] };
    bs.byF.forEach((fs, f) => {
      if (!fs) return;
      const pad = fs.fl.layout.pads.find((p) => p.kind === PAD_OF[kind]);
      const label = node('text', { x: (pad.x + pad.w / 2) * 10, y: (pad.y + pad.h) * 10 + 6, 'font-size': 4.6, 'font-weight': 700, 'text-anchor': 'middle', fill: '#0f172a', 'pointer-events': 'none' });
      fs.fl.walkers.append(label);
      car.labels[f] = label;
    });
    return car;
  }
  function updateLabels(bs) {
    for (const car of bs.cars) {
      const where = car.state === 'move' ? `${car.target > car.from ? '\u25B2' : '\u25BC'}${car.target + 1}F` : `${car.at + 1}F`;
      const load = `${+carLoad(car).toFixed(1)}/${car.cfg.cap}`;
      car.labels.forEach((label, f) => {
        const text = `${car.cfg.name} ${car.state === 'doors' && car.at === f ? 'OPEN ' : ''}${where} ${load}`;
        if (car.shown[f] !== text) { label.textContent = text; car.shown[f] = text; }
      });
    }
  }
  const stopsHere = (car) => car.riders.some((r) => r.leg.to === car.at) || car.waiters.some((w) => w.leg.from === car.at);
  function go(car, f) {
    car.dir = Math.sign(f - car.at) || car.dir;
    car.from = car.at;
    car.target = f;
    car.state = 'move';
    car.t = 0;
  }
  // Doors close: head for the nearest rider destination or waiting floor, preferring the current direction; park at the lobby when idle.
  function settle(car) {
    const room = car.cfg.cap - carLoad(car);
    const stops = new Set(car.riders.map((r) => r.leg.to));
    for (const w of car.waiters) if (unitsOf(w) <= room) stops.add(w.leg.from);
    stops.delete(car.at);
    if (!stops.size) { car.state = 'idle'; car.idle = 0; return; }
    const ahead = [...stops].filter((g) => (g - car.at) * car.dir > 0);
    const pool = ahead.length ? ahead : [...stops];
    go(car, pool.reduce((a, b) => (Math.abs(a - car.at) <= Math.abs(b - car.at) ? a : b)));
  }
  function alight(car, w) {
    car.riders.splice(car.riders.indexOf(w), 1);
    const fs = car.bs.byF[w.leg.to];
    const c = cellCentre(padCell(fs.fl, car.kind));
    setPawnFloor(w.pawn, fs.fl);
    setHidden(w.pawn, false);
    putPawn(w.pawn, c.x, c.y);
    nextLeg(w);
  }
  function board(car, w) {
    car.waiters.splice(car.waiters.indexOf(w), 1);
    car.riders.push(w);
    releaseSpot(w);
    setHidden(w.pawn, true);
    w.mode = 'ride';
  }
  function stepCar(car, dt) {
    const cfg = car.cfg;
    if (car.state === 'move') {
      car.t += dt;
      if (car.t < Math.abs(car.target - car.from) * cfg.floorSecs) return;
      car.at = car.target;
      if (stopsHere(car)) { car.state = 'doors'; car.t = 0; car.gap = 0; car.lastAct = 0; } else settle(car);
    } else if (car.state === 'doors') {
      car.t += dt;
      car.gap -= dt;
      const out = car.riders.find((r) => r.leg.to === car.at);
      const room = cfg.cap - carLoad(car);
      const next = car.waiters.find((w) => w.leg.from === car.at && unitsOf(w) <= room);
      if (car.gap <= 0) {
        if (out) {
          // A rider waits for a clear spot at the exit, then pushes out anyway after a moment.
          if (cellClear(car.bs.byF[car.at].fl, padCell(car.bs.byF[car.at].fl, car.kind)) || car.t - car.lastAct > 1.5) { alight(car, out); car.gap = ACT_GAP; car.lastAct = car.t; }
        } else if (next) { board(car, next); car.gap = ACT_GAP; car.lastAct = car.t; }
      }
      if (!out && !next && car.t - car.lastAct >= cfg.dwell) settle(car);
    } else {
      car.idle += dt;
      const calls = car.waiters.map((w) => w.leg.from);
      if (calls.length) {
        const f = calls.reduce((a, b) => (Math.abs(a - car.at) <= Math.abs(b - car.at) ? a : b));
        if (f === car.at) { car.state = 'doors'; car.t = 0; car.gap = 0; car.lastAct = 0; } else go(car, f);
      } else if (car.at !== 0 && car.idle > 1.5) go(car, 0);
    }
  }

  // ----- Journeys: a walker's trip is a list of legs (walk on a floor, ride a car, climb the stairs) -----
  // From the start cell on the ground floor to the desk; out = false gives the same trip back, with the return kind of lift.
  function journey(bs, fl, ws, start, kinds, pathways, out) {
    const G = bs.ground.fl;
    const walk = (floor, pts, rev, spot) => ({ kind: 'walk', fl: floor, pts, rev, spot });
    if (fl === G) return [walk(G, routePts(G, start, null, pathways, ws), !out, out ? null : { key: 'dock', cell: truckCell(bs) })];
    const stairs = Perks.stairsOnly();
    const kind = stairs ? 'stairs' : kinds.find((k) => bs.carOf[k]);
    const pg = kind ? padCell(G, kind) : null;
    const pt = kind ? padCell(fl, kind) : null;
    if (!pg || !pt) {
      // No usable lift or stairs: pawns turn up at the floor's entrance and go back the same way.
      const e = fl.layout.spawns.entrance;
      const desk = routeFrom(ws, e, pathways);
      return out ? [{ kind: 'climb', fl, cell: e, secs: 0 }, walk(fl, desk, false, null)] : [walk(fl, desk, true, null), { kind: 'climb', fl: G, cell: start, secs: 0 }];
    }
    const car = stairs ? null : bs.carOf[kind];
    const vertical = (dest, from, to) => (stairs ? { kind: 'climb', fl: dest, cell: padCell(dest, 'stairs'), secs: Perks.stairSecs() * fl.f } : { kind: 'ride', car, from, to });
    const desk = routeFrom(ws, pt, pathways);
    const hall = routePts(G, start, pg, pathways);
    const padSpot = (cell) => (stairs ? null : { key: `pad:${kind}`, cell });
    return out
      ? [walk(G, hall, false, padSpot(pg)), vertical(fl, 0, fl.f), walk(fl, desk, false, null)]
      : [walk(fl, desk, true, padSpot(pt)), vertical(G, fl.f, 0), walk(G, hall, true, { key: 'dock', cell: truckCell(bs) })];
  }

  function startLegs(w, legs, done) {
    w.legs = legs;
    w.li = -1;
    w.done = done;
    w.stuck = 0;
    w.free = 0;
    nextLeg(w);
  }
  function nextLeg(w) {
    const leg = w.legs[++w.li];
    w.leg = leg || null;
    if (!leg) { w.mode = 'idle'; w.done?.(w); return; }
    if (leg.kind === 'walk') {
      releaseSpot(w);
      setPawnFloor(w.pawn, leg.fl);
      w.f = leg.rev ? leg.pts.length - 1 : 0;
      w.trav = 0;
      const p0 = lanePos(leg.pts, w.f, leg.rev);
      const lead = { x: w.pawn.x - p0.x, y: w.pawn.y - p0.y };
      w.lead = Math.hypot(lead.x, lead.y) < 90 ? lead : null;
      w.leadLen = Math.max(1.5, Math.hypot(lead.x, lead.y) / 6);
      w.mode = 'walk';
      placeWalker(w);
    } else if (leg.kind === 'ride') {
      w.mode = 'queue';
      leg.car.waiters.push(w);
    } else {
      releaseSpot(w);
      setHidden(w.pawn, true);
      w.mode = 'climb';
      w.t = 0;
    }
  }
  function walkerStep(w, dt, cps) {
    if (w.mode === 'walk') {
      if (!walkStep(w, dt, cps)) return;
      if (w.leg.spot) { claimSpot(w, w.leg.fl, w.leg.spot.key, w.leg.spot.cell); w.mode = 'slide'; } else nextLeg(w);
    } else if (w.mode === 'slide') {
      if (!slideStep(w, dt, cps)) return;
      w.pawn.spotted = true;
      nextLeg(w);
    } else if (w.mode === 'climb') {
      w.t += dt;
      const { fl, cell, secs } = w.leg;
      if (w.t < secs || !cellClear(fl, cell)) return;
      const c = cellCentre(cell);
      setPawnFloor(w.pawn, fl);
      setHidden(w.pawn, false);
      putPawn(w.pawn, c.x, c.y);
      nextLeg(w);
    }
  }

  // ----- Execute: Movers carry each object from the loading dock to its desk, by lift or stairs when it is upstairs -----
  function begin() {
    stop();
    setPhase('execute');
    state.damage = 0;
    state.broken = 0;
    sim = {
      gen: state.gen, t: 0, mode: 'execute', floors: [], blds: [], total: 0, delivered: 0, doneSecs: 0, totalSecs: 0, said: {}, endAt: null,
      flooringSecs: Perks.flooringSecs(), vacuumSecs: Perks.vacuumSecs(), cleanSecs: Perks.cleanSecs(), retrieveSecs: Perks.retrieveSecs()
    };
    const byB = new Map();
    for (const fl of state.floors) {
      fl.live = new Set();
      fl.spots = {};
      fl.heat = new Float32Array(fl.layout.width * fl.layout.height);
      fl.heatDrawn = false;
      const tasks = [];
      for (const ws of state.workstations) {
        if (ws.floor !== fl.idx || ws.assignedEmployeeId === null) continue;
        const emp = state.employees[ws.assignedEmployeeId];
        cargoOf(emp).forEach((type) => tasks.push({ emp, ws, type, secs: Perks.deploySecs(type) }));
      }
      let bs = byB.get(fl.b);
      if (!bs) {
        bs = { b: fl.b, byF: [], cars: [], carOf: {}, dockGate: 0, entGate: 0, queue: [] };
        byB.set(fl.b, bs);
        sim.blds.push(bs);
      }
      const fs = { fl, bs, tasks, crew: Math.min(CFG.moversPerFloor + Perks.crewBonus(), tasks.length), spawned: 0, movers: [], busy: new Set() };
      bs.byF[fl.f] = fs;
      sim.floors.push(fs);
      sim.total += tasks.length;
      sim.totalSecs += tasks.reduce((t, k) => t + k.secs, 0);
      tasks.sort((a, b) => (DELIVERY_ORDER[a.type] ?? 2) - (DELIVERY_ORDER[b.type] ?? 2));
    }
    for (const bs of sim.blds) {
      bs.ground = bs.byF[0] || bs.byF.find(Boolean);
      if (bs.byF.filter(Boolean).length < 2 || Perks.stairsOnly()) continue;
      for (const kind of ['cargo', 'service', 'passenger']) {
        if (!bs.byF.every((fs) => !fs || padCell(fs.fl, kind))) continue;
        const car = makeCar(bs, kind);
        bs.cars.push(car);
        bs.carOf[kind] = car;
      }
    }
    setProgress(progressText());
    status.show();
    status.log(`Moving started: ${sim.total} objects across ${state.floors.length} ${state.floors.length === 1 ? 'floor' : 'floors'}`);
    status.head(`Mover crews entering via the ${sim.blds.some((bs) => bs.ground.fl.layout.dock) ? 'loading dock' : 'main entrance'}`, true);
    if (sim.blds.some((bs) => bs.cars.length)) status.log(`Elevator capacity: ${Object.values(ELEVATORS).sort((a, b) => b.cap - a.cap).map((e) => `${e.name} ${e.cap}`).join(', ')} (a pawn counts 1, objects 0.5 to 2)`);
    if (Perks.stairsOnly() && sim.blds.some((bs) => bs.byF.filter(Boolean).length > 1)) status.log(`No elevators: ${Perks.stairSecs()}s per floor on the stairs, each way`);
    if (sim.retrieveSecs > 0) status.log(`Truck retrieval: ${+sim.retrieveSecs.toFixed(1)}s per object`);
    if (sim.flooringSecs) status.log(`Protective flooring: ${sim.flooringSecs}s per tile on the way out`);
    if (sim.cleanSecs) status.log(`Cleaning: ${sim.cleanSecs}s per desk, then ${sim.vacuumSecs}s per tile vacuuming back`);
    run();
  }

  // First task, in delivery order, whose destination no other Mover is using.
  const nextFree = (fs) => fs.tasks.findIndex((t) => !fs.busy.has(t.ws.id));

  function takeTask(fs, m) {
    m.task = fs.tasks.splice(nextFree(fs), 1)[0];
    fs.busy.add(m.task.ws.id);
    m.carry = m.task.type;
    m.pawn.cargo.textContent = OBJECT_TYPES[m.task.type].emoji;
    m.pawn.cargo.setAttribute('font-size', 6.5);
    m.phase = 'out';
    startLegs(m, journey(fs.bs, fs.fl, m.task.ws, dockOf(fs.bs), UP_MOVER, true, true), () => beginDeploy(fs, m));
  }

  function spawnMover(fs) {
    const bs = fs.bs;
    const m = { kind: 'mover', fs, bs, pawn: makePawn(bs.ground.fl, 'mover'), phase: 'out', t: 0, mode: 'idle', task: null, carry: null, spot: null };
    const d = cellCentre(dockOf(bs));
    putPawn(m.pawn, d.x, d.y);
    fs.movers.push(m);
    takeTask(fs, m);
  }

  function beginDeploy(fs, m) {
    const p = m.pawn;
    m.phase = 'deploy';
    m.t = 0;
    status.head(`${DEPLOY[m.task.type][0]} at ${m.task.emp.fullName}’s desk (${floorTag(fs.fl)})`);
    p.track.setAttribute('visibility', 'visible');
    p.prog.setAttribute('visibility', 'visible');
    p.prog.setAttribute('stroke', '#22c55e');
  }

  // Empty-handed, the Mover heads back to the dock: the same trip in reverse, by the service lift.
  function startBack(fs, m) {
    m.carry = null;
    m.phase = 'back';
    startLegs(m, journey(fs.bs, fs.fl, m.task.ws, dockOf(fs.bs), DOWN_MOVER, true, false), () => arriveDock(fs, m));
  }

  function arriveDock(fs, m) {
    const p = m.pawn;
    p.cargo.textContent = '';
    if (!fs.tasks.length) m.phase = 'exit';
    else if (sim.retrieveSecs > 0) {
      m.phase = 'fetch';
      m.t = 0;
      p.prog.setAttribute('stroke', '#38bdf8');
      p.prog.setAttribute('stroke-dasharray', '0 100');
      p.track.setAttribute('visibility', 'visible');
      p.prog.setAttribute('visibility', 'visible');
      status.head(`Retrieving the next object from the truck (${floorTag(fs.fl)})`);
    } else if (nextFree(fs) >= 0) takeTask(fs, m);
    else m.phase = 'wait';
  }

  function stepMover(fs, m, dt, spd) {
    const p = m.pawn;
    if (m.mode !== 'idle') {
      walkerStep(m, dt, m.phase === 'out' ? 1 / (1 / spd + sim.flooringSecs) : m.phase === 'back' ? 1 / (1 / spd + sim.vacuumSecs) : spd);
    } else if (m.phase === 'deploy') {
      m.t += dt;
      p.prog.setAttribute('stroke-dasharray', `${Math.min(100, (m.t / m.task.secs) * 100)} 100`);
      if (m.t >= m.task.secs) {
        const broke = Math.random() < Perks.breakChance(m.task.type);
        const cleaning = !broke && sim.cleanSecs > 0;
        effect(fs.fl, 'poof', broke ? '💥' : '💨', p.x + 5, p.y - 5);
        FX.play(broke ? 'error' : 'pop');
        p.cargo.textContent = cleaning ? '🧹' : '';
        p.track.setAttribute('visibility', cleaning ? 'visible' : 'hidden');
        p.prog.setAttribute('visibility', cleaning ? 'visible' : 'hidden');
        p.prog.setAttribute('stroke', '#a78bfa');
        p.prog.setAttribute('stroke-dasharray', '0 100');
        if (!cleaning) fs.busy.delete(m.task.ws.id);
        if (broke) {
          // The replacement goes to the front of the queue, so the Mover heads straight back out with it.
          state.damage += Perks.damageCost(m.task.type);
          state.broken++;
          fs.tasks.unshift(m.task);
          status.log(`Breakage: ${OBJECT_TYPES[m.task.type].name.toLowerCase()} for ${m.task.emp.fullName} (${floorTag(fs.fl)}) damaged; replacement dispatched, -$${Perks.damageCost(m.task.type)}`);
          status.head(`Replacing damaged ${OBJECT_TYPES[m.task.type].name.toLowerCase()} for ${m.task.emp.fullName}`, true);
        } else {
          sim.delivered++;
          sim.doneSecs += m.task.secs;
          status.log(`${DEPLOY[m.task.type][1]} at ${m.task.emp.fullName}’s desk (${floorTag(fs.fl)})`);
          const frac = sim.doneSecs / Math.max(1, sim.totalSecs);
          for (const at of [0.25, 0.5, 0.75]) {
            if (frac >= at && !sim.said[at]) { sim.said[at] = true; status.log(`Moving ${at * 100}% complete (${sim.delivered}/${sim.total} objects)`); }
          }
        }
        status.bar('moving', sim.doneSecs / Math.max(1, sim.totalSecs));
        setProgress(progressText());
        if (cleaning) status.head(`Cleaning ${m.task.emp.fullName}’s desk (${floorTag(fs.fl)})`);
        m.t = 0;
        if (cleaning) m.phase = 'clean'; else startBack(fs, m);
      }
    } else if (m.phase === 'clean') {
      m.t += dt;
      p.prog.setAttribute('stroke-dasharray', `${Math.min(100, (m.t / sim.cleanSecs) * 100)} 100`);
      if (m.t >= sim.cleanSecs) {
        status.log(`Cleaned ${m.task.emp.fullName}’s desk (${floorTag(fs.fl)})`);
        p.track.setAttribute('visibility', 'hidden');
        p.prog.setAttribute('visibility', 'hidden');
        fs.busy.delete(m.task.ws.id);
        startBack(fs, m);
      }
    } else if (m.phase === 'fetch') {
      m.t += dt;
      p.prog.setAttribute('stroke-dasharray', `${Math.min(100, (m.t / sim.retrieveSecs) * 100)} 100`);
      if (m.t >= sim.retrieveSecs) {
        p.track.setAttribute('visibility', 'hidden');
        p.prog.setAttribute('visibility', 'hidden');
        if (!fs.tasks.length) m.phase = 'exit';
        else if (nextFree(fs) >= 0) takeTask(fs, m);
        else m.phase = 'wait';
      }
    } else if (m.phase === 'wait') {
      if (!fs.tasks.length) m.phase = 'exit';
      else if (nextFree(fs) >= 0) takeTask(fs, m);
    } else if (m.phase === 'exit') {
      if (sim.t >= fs.bs.dockGate) {
        fs.bs.dockGate = sim.t + SPAWN_GAP;
        p.cargo.textContent = '👋';
        p.cargo.setAttribute('font-size', 8);
        m.phase = 'wave';
        m.t = 0;
      }
    } else if (m.phase === 'wave') {
      m.t += dt;
      if (m.t >= 0.7) { releaseSpot(m); dropPawn(p); m.phase = 'gone'; }
    }
  }

  function stepExecute(dt) {
    const spd = moverSpeed();
    for (const bs of sim.blds) bs.cars.forEach((car) => stepCar(car, dt));
    for (const fs of sim.floors) {
      const bs = fs.bs;
      if (fs.spawned < fs.crew && nextFree(fs) >= 0 && sim.t >= bs.dockGate && cellClear(bs.ground.fl, dockOf(bs))) {
        bs.dockGate = sim.t + SPAWN_GAP;
        fs.spawned++;
        if (fs.spawned === 1) status.log(`${floorTag(fs.fl)}: ${fs.crew}-mover crew on site`);
        spawnMover(fs);
      }
      fs.movers.forEach((m) => stepMover(fs, m, dt, spd));
      if (!fs.released && fs.spawned && !fs.tasks.length && fs.movers.every((m) => m.phase === 'gone')) {
        fs.released = true;
        status.log(`${floorTag(fs.fl)}: all objects delivered, crew released`);
      }
    }
    sim.blds.forEach(updateLabels);
    if (sim.endAt === null && sim.floors.every((fs) => !fs.tasks.length && fs.movers.every((m) => m.phase === 'gone'))) {
      sim.endAt = sim.t + 1;
      status.bar('moving', 1);
      status.log(`Moving complete: ${sim.delivered} objects delivered${state.broken ? `, ${state.broken} replaced` : ''}`);
    }
    if (sim.endAt !== null && sim.t >= sim.endAt) beginFeedback();
  }

  // Planned at evening or night: day breaks once the Movers are done, so the employees arrive in the morning.
  function beginFeedback() {
    if (!['evening', 'night'].includes(state.job?.timeOfDay)) { feedback(); return; }
    sim.mode = 'dawn';
    sim.dawnEnd = sim.t + DAWN_SECS;
    const secs = DAWN_SECS / speed;
    Lighting.apply(svg, 'morning', secs);
    state.floors.forEach((fl) => Lighting.transition(fl, 'morning', secs));
    status.log('Day breaks: the employees will arrive in the morning');
    status.head('Day is breaking before the employees arrive', true);
  }

  function stepDawn(dt) {
    for (const bs of sim.blds) bs.cars.forEach((car) => stepCar(car, dt));
    if (sim.t >= sim.dawnEnd) feedback();
  }

  // ----- Feedback: employees walk in, in no particular order, and react to their seats -----
  function feedback() {
    setPhase('feedback');
    sim.mode = 'feedback';
    sim.arrived = 0;
    sim.endAt = null;
    sim.tally = { happy: 0, ok: 0, meh: 0, angry: 0 };
    sim.seated = state.workstations.filter((w) => w.assignedEmployeeId !== null).length;
    sim.emps = [];
    state.walkingIds = new Set(state.workstations.filter((w) => w.assignedEmployeeId !== null).map((w) => w.assignedEmployeeId));
    for (const bs of sim.blds) {
      const queue = state.workstations.filter((w) => w.assignedEmployeeId !== null && state.floors[w.floor].b === bs.b);
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      bs.queue = queue;
      bs.entGate = sim.t;
    }
    renderDynamic();
    setProgress(`0/${sim.seated} employees`);
    status.stage('feedback');
    status.log(`Feedback started: ${sim.seated} employees entering through the main entrance`);
    status.head('Employees entering through the main entrance', true);
  }

  function bubble(fl, ws, r) {
    const n = [...r.face].length;
    const w = 6 + n * 9;
    const outer = node('g', { transform: `translate(${(ws.desk.x + ws.desk.w / 2) * 10} ${ws.gridY * 10 + 2})`, 'pointer-events': 'none' });
    const inner = node('g', { class: `bubble ${r.mood}` });
    inner.append(
      node('rect', { x: -w / 2, y: -13, width: w, height: 11, rx: 5.5, fill: '#fff', stroke: '#64748b', 'stroke-width': 0.8 }),
      node('polygon', { points: '-2,-2.6 2,-2.6 0,0.6', fill: '#fff' }),
      node('text', { y: -7.5, 'font-size': 8, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, r.face)
    );
    outer.append(inner);
    fl.walkers.append(outer);
  }

  function seat(e) {
    const { ws, fs } = e;
    sim.emps.splice(sim.emps.indexOf(e), 1);
    releaseSpot(e);
    dropPawn(e.pawn);
    const emp = state.employees[ws.assignedEmployeeId];
    state.walkingIds.delete(emp.id);
    renderDynamic();
    const r = reactionFor(emp, ws);
    sim.tally[r.mood]++;
    bubble(fs.fl, ws, r);
    FX.play(r.mood === 'angry' ? 'error' : 'click');
    sim.arrived++;
    const reqs = requirementStatus(emp);
    const line = `${emp.fullName} seated on ${floorTag(fs.fl)}: ${reqs.length ? `${reqs.filter((q) => q.met).length}/${reqs.length} requirements met` : 'no requirements'}, preference ${preferenceMet(emp, ws) ? 'met' : 'not met'}`;
    status.log(line);
    status.head(line);
    status.bar('feedback', sim.arrived / Math.max(1, sim.seated));
    setProgress(`${sim.arrived}/${sim.seated} employees`);
  }

  function stepFeedback(dt) {
    for (const bs of sim.blds) {
      bs.cars.forEach((car) => stepCar(car, dt));
      const G = bs.ground.fl;
      const door = G.layout.entrance;
      if (bs.queue.length && sim.t >= bs.entGate && cellClear(G, door)) {
        const ws = bs.queue.shift();
        const fs = bs.byF[floorOf(ws).f];
        const e = { kind: 'emp', ws, fs, bs, pawn: makePawn(G, 'emp', TEAM_COLORS[state.employees[ws.assignedEmployeeId].dept]), mode: 'idle', spot: null };
        const c = cellCentre(door);
        putPawn(e.pawn, c.x, c.y);
        sim.emps.push(e);
        bs.entGate = sim.t + 0.2 + Math.random() * 0.7;
        startLegs(e, journey(bs, fs.fl, ws, door, UP_STAFF, false, true), () => seat(e));
      }
      updateLabels(bs);
    }
    for (const e of [...sim.emps]) walkerStep(e, dt, CFG.walkSpeed);
    if (sim.endAt === null && sim.arrived === sim.seated) sim.endAt = sim.t + 0.8;
    if (sim.endAt !== null && sim.t >= sim.endAt) {
      const t = sim.tally;
      const seated = sim.seated;
      status.hide();
      setPhase('done');
      celebration.show(t, seated);
      cancelAnimationFrame(raf);
      raf = 0;
      sim = null;
    }
  }

  // Foot traffic: every cell a pawn walks through earns the distance walked there (one cell crossed = 1).
  function trackTraffic() {
    for (const fl of state.floors) {
      const W = fl.layout.width;
      const H = fl.layout.height;
      for (const p of fl.live) {
        if (p.tx !== undefined) {
          const d = Math.hypot(p.x - p.tx, p.y - p.ty);
          const cx = Math.floor(p.x / 10);
          const cy = Math.floor(p.y / 10);
          if (d > 0.01 && d < 40 && cx >= 0 && cy >= 0 && cx < W && cy < H) fl.heat[cy * W + cx] += d / 10;
        }
        p.tx = p.x;
        p.ty = p.y;
      }
    }
  }

  function tick(ts) {
    raf = requestAnimationFrame(tick);
    if (!sim || sim.gen !== state.gen) { stop(); return; }
    let rem = Math.min((ts - lastTs) / 1000, 0.1) * speed;
    lastTs = ts;
    if (document.querySelector('#tutorial, #modal-root .modal-overlay')) return;
    // Small steps keep fast playback from skipping pawns past each other.
    while (rem > 1e-9 && sim) {
      const d = Math.min(rem, 0.05);
      rem -= d;
      sim.t += d;
      if (sim.mode === 'execute') stepExecute(d); else if (sim.mode === 'dawn') stepDawn(d); else stepFeedback(d);
      if (sim) trackTraffic();
    }
    animatePawns();
  }

  function run() {
    lastTs = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    sim = null;
    for (const fl of state.floors) {
      fl.walkers?.replaceChildren();
      fl.live = new Set();
      fl.spots = {};
    }
    status.hide();
    celebration.hide();
  }

  function cycleSpeed() {
    speed = SIM_SPEEDS[(SIM_SPEEDS.indexOf(speed) + 1) % SIM_SPEEDS.length];
    document.getElementById('speed-btn').textContent = `\u23e9 ${speed}\u00d7`;
  }

  function reset() {
    stop();
    setPhase('planning');
  }

  return { begin, stop, reset, cycleSpeed, hideSummary: () => celebration.hide() };
})();
