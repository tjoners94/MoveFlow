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

  function makePawn(fl, emoji) {
    const g = node('g');
    const track = node('circle', { r: 8, fill: 'none', stroke: 'rgba(0,0,0,.18)', 'stroke-width': 2.2, visibility: 'hidden' });
    const prog = node('circle', { r: 8, fill: 'none', stroke: '#22c55e', 'stroke-width': 2.2, 'stroke-linecap': 'round', pathLength: 100, 'stroke-dasharray': '0 100', transform: 'rotate(-90)', visibility: 'hidden' });
    const body = node('text', { 'font-size': 10, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, emoji);
    const cargo = node('text', { x: 5, y: -5, 'font-size': 6.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    g.append(track, prog, body, cargo);
    fl.walkers.append(g);
    return { g, track, prog, body, cargo, x: 0, y: 0 };
  }

  function place(pawn, pts, f) {
    const i = Math.min(Math.floor(f), pts.length - 1);
    const a = pts[i];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    const t = f - i;
    pawn.x = (a.x + (b.x - a.x) * t) * 10;
    pawn.y = (a.y + (b.y - a.y) * t) * 10 + Math.sin(f * 2.4) * 0.8;
    pawn.g.setAttribute('transform', `translate(${pawn.x} ${pawn.y})`);
  }

  // Cell centres from a spawn point to a desk, cached on the desk. Employees always start at the public entrance or elevator.
  // Movers always keep to Primary and Secondary Pathways. Rooms and doors stay open, and Open Seating
  // areas (the room plus a two-tile apron, since they have no door onto a pathway) are free to cross to any desk.
  function openSeatingZone(fl) {
    if (!fl.openZone) {
      const { rooms, width, height } = fl.layout;
      const zone = Array.from({ length: height }, () => new Array(width).fill(false));
      for (const r of rooms) {
        if (r.type !== 'open') continue;
        for (let y = Math.max(0, r.y - 2); y < Math.min(height, r.y + r.h + 2); y++) for (let x = Math.max(0, r.x - 2); x < Math.min(width, r.x + r.w + 2); x++) zone[y][x] = true;
      }
      fl.openZone = zone;
    }
    return fl.openZone;
  }
  function pathwayGrid(fl, goal, reach) {
    const { grid, pathType } = fl.layout;
    const zone = openSeatingZone(fl);
    const near = (x, y) => Math.abs(x - goal.x) + Math.abs(y - goal.y) <= reach;
    return fl.navGrid.map((row, y) => row.map((c, x) => (c === 0 && grid[y][x] === CELL.HALL && !pathType[y][x] && !zone[y][x] && !near(x, y) ? 1 : c)));
  }
  function routeFrom(ws, spawn, pathwaysOnly = false) {
    const key = `${spawn.x},${spawn.y}${pathwaysOnly ? 'p' : ''}`;
    ws.routes = ws.routes || {};
    if (!ws.routes[key]) {
      const fl = floorOf(ws);
      const goal = { x: ws.gridX, y: ws.gridY };
      let cells = [];
      if (pathwaysOnly) for (const reach of [0, 2, 4, 8, 16]) { cells = findPath(pathwayGrid(fl, goal, reach), spawn, goal); if (cells.length) break; }
      if (!cells.length) cells = findPath(fl.navGrid, spawn, goal);
      const pts = cells.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 }));
      if (pts.length) pts[pts.length - 1].x = ws.desk.x + ws.desk.w / 2;
      ws.routes[key] = pts;
    }
    return ws.routes[key];
  }
  const routeTo = (ws) => routeFrom(ws, floorOf(ws).layout.entrance);

  // Where Movers appear: the loading dock on the ground floor; upstairs the service elevator, or the stairs with No Elevators.
  function moverSpawn(fl) {
    const s = fl.layout.spawns;
    if (fl.f === 0) return s.dock || s.entrance;
    return (Perks.stairsOnly() ? s.stairs : s.serviceElevator) || s.serviceElevator || s.stairs || s.entrance;
  }

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
  const spawnName = (fl, spawn) => {
    const s = fl.layout.spawns;
    return spawn === s.dock ? 'loading dock' : spawn === s.serviceElevator ? 'service elevator' : spawn === s.stairs ? 'stairs' : fl.f === 0 ? 'entrance' : 'public elevator';
  };
  const entryName = (fl) => (fl.f === 0 ? 'entrance' : 'public elevator');
  const DEPLOY = { plant: ['Placing plant', 'Placed plant'], box: ['Unpacking boxes', 'Unpacked boxes'], computer: ['Installing computer', 'Installed computer'], furniture: ['Assembling furniture', 'Assembled furniture'] };
  const unique = (list) => {
    const u = [...new Set(list)];
    return u.length > 1 ? `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}` : u[0] || '';
  };

  // ----- Execute: Movers carry each object from the entrance to its desk -----
  function begin() {
    stop();
    setPhase('execute');
    state.damage = 0;
    state.broken = 0;
    sim = {
      gen: state.gen, t: 0, mode: 'execute', floors: [], total: 0, delivered: 0, doneSecs: 0, totalSecs: 0, said: {}, endAt: null,
      flooringSecs: Perks.flooringSecs(), vacuumSecs: Perks.vacuumSecs(), cleanSecs: Perks.cleanSecs(), retrieveSecs: Perks.retrieveSecs()
    };
    for (const fl of state.floors) {
      const tasks = [];
      for (const ws of state.workstations) {
        if (ws.floor !== fl.idx || ws.assignedEmployeeId === null) continue;
        const emp = state.employees[ws.assignedEmployeeId];
        cargoOf(emp).forEach((type) => tasks.push({ emp, ws, type, secs: Perks.deploySecs(type) }));
      }
      sim.floors.push({ fl, tasks, spawn: moverSpawn(fl), crew: Math.min(CFG.moversPerFloor + Perks.crewBonus(), tasks.length), spawned: 0, gate: Perks.floorTransit() * fl.f, movers: [], queue: [], walkers: [], busy: new Set() });
      sim.total += tasks.length;
      sim.totalSecs += tasks.reduce((t, k) => t + k.secs, 0);
      tasks.sort((a, b) => (DELIVERY_ORDER[a.type] ?? 2) - (DELIVERY_ORDER[b.type] ?? 2));
    }
    setProgress(progressText());
    status.show();
    status.log(`Moving started: ${sim.total} objects across ${state.floors.length} ${state.floors.length === 1 ? 'floor' : 'floors'}`);
    status.head(`Mover crews entering via ${unique(sim.floors.map((fs) => spawnName(fs.fl, fs.spawn)))}`, true);
    if (sim.retrieveSecs > 0) status.log(`Truck retrieval: ${+sim.retrieveSecs.toFixed(1)}s per object`);
    if (sim.flooringSecs) status.log(`Protective flooring: ${sim.flooringSecs}s per tile on the way out`);
    if (sim.cleanSecs) status.log(`Cleaning: ${sim.cleanSecs}s per desk, then ${sim.vacuumSecs}s per tile vacuuming back`);
    for (const fs of sim.floors) {
      if (fs.gate > 0 && fs.tasks.length) status.log(`${floorTag(fs.fl)}: crew climbing the stairs, on site in ${fs.gate}s`);
    }
    run();
  }

  // First task, in delivery order, whose destination no other Mover is using.
  const nextFree = (fs) => fs.tasks.findIndex((t) => !fs.busy.has(t.ws.id));

  function takeTask(fs, m) {
    m.task = fs.tasks.splice(nextFree(fs), 1)[0];
    fs.busy.add(m.task.ws.id);
    m.pts = routeFrom(m.task.ws, fs.spawn, true);
    m.f = 0;
    m.phase = 'out';
    m.pawn.cargo.textContent = OBJECT_TYPES[m.task.type].emoji;
    m.pawn.cargo.setAttribute('font-size', 6.5);
    place(m.pawn, m.pts, 0);
  }

  function stepMover(fs, m, dt, spd) {
    const p = m.pawn;
    if (m.phase === 'out') {
      m.f += dt / (1 / spd + sim.flooringSecs);
      if (m.f >= m.pts.length - 1) {
        m.f = m.pts.length - 1;
        m.phase = 'deploy';
        m.t = 0;
        status.head(`${DEPLOY[m.task.type][0]} at ${m.task.emp.fullName}’s desk (${floorTag(fs.fl)})`);
        p.track.setAttribute('visibility', 'visible');
        p.prog.setAttribute('visibility', 'visible');
        p.prog.setAttribute('stroke', '#22c55e');
      }
      place(p, m.pts, m.f);
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
        m.phase = cleaning ? 'clean' : 'back';
        m.t = 0;
      }
    } else if (m.phase === 'clean') {
      m.t += dt;
      p.prog.setAttribute('stroke-dasharray', `${Math.min(100, (m.t / sim.cleanSecs) * 100)} 100`);
      if (m.t >= sim.cleanSecs) {
        status.log(`Cleaned ${m.task.emp.fullName}’s desk (${floorTag(fs.fl)})`);
        p.track.setAttribute('visibility', 'hidden');
        p.prog.setAttribute('visibility', 'hidden');
        fs.busy.delete(m.task.ws.id);
        m.phase = 'back';
      }
    } else if (m.phase === 'back') {
      m.f -= dt / (1 / spd + sim.vacuumSecs);
      place(p, m.pts, Math.max(0, m.f));
      if (m.f <= 0) {
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
      if (sim.t >= fs.gate) {
        fs.gate = sim.t + SPAWN_GAP;
        p.cargo.textContent = '👋';
        p.cargo.setAttribute('font-size', 8);
        m.phase = 'wave';
        m.t = 0;
      }
    } else if (m.phase === 'wave') {
      m.t += dt;
      if (m.t >= 0.7) { p.g.remove(); m.phase = 'gone'; }
    }
  }

  function stepExecute(dt) {
    const spd = moverSpeed();
    for (const fs of sim.floors) {
      if (fs.spawned < fs.crew && nextFree(fs) >= 0 && sim.t >= fs.gate) {
        fs.gate = sim.t + SPAWN_GAP;
        fs.spawned++;
        if (fs.spawned === 1) status.log(`${floorTag(fs.fl)}: ${fs.crew}-mover crew on site via ${spawnName(fs.fl, fs.spawn)}`);
        const m = { pawn: makePawn(fs.fl, '👷'), phase: 'out', t: 0, f: 0, pts: [], task: null };
        fs.movers.push(m);
        takeTask(fs, m);
      }
      fs.movers.forEach((m) => stepMover(fs, m, dt, spd));
      if (!fs.released && fs.spawned && !fs.tasks.length && fs.movers.every((m) => m.phase === 'gone')) {
        fs.released = true;
        status.log(`${floorTag(fs.fl)}: all objects delivered, crew released`);
      }
    }
    if (sim.endAt === null && sim.floors.every((fs) => !fs.tasks.length && fs.movers.every((m) => m.phase === 'gone'))) {
      sim.endAt = sim.t + 1;
      status.bar('moving', 1);
      status.log(`Moving complete: ${sim.delivered} objects delivered${state.broken ? `, ${state.broken} replaced` : ''}`);
    }
    if (sim.endAt !== null && sim.t >= sim.endAt) feedback();
  }

  // ----- Feedback: employees walk in and react to their seats -----
  function feedback() {
    setPhase('feedback');
    sim.mode = 'feedback';
    sim.arrived = 0;
    sim.endAt = null;
    sim.tally = { happy: 0, ok: 0, meh: 0, angry: 0 };
    sim.seated = state.workstations.filter((w) => w.assignedEmployeeId !== null).length;
    state.walkingIds = new Set(state.workstations.filter((w) => w.assignedEmployeeId !== null).map((w) => w.assignedEmployeeId));
    for (const fs of sim.floors) {
      fs.queue = state.workstations.filter((w) => w.floor === fs.fl.idx && w.assignedEmployeeId !== null);
      fs.gate = sim.t;
    }
    renderDynamic();
    setProgress(`0/${sim.seated} employees`);
    status.stage('feedback');
    status.log(`Feedback started: ${sim.seated} employees entering via ${unique(sim.floors.filter((fs) => fs.queue.length).map((fs) => entryName(fs.fl)))}`);
    status.head(`Employees entering via ${unique(sim.floors.filter((fs) => fs.queue.length).map((fs) => entryName(fs.fl)))}`, true);
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

  function stepFeedback(dt) {
    for (const fs of sim.floors) {
      if (fs.queue.length && sim.t >= fs.gate) {
        fs.gate = sim.t + SPAWN_GAP;
        const ws = fs.queue.shift();
        const w = { ws, pawn: makePawn(fs.fl, '🧑‍💼'), pts: routeTo(ws), f: 0 };
        place(w.pawn, w.pts, 0);
        fs.walkers.push(w);
      }
      for (const w of [...fs.walkers]) {
        w.f += CFG.walkSpeed * dt;
        place(w.pawn, w.pts, Math.min(w.f, w.pts.length - 1));
        if (w.f < w.pts.length - 1) continue;
        fs.walkers.splice(fs.walkers.indexOf(w), 1);
        w.pawn.g.remove();
        const emp = state.employees[w.ws.assignedEmployeeId];
        state.walkingIds.delete(emp.id);
        renderDynamic();
        const r = reactionFor(emp, w.ws);
        sim.tally[r.mood]++;
        bubble(fs.fl, w.ws, r);
        FX.play(r.mood === 'angry' ? 'error' : 'click');
        sim.arrived++;
        const reqs = requirementStatus(emp);
        const line = `${emp.fullName} seated on ${floorTag(fs.fl)}: ${reqs.length ? `${reqs.filter((q) => q.met).length}/${reqs.length} requirements met` : 'no requirements'}, preference ${preferenceMet(emp, w.ws) ? 'met' : 'not met'}`;
        status.log(line);
        status.head(line);
        status.bar('feedback', sim.arrived / Math.max(1, sim.seated));
        setProgress(`${sim.arrived}/${sim.seated} employees`);
      }
    }
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

  function tick(ts) {
    raf = requestAnimationFrame(tick);
    if (!sim || sim.gen !== state.gen) { stop(); return; }
    const dt = Math.min((ts - lastTs) / 1000, 0.1) * speed;
    lastTs = ts;
    if (document.querySelector('#tutorial, #modal-root .modal-overlay')) return;
    sim.t += dt;
    if (sim.mode === 'execute') stepExecute(dt); else stepFeedback(dt);
  }

  function run() {
    lastTs = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    sim = null;
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
