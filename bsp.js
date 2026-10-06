const SVG_NS = 'http://www.w3.org/2000/svg';

// Grid cell types
const CELL = { HALL: 0, WALL: 1, ROOM: 2, DOOR: 3, DESK: 4, DECOR: 5, OUT: 6 };

function svgPoly(points, cls, fill) {
  const p = document.createElementNS(SVG_NS, 'polygon');
  p.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
  if (cls) p.setAttribute('class', cls);
  p.setAttribute('fill', fill);
  return p;
}

function rectPoints(x, y, w, h, s) {
  return [[x * s, y * s], [(x + w) * s, y * s], [(x + w) * s, (y + h) * s], [x * s, (y + h) * s]];
}

class BSPNode {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.left = null;
    this.right = null;
    this.room = null;
  }

  // Recursively split until leaves reach minSize (or randomly stop once small enough).
  // Each cut leaves a pathway strip between its halves: 3 cells wide (primary) near the root, 2 (secondary) deeper.
  split(minSize, maxSize, rng, depth = 0, strips = []) {
    const gap = depth === 0 ? 1 : 0;
    const canH = this.h >= minSize * 2 + gap;
    const canV = this.w >= minSize * 2 + gap;
    const mustSplit = this.w > maxSize || this.h > maxSize;
    if ((!canH && !canV) || (!mustSplit && rng() < 0.3)) return;

    const horizontal = canH && canV ? this.h >= this.w : canH;
    const total = horizontal ? this.h : this.w;
    const cut = Math.round(total * (0.4 + rng() * 0.2));
    const at = Math.min(Math.max(cut, minSize), total - minSize - gap);

    if (horizontal) {
      this.left = new BSPNode(this.x, this.y, this.w, at);
      this.right = new BSPNode(this.x, this.y + at + gap, this.w, this.h - at - gap);
      strips.push({ x: this.x, y: this.y + at - 1, w: this.w, h: 2 + gap, primary: depth <= 1 });
    } else {
      this.left = new BSPNode(this.x, this.y, at, this.h);
      this.right = new BSPNode(this.x + at + gap, this.y, this.w - at - gap, this.h);
      strips.push({ x: this.x + at - 1, y: this.y, w: 2 + gap, h: this.h, primary: depth <= 1 });
    }
    this.left.split(minSize, maxSize, rng, depth + 1, strips);
    this.right.split(minSize, maxSize, rng, depth + 1, strips);
  }

  leaves(out = []) {
    if (!this.left) out.push(this);
    else { this.left.leaves(out); this.right.leaves(out); }
    return out;
  }

  /**
   * Office floor plan: an exterior shell with windows and an entrance; each BSP leaf becomes a
   * private office, meeting room or break room (walled, one door) or an open-plan desk zone.
   * Workstation = desk cells (blocked) + a walkable chair cell (the path destination).
   * Returns { grid, rooms, workstations, doors, decor, windows, entrance, elements, ... }.
   */
  static generate(width, height, { minSize = 10, maxSize = 22, cellSize = 10, seed = Date.now(), seats = 0, offices = 0, phones = 0, reception = false, cafes = 0, lounges = 0, specials = {}, plain = false, upper = false, shellSeed } = {}) {
    let seedState = seed >>> 0;
    const rng = () => ((seedState = (seedState * 1664525 + 1013904223) >>> 0) / 4294967296);

    const root = new BSPNode(1, 1, width - 2, height - 2);
    const strips = [];
    root.split(minSize, maxSize, rng, 0, strips);

    // Exterior shell: any polygon of straight and rarely curved edges (see makeShell).
    // Floors of one building share a shell seed so they share a footprint.
    let shellState = shellSeed === undefined ? 0 : shellSeed >>> 0;
    const shellRng = shellSeed === undefined ? rng : () => ((shellState = (shellState * 1664525 + 1013904223) >>> 0) / 4294967296);
    const shell = BSPNode.makeShell(width, height, shellRng, plain);
    const grid = Array.from({ length: height }, () => new Array(width).fill(CELL.OUT));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (shell.inside[y][x]) grid[y][x] = CELL.HALL;
    const outAt = (x, y) => grid[y]?.[x] === undefined || grid[y][x] === CELL.OUT;
    const extWalls = new Set();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === CELL.HALL && (outAt(x + 1, y) || outAt(x - 1, y) || outAt(x, y + 1) || outAt(x, y - 1))) {
          grid[y][x] = CELL.WALL;
          extWalls.add(`${x},${y}`);
        }
      }
    }
    let interiorCount = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (grid[y][x] === CELL.HALL) interiorCount++;

    // Leaves must sit fully inside the shell; trim any that poke out toward the nearest edge.
    const interiorAt = (x, y) => grid[y]?.[x] === CELL.HALL;
    const firstOutside = (l) => {
      for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) if (!interiorAt(x, y)) return { x, y };
      return null;
    };
    const leaves = [];
    for (const raw of root.leaves()) {
      const l = { x: raw.x, y: raw.y, w: raw.w, h: raw.h };
      for (let guard = 0; guard < 40 && l.w >= 8 && l.h >= 8; guard++) {
        const bad = firstOutside(l);
        if (!bad) break;
        const dl = bad.x - l.x;
        const dr = l.x + l.w - 1 - bad.x;
        const dt = bad.y - l.y;
        const db = l.y + l.h - 1 - bad.y;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) { l.x += dl + 1; l.w -= dl + 1; }
        else if (m === dr) l.w -= dr + 1;
        else if (m === dt) { l.y += dt + 1; l.h -= dt + 1; }
        else l.h -= db + 1;
      }
      if (l.w >= 8 && l.h >= 8 && !firstOutside(l)) leaves.push(l);
    }

    const midX = Math.floor(width / 2);
    let entrance = { x: midX, y: height - 2 };
    let entranceCells = [];
    const placeEntrance = (want) => {
      const flat = (c) => [c - 1, c, c + 1].every((x) => grid[height - 1][x] === CELL.WALL);
      let cx = want;
      for (let d = 0; d < width && !flat(cx); d++) cx = [want + d, want - d].find(flat) ?? cx;
      entrance = { x: cx, y: height - 2 };
      // Only the ground floor has a door to the street; upper floors reach this spot by elevator.
      entranceCells = upper ? [] : [cx - 1, cx, cx + 1].map((x) => ({ x, y: height - 1 }));
      entranceCells.forEach((c) => { grid[c.y][c.x] = CELL.DOOR; });
    };

    // Windows on straight exterior segments only.
    const windows = [];
    for (const key of extWalls) {
      const [x, y] = key.split(',').map(Number);
      if (grid[y][x] !== CELL.WALL) continue;
      const ou = outAt(x, y - 1);
      const od = outAt(x, y + 1);
      const ol = outAt(x - 1, y);
      const or = outAt(x + 1, y);
      if (ou !== od && !ol && !or) {
        if (x % 12 >= 4 && x % 12 < 8) windows.push({ x, y, h: true });
      } else if (ol !== or && !ou && !od) {
        if (y % 10 >= 4 && y % 10 < 8) windows.push({ x, y, h: false });
      }
    }

    // Seat budget: headcount plus the spare-desk share of assignable seats; phone booths are shared and sit on top of that.
    const phonesAsked = Math.max(0, phones);
    const T = Math.max(seats, Math.ceil(seats * (1 + SPARE_DESK_SHARE))) + phonesAsked;
    const wantOffices = Math.max(0, offices);
    const wantPhones = Math.min(phonesAsked, Math.max(0, T - wantOffices - (reception ? 1 : 0)));
    const specialWant = Object.fromEntries(Object.entries(specials).filter(([t, n]) => SPECIAL_ROOMS[t] && n > 0));
    const specialCount = Object.values(specialWant).reduce((a, n) => a + n, 0);
    // each set: 1 large (10 people) + 2 small (4 people); industry rooms take over some of the meeting space
    const meetingSets = seats > 0 ? Math.max(1, Math.min(12, Math.ceil(seats / 8)) - Math.floor(specialCount / 2)) : 0;
    const wantBreaks = seats > 0 ? Math.min(4, Math.ceil(seats / 25)) : 0;
    const wantCafes = Math.max(0, cafes);

    const rooms = [];
    const workstations = [];
    const doors = [];
    const decor = [];
    const extraLabels = [];

    const fillDesk = (d) => {
      for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) grid[y][x] = CELL.DESK;
    };
    const addWs = (chair, desk, room, kind) => {
      const ws = { id: workstations.length, gridX: chair.x, gridY: chair.y, desk, kind, roomId: room.id, assignedEmployeeId: null };
      workstations.push(ws);
      room.desks.push(ws.id);
    };
    const addDecor = (type, x, y, w, h, color) => {
      decor.push({ type, x, y, w, h, color });
      if (type === 'chair') return;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = CELL.DECOR;
    };
    const newRoom = (type, x, y, w, h, label) => {
      const room = { id: rooms.length, type, x, y, w, h, desks: [], label, top: true };
      rooms.push(room);
      return room;
    };
    const carve = (r, walled) => {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
          grid[y][x] = walled && edge ? CELL.WALL : CELL.ROOM;
        }
      }
    };
    const addDoor = (r, x, y) => { grid[y][x] = CELL.DOOR; r.door = { x, y }; doors.push(r.door); };

    // Rare curved interior walls: at most one room per floor gets rounded corners, only where the corner opens onto free floor.
    let curveBudget = rng() < 0.2 ? 1 : 0;
    const curvedCells = new Set();
    const curveRoom = (room, r) => {
      if (curveBudget <= 0 || room.w < 6 || room.h < 6) return 0;
      const { x, y, w, h } = room;
      const open = (cx, cy) => grid[cy]?.[cx] === CELL.HALL;
      const flags = [open(x - 1, y) && open(x, y - 1), open(x + w, y) && open(x + w - 1, y - 1), open(x + w, y + h - 1) && open(x + w - 1, y + h), open(x - 1, y + h - 1) && open(x, y + h)];
      if (!flags.some(Boolean)) return 0;
      curveBudget--;
      room.round = { r, flags };
      return r;
    };
    // Applied after the door is placed so the cut never touches it.
    const applyCurve = (room) => {
      if (!room.round) return;
      const { r, flags } = room.round;
      const { x, y, w, h } = room;
      flags.forEach((on, c) => {
        if (!on) return;
        for (let j = 0; j < r; j++) {
          for (let i = 0; i < r; i++) {
            const cx = c === 1 || c === 2 ? x + w - 1 - i : x + i;
            const cy = c >= 2 ? y + h - 1 - j : y + j;
            const d = Math.hypot(i + 0.5 - r, j + 0.5 - r);
            if (d > r) grid[cy][cx] = CELL.HALL;
            else if (d > r - 1) grid[cy][cx] = CELL.WALL;
            else continue;
            curvedCells.add(`${cx},${cy}`);
          }
        }
      });
    };
    const doorColumn = (room, rr) => {
      const lo = room.x + (rr || 1);
      const hi = room.x + room.w - 1 - (rr || 1);
      return lo + Math.floor(rng() * (hi - lo + 1));
    };

    // Leaf data. ex*/ey*/ew/eh is the leaf area stretched to the exterior wall on any side that touches it,
    // so enclosed rooms attach to the wall instead of leaving a pathway behind them.
    const wallAt = (x, y) => extWalls.has(`${x},${y}`);
    const L = leaves.map((l, i) => {
      const span = (n, fn) => Array.from({ length: n }, (_, k) => k).every(fn);
      const left = span(l.h, (k) => wallAt(l.x - 1, l.y + k));
      const right = span(l.h, (k) => wallAt(l.x + l.w, l.y + k));
      const top = span(l.w, (k) => wallAt(l.x + k, l.y - 1));
      const bottom = span(l.w, (k) => wallAt(l.x + k, l.y + l.h));
      const rx = l.x + 1;
      const ry = l.y + 1;
      const rw = l.w - 2;
      const rh = l.h - 2;
      const ex = left ? l.x - 1 : rx;
      const ey = top ? l.y - 1 : ry;
      const ex2 = right ? l.x + l.w : rx + rw - 1;
      const ey2 = bottom ? l.y + l.h : ry + rh - 1;
      return { i, rx, ry, rw, rh, cx: l.x + l.w / 2, cy: l.y + l.h / 2, ext: { left, top, right, bottom }, ex, ey, ex2, ey2, ew: ex2 - ex + 1, eh: ey2 - ey + 1 };
    });
    const used = new Set();
    const reservedRects = [];
    const free = () => L.filter((l) => !used.has(l.i));
    const dist = (a, b) => Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
    const area = (l) => l.ew * l.eh;
    const openLeaves = [];
    const nearestOpen = (l) => openLeaves.reduce((best, o) => (!best || dist(l, o) < dist(l, best) ? o : best), null);
    const openDist = (l) => { const o = nearestOpen(l); return o ? dist(l, o) : 0; };

    // Reception always exists, on the bottom wall when possible, and the entrance opens directly in front of it.
    {
      const fits = (f) => f.rw >= 8 && f.rh >= 6;
      const bottomCenter = { cx: midX, cy: height };
      const l = free().filter((f) => fits(f) && f.ext.bottom).sort((a, b) => b.rw - a.rw)[0]
        || free().filter(fits).sort((a, b) => dist(a, bottomCenter) - dist(b, bottomCenter))[0];
      let entranceX = midX;
      if (l) {
        used.add(l.i);
        const foyer = l.ext.bottom && l.rh >= 9 ? 3 : 0; // clear foyer between the entrance and the lobby
        const w = Math.min(l.rw, 12);
        const h = Math.min(l.rh - foyer, 8);
        const room = newRoom('reception', l.rx + Math.floor((l.rw - w) / 2), l.ry + l.rh - h - foyer, w, h, upper ? 'LOBBY' : 'RECEPTION');
        reservedRects.push({ x: room.x, y: room.y + h, w, h: foyer + 1 });
        carve(room, false);
        const dx = room.x + Math.floor((w - 3) / 2);
        if (reception) {
          const desk = { x: dx, y: room.y + 2, w: 3, h: 1 };
          fillDesk(desk);
          addWs({ x: dx, y: room.y + 1 }, desk, room, 'reception');
        } else {
          addDecor('table', dx, room.y + 2, 3, 1);
        }
        addDecor('sofa', room.x + 1, room.y + h - 1, Math.min(4, w - 2), 1);
        if (w >= 8) addDecor('plant', room.x + w - 2, room.y + h - 1, 1, 1);
        if (l.ext.bottom) entranceX = room.x + Math.floor(w / 2);
      }
      placeEntrance(entranceX);
      windows.splice(0, windows.length, ...windows.filter((w) => !(w.y === height - 1 && Math.abs(w.x - entrance.x) <= 5)));
    }

    // Open seating: back-to-back desk pods, only as many as needed.
    const podSpots = (l) => {
      const spots = [];
      for (let y0 = l.ry + 1; y0 + 3 <= l.ry + l.rh - 1; y0 += 5) {
        for (let x0 = l.rx + 1; x0 + 1 <= l.rx + l.rw - 2; x0 += 3) spots.push({ x0, y0 });
      }
      return spots;
    };
    let openLeft = Math.max(0, T - wantOffices - wantPhones - workstations.length);
    let openNo = 0;
    for (const l of free().sort((a, b) => podSpots(b).length - podSpots(a).length)) {
      if (openLeft <= 0) break;
      const spots = podSpots(l);
      if (!spots.length) continue;
      used.add(l.i);
      openLeaves.push(l);
      const placedSeats = [];
      for (const { x0, y0 } of spots) {
        if (openLeft <= 0) break;
        placedSeats.push({ chair: { x: x0, y: y0 }, desk: { x: x0, y: y0 + 1, w: 2, h: 1 } });
        openLeft--;
        if (openLeft <= 0) break;
        placedSeats.push({ chair: { x: x0, y: y0 + 3 }, desk: { x: x0, y: y0 + 2, w: 2, h: 1 } });
        openLeft--;
      }
      const xs = placedSeats.flatMap((s) => [s.chair.x, s.chair.x + 1]);
      const ys = placedSeats.flatMap((s) => [s.chair.y, s.desk.y]);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const room = newRoom('open', minX - 1, minY - 1, Math.max(...xs) - minX + 3, Math.max(...ys) - minY + 3, `OPEN SEATING ${++openNo}`);
      for (const s of placedSeats) { fillDesk(s.desk); addWs(s.chair, s.desk, room, 'open'); }
    }

    // Phone rooms: 4x4 single-person booths attached to the exterior wall where they touch it, near open seating.
    const phoneSpots = (l) => {
      const spots = [];
      for (let r = 0; r < Math.floor(l.eh / 5); r++) {
        for (let c = 0; c < Math.floor((l.ew + 1) / 5); c++) spots.push({ x: l.ex + c * 5, y: l.ey + r * 5 });
      }
      return spots;
    };
    let phonesLeft = wantPhones;
    for (const l of free().filter((f) => phoneSpots(f).length).sort((a, b) => openDist(a) - openDist(b))) {
      if (phonesLeft <= 0) break;
      used.add(l.i);
      const spots = phoneSpots(l).slice(0, phonesLeft);
      for (const p of spots) {
        const room = newRoom('phone', p.x, p.y, 4, 4, '');
        carve(room, true);
        room.top = false;
        addDoor(room, p.x + 1 + Math.floor(rng() * 2), p.y + 3);
        const desk = { x: p.x + 1, y: p.y + 1, w: 2, h: 1 };
        fillDesk(desk);
        addWs({ x: p.x + 1, y: p.y + 2 }, desk, room, 'phone');
      }
      phonesLeft -= spots.length;
      extraLabels.push({ text: 'PHONE ROOMS', x: l.ex + 2, y: l.ey + 4.9 });
    }

    // 6x6 room blocks (offices, small meeting rooms). Rooms touching the exterior wall share it and
    // open their doors the other way; otherwise doors face the nearest open seating area.
    const blockPlan = (l, bh) => {
      const cols = Math.floor((l.ew - 1) / 5);
      if (cols < 1 || l.eh < bh) return [];
      let rowDefs;
      if (!l.ext.top && !l.ext.bottom && l.eh >= 2 * bh - 1) {
        // Back-to-back cluster sharing the middle wall; doors open outward.
        rowDefs = [{ y: l.ey, down: false }, { y: l.ey + bh - 1, down: true }];
      } else if (l.eh >= 2 * bh + 2) {
        rowDefs = [{ y: l.ey, down: true }, { y: l.ext.bottom ? l.ey2 - (bh - 1) : l.ey + bh + 2, down: false }];
      } else {
        let down;
        if (l.ext.top && !l.ext.bottom) down = true;
        else if (l.ext.bottom && !l.ext.top) down = false;
        else { const o = nearestOpen(l); down = o ? o.cy >= l.cy : true; }
        rowDefs = [{ y: down ? l.ey : l.ey2 - (bh - 1), down }];
      }
      return rowDefs.flatMap((r) => Array.from({ length: cols }, (_, c) => ({ x: l.ex + c * 5, y: r.y, down: r.down })));
    };
    const placeBlocks = (count, make, bh = 6) => {
      let left = count;
      for (const l of free().filter((f) => blockPlan(f, bh).length).sort((a, b) => openDist(a) - openDist(b))) {
        if (left <= 0) break;
        used.add(l.i);
        for (const p of blockPlan(l, bh)) {
          if (left <= 0) break;
          make(p);
          left--;
        }
      }
      return count - left;
    };
    const blockRoom = (type, p, label, bh = 6) => {
      const room = newRoom(type, p.x, p.y, 6, bh, label);
      carve(room, true);
      room.top = !p.down;
      addDoor(room, p.x + 1 + Math.floor(rng() * 4), p.down ? p.y + bh - 1 : p.y);
      return room;
    };

    let officeNo = 0;
    placeBlocks(wantOffices, (p) => {
      const room = blockRoom('office', p, `OFFICE ${String.fromCharCode(65 + (officeNo++ % 26))}`);
      const deskRow = p.down ? p.y + 1 : p.y + 4;
      const desk = { x: p.x + 2, y: deskRow, w: 2, h: 1 };
      fillDesk(desk);
      addWs({ x: p.x + 2, y: p.down ? deskRow + 1 : deskRow - 1 }, desk, room, 'office');
    });

    // A room sized to the leaf's exterior-attached corner, with its door away from any exterior wall.
    const placeRoomInLeaf = (l, type, w, h, label) => {
      const x = l.ext.right && !l.ext.left ? l.ex2 - w + 1 : l.ex;
      const y = l.ext.bottom && !l.ext.top ? l.ey2 - h + 1 : l.ey;
      const room = newRoom(type, x, y, w, h, label);
      carve(room, true);
      room.top = y === 0 ? false : y + h - 1 === height - 1 ? true : rng() < 0.5;
      addDoor(room, x + 1 + Math.floor(rng() * (w - 2)), room.top ? y : y + h - 1);
      return room;
    };
    const tableWithChairs = (x, y, tw) => {
      addDecor('table', x, y, tw, 2);
      for (let i = 0; i < tw; i++) { addDecor('chair', x + i, y - 1, 1, 1); addDecor('chair', x + i, y + 2, 1, 1); }
    };

    // Circular table with evenly spaced radial chairs (centre in cell-edge coordinates).
    const roundTable = (cx, cy, r, n, cr) => {
      decor.push({ type: 'rtable', cx, cy, r });
      for (let yy = Math.floor(cy - r); yy < Math.ceil(cy + r); yy++) {
        for (let xx = Math.floor(cx - r); xx < Math.ceil(cx + r); xx++) {
          const inside = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) <= r + 0.3;
          if (inside && (grid[yy]?.[xx] === CELL.HALL || grid[yy]?.[xx] === CELL.ROOM)) grid[yy][xx] = CELL.DECOR;
        }
      }
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        decor.push({ type: 'rchair', cx: cx + Math.cos(a) * cr, cy: cy + Math.sin(a) * cr });
      }
    };
    const rectTable = (cx, cy) => {
      const x = Math.round(cx - 1);
      const y = Math.floor(cy);
      addDecor('table', x, y, 2, 1);
      for (const dx of [0, 1]) { addDecor('chair', x + dx, y - 1, 1, 1); addDecor('chair', x + dx, y + 1, 1, 1); }
    };
    // Lattice of table groups (round with radial seating, or rectangular) inside a rectangle; returns how many fit.
    const tableGrid = (x0, y0, w, h, { r, n, cr, step, round }) => {
      const half = cr + 0.4;
      let placed = 0;
      for (let cy = y0 + half; cy + half <= y0 + h + 0.001; cy += step) {
        for (let cx = x0 + half; cx + half <= x0 + w + 0.001; cx += step) {
          if (rng() < round) {
            const snap = (v) => (r >= 1 ? Math.round(v) : Math.floor(v) + 0.5);
            roundTable(snap(cx), snap(cy), r, n, cr);
          } else rectTable(cx, cy);
          placed++;
        }
      }
      return placed;
    };
    const furnishLounge = (room) => {
      const { x, y, w, h } = room;
      const sw = Math.min(5, w - 2);
      addDecor('sofa', x + 1, y + 1, sw, 1);
      if (w >= 11) addDecor('sofa', x + w - 1 - sw, y + 1, sw, 1);
      if (h >= 8) addDecor('sofa', x + 1, y + h - 2, sw, 1);
      addDecor('plant', x, y + h - 1, 1, 1);
      addDecor('plant', x + w - 1, y + h - 1, 1, 1);
      const tables = h >= 8 && w >= 6 ? tableGrid(x + 1, y + 3, w - 2, h - 5, { r: 1, n: 4, cr: 1.6, step: 5, round: 0.6 }) : 0;
      if (!tables && h >= 5 && w >= 6) addDecor('table', x + Math.floor((w - 2) / 2), y + 2, 2, 2);
    };
    const furnishMeeting = (room, cap) => {
      const iw = room.w - 2;
      const rows = room.h - 3; // interior rows minus the label row beside the door
      const y0 = room.top ? room.y + 2 : room.y + 1;
      const round = rng() < 0.5 && ((cap === 4 && iw >= 4 && rows >= 4) || (cap === 10 && iw >= 6 && rows >= 5));
      if (round) {
        const r = cap === 4 ? 1 : 1.5;
        roundTable(room.x + room.w / 2, y0 + rows / 2, r, cap, r + 0.6);
      } else {
        const tw = cap === 4 ? 2 : 5;
        const tx = room.x + 1 + Math.floor((iw - tw) / 2);
        const ty = y0 + Math.floor((rows - 2) / 2);
        addDecor('table', tx, ty, tw, 2);
        for (let i = 0; i < tw; i++) { addDecor('chair', tx + i, ty - 1, 1, 1); addDecor('chair', tx + i, ty + 2, 1, 1); }
      }
    };
    const meetingRoom = (x, y, w, h, down, cap) => {
      const room = newRoom('meeting', x, y, w, h, `MEETING (${cap})`);
      carve(room, true);
      room.top = !down;
      const rr = cap === 10 ? curveRoom(room, 3) : 0;
      addDoor(room, doorColumn(room, rr), down ? y + h - 1 : y);
      applyCurve(room);
      furnishMeeting(room, cap);
    };

    // Packs rooms edge to edge in as few leaves as possible; mid-floor groups form two back-to-back
    // rows with doors opening outward. Each spec needs { w, h }; build(spec, x, y, h, down) creates the room.
    const packRooms = (specs, build) => {
      for (const l of free().filter((f) => f.ew >= 6 && f.eh >= 6).sort((a, b) => area(b) - area(a))) {
        if (!specs.length) break;
        const twoRows = !l.ext.top && !l.ext.bottom;
        const rowsDown = twoRows ? [false, true] : [!l.ext.bottom];
        let y = l.ey;
        let placedAny = false;
        for (const down of rowsDown) {
          const row = [];
          let x = l.ex;
          while (specs.length && x + specs[0].w - 1 <= l.ex2) {
            const s = specs.shift();
            row.push({ ...s, x });
            x += s.w - 1;
          }
          if (!row.length) break;
          const rowH = Math.max(...row.map((r) => r.h));
          const top = rowsDown.length === 1 && !down ? l.ey2 - rowH + 1 : y;
          if (top + rowH - 1 > l.ey2) { specs.unshift(...row.map(({ x: _x, ...s }) => s)); break; }
          for (const r of row) build(r, r.x, top, rowH, down);
          placedAny = true;
          y = top + rowH - 1;
        }
        if (placedAny) used.add(l.i);
      }
    };

    // Rooms from ROOM_DEFS: walled, one door, reserved workstations along the far wall, fixtures that keep a walkway open.
    const defRoom = (type, x, y, w, h, down, doorAt) => {
      const def = ROOM_DEFS[type];
      const room = newRoom(type, x, y, w, h, def.label);
      carve(room, true);
      room.top = !down;
      const rr = def.seats === 0 && doorAt === undefined ? curveRoom(room, 2) : 0;
      addDoor(room, doorAt ?? doorColumn(room, rr), down ? y + h - 1 : y);
      applyCurve(room);
      const iw = w - 2;
      const far = room.top ? y + h - 2 : y + 1;
      const rowY = (k) => far + (room.top ? -k : k); // k = rows from the far wall toward the door
      const n = Math.min(def.seats, Math.floor((iw + 1) / 3));
      for (let s = 0; s < n; s++) {
        const desk = { x: x + 1 + s * 3, y: far, w: 2, h: 1 };
        fillDesk(desk);
        addWs({ x: desk.x, y: rowY(1) }, desk, room, type);
      }
      if (iw - n * 3 > 0) addDecor(def.fixture, x + 1 + n * 3, far, iw - n * 3, 1, def.fx);
      if (h >= 6) for (let o = 0; o < iw; o += 3) addDecor(def.fixture, x + 1 + o, rowY(2), Math.min(2, iw - o), 1, def.fx);
      return room;
    };
    const specialSpecs = Object.entries(specialWant).flatMap(([type, n]) => Array.from({ length: n }, () => ({ type, w: SPECIAL_ROOMS[type].w, h: SPECIAL_ROOMS[type].h })))
      .sort((a, b) => b.w - a.w);
    packRooms(specialSpecs, (r, x, y, h, down) => defRoom(r.type, x, y, r.w, h, down));

    // Meeting rooms: per 8 employees, one large (10 seats) and two small (4 seats).
    const meetingSpecs = [];
    for (let k = 0; k < meetingSets; k++) meetingSpecs.push({ w: 11, h: 8, cap: 10 }, { w: 6, h: 7, cap: 4 }, { w: 6, h: 7, cap: 4 });
    packRooms(meetingSpecs, (r, x, y, h, down) => meetingRoom(x, y, r.w, h, down, r.cap));

    // Break rooms (enclosed) or lounges (open); one per 25 employees.
    for (let k = 0; k < wantBreaks; k++) {
      const enclosedFirst = rng() < 0.5;
      const pickBreak = () => free().filter((f) => f.ew >= 8 && f.eh >= 6).sort((a, b) => area(a) - area(b))[0];
      const pickLounge = () => free().filter((f) => f.rw >= 8 && f.rh >= 6).sort((a, b) => area(a) - area(b))[0];
      let l = enclosedFirst ? pickBreak() : pickLounge();
      let enclosed = enclosedFirst;
      if (!l) { l = enclosedFirst ? pickLounge() : pickBreak(); enclosed = !enclosedFirst; }
      if (!l) break;
      used.add(l.i);
      if (enclosed) {
        const room = placeRoomInLeaf(l, 'break', Math.min(l.ew, 10), Math.min(l.eh, 9), 'BREAK ROOM');
        const iw = room.w - 2;
        const ih = room.h - 2;
        const farRow = room.top ? room.y + room.h - 2 : room.y + 1;
        const sw = Math.min(iw - 2, 5);
        addDecor('sofa', room.x + 1 + Math.floor((iw - sw) / 2), farRow, sw, 1);
        const tables = room.h >= 8 && iw >= 5 ? tableGrid(room.x + 1, room.y + 2, iw, room.h - 4, { r: 1, n: 4, cr: 1.6, step: 5, round: 0.6 }) : 0;
        if (!tables && iw >= 6 && ih >= 5) addDecor('table', room.x + 1 + Math.floor((iw - 2) / 2), room.y + 1 + Math.floor((ih - 2) / 2), 2, 2);
      } else {
        const room = newRoom('lounge', l.rx, l.ry, Math.min(l.rw, 16), Math.min(l.rh, 12), 'LOUNGE');
        carve(room, false);
        furnishLounge(room);
      }
    }

    // Cafe: an open area near the lobby with a service counter and two-seat tables.
    const recRoom = rooms.find((r) => r.type === 'reception');
    for (let k = 0; k < wantCafes; k++) {
      const target = recRoom ? { cx: recRoom.x + recRoom.w / 2, cy: recRoom.y } : { cx: midX, cy: height };
      const l = free().filter((f) => f.rw >= 10 && f.rh >= 7).sort((a, b) => dist(a, target) - dist(b, target))[0];
      if (!l) break;
      used.add(l.i);
      const w = Math.min(l.rw, 14);
      const h = Math.min(l.rh, 9);
      const room = newRoom('cafe', l.rx, l.ry, w, h, 'CAFE');
      carve(room, false);
      addDecor('counter', room.x + 1, room.y + 1, Math.min(6, w - 2), 1);
      tableGrid(room.x + 1, room.y + 3, w - 2, h - 4, { r: 0.6, n: 3, cr: 1.1, step: 4, round: 0.6 });
    }

    const breaksPlaced = rooms.filter((r) => r.type === 'break' || r.type === 'lounge').length;

    // ---------- Pathways ----------
    // Primary: the wide strips from the first cuts plus the entrance foyer. Secondary: narrower strips deeper in,
    // plus a connector carved from every room door to the network. `net` marks cells already joined to the entrance.
    const pathType = Array.from({ length: height }, () => new Array(width).fill(0));
    const net = Array.from({ length: height }, () => new Array(width).fill(false));
    const hallAt = (x, y) => grid[y]?.[x] === CELL.HALL;
    const passable = (x, y) => hallAt(x, y) || grid[y]?.[x] === CELL.ROOM;
    const setPath = (x, y, v) => { if (hallAt(x, y) && (!pathType[y][x] || pathType[y][x] > v)) pathType[y][x] = v; };
    for (const s of [...strips].sort((a, b) => b.primary - a.primary)) {
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) setPath(x, y, s.primary ? 1 : 2);
    }
    reservedRects.forEach((r) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setPath(x, y, 1); });
    setPath(entrance.x, entrance.y, 1);
    net[entrance.y][entrance.x] = true;

    // Breadth-first growth from the network until a target cell is reached; the route back is marked as pathway.
    const growNet = (isTarget, value) => {
      const prev = new Map();
      const queue = [];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (net[y][x]) { prev.set(y * width + x, -1); queue.push([x, y]); }
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i];
        if (!net[y][x] && isTarget(x, y)) {
          for (let k = y * width + x; k !== -1; k = prev.get(k)) {
            const cx = k % width;
            const cy = Math.floor(k / width);
            setPath(cx, cy, value);
            if (hallAt(cx, cy)) net[cy][cx] = true;
          }
          return { x, y };
        }
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const k = ny * width + nx;
          if (passable(nx, ny) && !prev.has(k)) { prev.set(k, y * width + x); queue.push([nx, ny]); }
        }
      }
      return null;
    };
    const pathPieces = (v) => {
      const seenP = new Set();
      const out = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (pathType[y][x] !== v || seenP.has(y * width + x)) continue;
          const cells = [];
          const stack = [[x, y]];
          seenP.add(y * width + x);
          while (stack.length) {
            const [cx, cy] = stack.pop();
            cells.push([cx, cy]);
            for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
              if (pathType[ny]?.[nx] === v && !seenP.has(ny * width + nx)) { seenP.add(ny * width + nx); stack.push([nx, ny]); }
            }
          }
          out.push(cells);
        }
      }
      return out;
    };
    for (const v of [1, 2]) {
      let pieces = pathPieces(v);
      const joined = (p) => p.some(([x, y]) => net[y][x]);
      pieces.filter(joined).forEach((p) => p.forEach(([x, y]) => { net[y][x] = true; }));
      pieces = pieces.filter((p) => !joined(p));
      while (pieces.length) {
        const owner = new Map();
        pieces.forEach((p, i) => p.forEach(([x, y]) => owner.set(y * width + x, i)));
        const hit = growNet((x, y) => owner.has(y * width + x), v);
        if (!hit) { pieces.forEach((p) => p.forEach(([x, y]) => { pathType[y][x] = 0; })); break; }
        const piece = pieces[owner.get(hit.y * width + hit.x)];
        piece.forEach(([x, y]) => { net[y][x] = true; });
        pieces = pieces.filter((p) => p !== piece);
      }
    }
    let doorsCut = 0;
    for (const r of rooms) {
      if (!r.door) continue;
      const fx = r.door.x;
      const fy = r.door.y === r.y ? r.door.y - 1 : r.door.y + 1;
      if (!hallAt(fx, fy)) { doorsCut++; continue; }
      setPath(fx, fy, 2);
      if (!net[fy][fx] && !growNet((x, y) => x === fx && y === fy, 2)) doorsCut++;
    }

    // ---------- Fill leftover space ----------
    // Utility rooms and a few lounges take the largest free areas; each gets a door joined to the network.
    const taken = Array.from({ length: height }, () => new Array(width).fill(false));
    const mark = (x, y, w, h) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (taken[yy]?.[xx] !== undefined) taken[yy][xx] = true;
    };
    rooms.forEach((r) => mark(r.x, r.y, r.w, r.h));
    reservedRects.forEach((r) => mark(r.x, r.y, r.w, r.h));
    doors.forEach((d) => mark(d.x - 1, d.y - 1, 3, 3));
    const skipped = Array.from({ length: height }, () => new Array(width).fill(false));
    const freeAt = (x, y) => hallAt(x, y) && !taken[y][x] && !skipped[y][x] && pathType[y][x] === 0;
    const bestFreeRect = (x0, y0, w, h, needW = 1, needH = 1) => {
      let best = null;
      const heights = new Array(w).fill(0);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) heights[i] = freeAt(x0 + i, y0 + j) ? heights[i] + 1 : 0;
        for (let i = 0; i < w; i++) {
          let minH = Infinity;
          for (let k = i; k < w; k++) {
            minH = Math.min(minH, heights[k]);
            if (minH === 0) break;
            const a = minH * (k - i + 1);
            if (k - i + 1 >= needW && minH >= needH && (!best || a > best.area)) best = { area: a, x: x0 + i, y: y0 + j - minH + 1, w: k - i + 1, h: minH };
          }
        }
      }
      return best;
    };
    // Distances from the network over free hall, treating `box` as solid; used to pick the cheapest door.
    const netDistances = (box) => {
      const dist = new Map();
      const queue = [];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (net[y][x]) { dist.set(y * width + x, { d: 0, from: -1 }); queue.push([x, y]); }
      const inBox = (x, y) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i];
        const d = dist.get(y * width + x).d;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const k = ny * width + nx;
          if (hallAt(nx, ny) && !inBox(nx, ny) && !dist.has(k)) { dist.set(k, { d: d + 1, from: y * width + x }); queue.push([nx, ny]); }
        }
      }
      return dist;
    };
    const placeUtility = (b, type) => {
      const def = UTILITY_ROOMS[type];
      const w = Math.min(b.w, def.w);
      const h = Math.min(b.h, def.h);
      // A side fully against an existing wall shares it (+1); a partly touching side is pulled back a cell (-1).
      const side = (cells) => {
        const n = cells.filter(([x, y]) => grid[y]?.[x] === CELL.WALL).length;
        return n === 0 ? 0 : n === cells.length ? 1 : -1;
      };
      const col = (x, y0, n) => Array.from({ length: n }, (_, i) => [x, y0 + i]);
      const row = (y, x0, n) => Array.from({ length: n }, (_, i) => [x0 + i, y]);
      let best = null;
      for (const [ax, ay] of [[b.x, b.y], [b.x + b.w - w, b.y], [b.x, b.y + b.h - h], [b.x + b.w - w, b.y + b.h - h]]) {
        const sl = side(col(ax - 1, ay, h));
        const sr = side(col(ax + w, ay, h));
        const st = side(row(ay - 1, ax, w));
        const sb = side(row(ay + h, ax, w));
        const box = { x: ax - sl, y: ay - st, w: w + sl + sr, h: h + st + sb };
        if (box.w < def.minW || box.h < def.minH) continue;
        const dist = netDistances(box);
        for (const down of [false, true]) {
          const oy = down ? box.y + box.h : box.y - 1;
          for (let dx = box.x + 1; dx <= box.x + box.w - 2; dx++) {
            const found = dist.get(oy * width + dx);
            if (found && found.d <= 10 && (!best || found.d < best.d)) best = { d: found.d, dist, box, down, dx, oy };
          }
        }
      }
      if (!best) return false;
      const { box } = best;
      defRoom(type, box.x, box.y, box.w, box.h, best.down, best.dx);
      mark(box.x, box.y, box.w, box.h);
      for (let k = best.oy * width + best.dx; k !== -1; k = best.dist.get(k).from) {
        const cx = k % width;
        const cy = Math.floor(k / width);
        setPath(cx, cy, 2);
        net[cy][cx] = true;
      }
      return true;
    };
    const fillCount = {};
    // Big floors get proportionally more restrooms, huddles, storage and lounges so leftover space is put to use.
    const fillScale = Math.max(1, Math.round(seats / 40));
    let loungeLeft = Math.max(1, lounges, Math.min(Math.max(6, Math.round(seats / 20)), Math.floor(seats / 6)));
    const fillOrder = [['lounge', 10, 7], ...Object.entries(UTILITY_ROOMS).map(([t, d]) => [t, d.minW, d.minH])];
    for (let guard = 0; guard < 40 * fillScale; guard++) {
      let changed = false;
      for (const [type, needW, needH] of fillOrder) {
        const lounge = type === 'lounge';
        if (lounge ? loungeLeft <= 0 : (fillCount[type] || 0) >= UTILITY_ROOMS[type].max * fillScale) continue;
        const b = bestFreeRect(1, 1, width - 2, height - 2, needW, needH);
        if (!b) continue;
        changed = true;
        let ok = true;
        if (lounge) {
          const room = newRoom('lounge', b.x, b.y, Math.min(b.w, 16), Math.min(b.h, 12), 'LOUNGE');
          carve(room, false);
          furnishLounge(room);
          mark(room.x, room.y, room.w, room.h);
          loungeLeft--;
        } else ok = placeUtility(b, type);
        if (ok) { fillCount[type] = (fillCount[type] || 0) + 1; break; }
        for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) skipped[yy][xx] = true;
      }
      if (!changed) break;
    }
    let leftover = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (hallAt(x, y) && !taken[y][x] && pathType[y][x] === 0) leftover++;

    const receptionPlaced = rooms.some((r) => r.type === 'reception');
    const count = (t, pred = () => true) => rooms.filter((r) => r.type === t && pred(r)).length;
    const missing = Math.max(0, wantOffices - count('office'))
      + (receptionPlaced ? 0 : 1)
      + Math.max(0, wantCafes - count('cafe'))
      + Math.max(0, wantPhones - count('phone'))
      + openLeft
      + Math.max(0, meetingSets - count('meeting', (r) => r.w === 11))
      + Math.max(0, meetingSets * 2 - count('meeting', (r) => r.w === 6))
      + Math.max(0, wantBreaks - breaksPlaced);
    const emptyFrac = leftover / Math.max(1, interiorCount);

    // Every chair must be reachable from the entrance.
    const seen = new Set();
    const queue = [[entrance.x, entrance.y]];
    while (queue.length) {
      const [qx, qy] = queue.pop();
      const k = qy * width + qx;
      if (seen.has(k) || ![CELL.HALL, CELL.ROOM, CELL.DOOR].includes(grid[qy]?.[qx])) continue;
      seen.add(k);
      queue.push([qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]);
    }
    const unreachable = workstations.filter((w) => !seen.has(w.gridY * width + w.gridX)).length;
    const specialMissing = Object.entries(specialWant).reduce((a, [t, n]) => (
      a + Math.max(0, n - count(t)) + Math.max(0, n * SPECIAL_ROOMS[t].seats - workstations.filter((w) => w.kind === t).length)), 0);

    // Extra spawn points. Ground floors get a loading dock in an exterior wall; upper floors get a public elevator (at the lobby),
    // a service elevator and stairs. Pads are markers on hall cells, so they never block movement.
    const reach = (x, y) => seen.has(y * width + x);
    const gap = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const pickTop = (list) => list[Math.floor(rng() * Math.max(1, Math.ceil(list.length * 0.25)))];
    let dock = null;
    const pads = [];
    if (!upper) {
      const cands = [];
      for (const key of extWalls) {
        const [x, y] = key.split(',').map(Number);
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const spawn = { x: x - dx, y: y - dy };
          if (!outAt(x + dx, y + dy) || grid[spawn.y]?.[spawn.x] !== CELL.HALL || !reach(spawn.x, spawn.y)) continue;
          const cells = [-1, 0, 1].map((k) => ({ x: x + (dy !== 0 ? k : 0), y: y + (dx !== 0 ? k : 0) }));
          if (!cells.every((c) => grid[c.y]?.[c.x] === CELL.WALL && outAt(c.x + dx, c.y + dy) && grid[c.y - dy]?.[c.x - dx] === CELL.HALL)) continue;
          const d = gap(spawn, entrance);
          if (d >= 18) cands.push({ cells, spawn, dx, dy, d });
        }
      }
      cands.sort((a, b) => b.d - a.d);
      dock = cands.length ? pickTop(cands) : null;
      if (dock) {
        dock.cells.forEach((c) => { grid[c.y][c.x] = CELL.DOOR; });
        windows.splice(0, windows.length, ...windows.filter((w) => !dock.cells.some((c) => c.x === w.x && c.y === w.y)));
      }
    } else {
      const used = new Set();
      const claim = (p) => { for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) used.add((p.y + j) * width + p.x + i); };
      const open = (x, y) => grid[y]?.[x] === CELL.HALL && reach(x, y) && !used.has(y * width + x);
      const findPad = (kind, avoid) => {
        for (const [w, h] of [[2, 2], [2, 1], [1, 2], [1, 1]]) {
          for (const minGap of [14, 8, 4, 0]) {
            const spots = [];
            for (let y = 1; y < height - 1; y++) {
              for (let x = 1; x < width - 1; x++) {
                let ok = true;
                for (let j = 0; ok && j < h; j++) for (let i = 0; ok && i < w; i++) ok = open(x + i, y + j);
                const g = ok ? Math.min(...avoid.map((a) => gap({ x, y }, a))) : -1;
                if (ok && g >= minGap) spots.push({ x, y, w, h, g });
              }
            }
            if (!spots.length) continue;
            spots.sort((a, b) => b.g - a.g);
            const p = { kind, ...pickTop(spots) };
            p.spawn = { x: p.x, y: p.y };
            claim(p);
            return p;
          }
        }
        return null;
      };
      const wide = [-1, 0, 1].every((k) => grid[entrance.y]?.[entrance.x + k] === CELL.HALL);
      const pub = wide ? { kind: 'publicElevator', x: entrance.x - 1, y: entrance.y, w: 3, h: 1 } : { kind: 'publicElevator', x: entrance.x, y: entrance.y, w: 1, h: 1 };
      pub.spawn = { x: entrance.x, y: entrance.y };
      claim(pub);
      const service = findPad('serviceElevator', [entrance]);
      const stairs = findPad('stairs', [entrance, service?.spawn].filter(Boolean));
      pads.push(pub, ...[service, stairs].filter(Boolean));
    }
    const spawns = {
      entrance,
      dock: dock ? dock.spawn : null,
      serviceElevator: pads.find((p) => p.kind === 'serviceElevator')?.spawn || null,
      stairs: pads.find((p) => p.kind === 'stairs')?.spawn || null
    };

    // Join each Mover spawn to the pathway network with a secondary pathway, so Movers can reach it on pathways alone.
    for (const p of [spawns.dock, spawns.serviceElevator, spawns.stairs]) {
      if (!p || pathType[p.y][p.x]) continue;
      const prev = new Map([[p.y * width + p.x, -1]]);
      const queue = [[p.x, p.y]];
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i];
        if (pathType[y][x]) {
          for (let k = y * width + x; k !== -1; k = prev.get(k)) {
            const cx = k % width;
            const cy = Math.floor(k / width);
            if (hallAt(cx, cy) && !pathType[cy][cx]) pathType[cy][cx] = 2;
          }
          break;
        }
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const k = ny * width + nx;
          if (hallAt(nx, ny) && !prev.has(k)) { prev.set(k, y * width + x); queue.push([nx, ny]); }
        }
      }
    }

    const layout = { grid, rooms, workstations, doors, decor, windows, extraLabels, entranceCells, entrance, dock, pads, spawns, width, height, cellSize, extWalls, shellP: shell.P, shellQ: shell.Q, pathType, curvedCells, plain, upper, missing: missing + specialMissing + unreachable + doorsCut, emptyFrac };
    layout.elements = BSPNode.toSVG(layout);
    return layout;
  }

  // Try progressively larger footprints and keep the smallest, least empty plan that fits every requirement.
  // opts.size = [W, H] fixes the footprint; opts.tries / opts.plain override the attempt count and shell style.
  static generateFit(maxW, maxH, opts) {
    const specialHeavy = Object.values(opts.specials || {}).reduce((a, n) => a + n, 0) >= 2;
    const big = (opts.seats || 0) > 20; // big floors start from a tight footprint and grow until everything fits
    const scales = big ? [1, 1.1, 1.22, 1.36, 1.5] : (opts.seats || 0) >= 12 || specialHeavy ? [0.8, 0.9, 1] : [0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 1];
    const sizes = opts.size ? [opts.size] : scales.map((sc) => [Math.max(34, Math.round(maxW * sc)), Math.max(22, Math.round(maxH * sc)), sc]);
    const tries = opts.tries || (big ? 8 : 10);
    let best = null;
    for (const [W, H, sc = 1] of sizes) {
      let pick = null;
      for (let k = 0; k < tries; k++) {
        const lay = BSPNode.generate(W, H, { ...opts, plain: opts.plain ?? k >= Math.ceil(tries * 0.6), seed: (opts.seed || 1) + k * 7919 + Math.round(sc * 1000) });
        if (lay.missing === 0 && (!pick || lay.emptyFrac < pick.emptyFrac)) pick = lay;
        if (!best || lay.missing < best.missing || (lay.missing === best.missing && lay.emptyFrac < best.emptyFrac)) best = lay;
        if (pick && pick.emptyFrac < 0.12) break;
      }
      if (pick) return pick;
    }
    return best;
  }

  // Shell outline as { inside[][], Q (footprint polygon), P (wall centerline polygon) }, in cell units.
  // Built clockwise from per-corner treatments (chamfer, notch, step, rare round) and an optional recess in a side,
  // so most footprints have more than four sides. The bottom side stays straight in the middle for the entrance.
  static makeShell(W, H, rng, plain = false) {
    const between = (lo, hi) => lo + rng() * (hi - lo);
    const minD = Math.min(W, H);
    const kinds = ['tl', 'tr', 'br', 'bl'];
    const spec = { tl: null, tr: null, br: null, bl: null };
    const cham = () => {
      const a = Math.min(Math.floor(W / 4), Math.max(3, Math.round(minD * between(0.14, 0.26))));
      return { t: 'c', w: a, h: rng() < 0.7 ? a : Math.max(3, Math.round(a * between(0.6, 1.4))) };
    };
    const notch = () => ({ t: 'n', w: Math.round(W * between(0.2, 0.3)), h: Math.round(H * between(0.25, 0.38)) });
    const step = () => ({ t: 's', w: Math.round(W * between(0.2, 0.28)), h: Math.max(3, Math.round(H * between(0.13, 0.18))) });
    const pick = () => { const r = rng(); return plain ? (r < 0.6 ? null : cham()) : r < 0.3 ? null : r < 0.58 ? cham() : r < 0.8 ? notch() : r < 0.94 ? step() : cham(); };
    if (plain || rng() >= 0.08) {
      kinds.forEach((k) => { spec[k] = pick(); });
      if (!kinds.some((k) => spec[k])) spec[kinds[Math.floor(rng() * 4)]] = cham();
    }
    if (!plain && rng() < 0.12) {
      // Rare curved exterior: one or two rounded corners.
      const r = Math.round(Math.min(12, Math.max(5, minD * between(0.2, 0.3))));
      const first = Math.floor(rng() * 4);
      spec[kinds[first]] = { t: 'r', w: r, h: r };
      if (rng() < 0.5) spec[kinds[(first + 2) % 4]] = { t: 'r', w: r, h: r };
    }
    // Keep the bottom wall straight enough for the entrance and lobby.
    const along = (c) => (c ? c.w : 0);
    if (along(spec.bl) + along(spec.br) > W * 0.5) { spec.bl = cham(); spec.br = null; }

    // Optional rectangular recess in the top, left or right side (never the bottom).
    const bite = {};
    if (!plain && rng() < 0.22) {
      const side = ['top', 'right', 'left'][Math.floor(rng() * 3)];
      const ends = side === 'top' ? [spec.tl, spec.tr] : side === 'right' ? [spec.tr, spec.br] : [spec.bl, spec.tl];
      const tame = (c) => !c || c.t === 'c' || c.t === 'r';
      const len = side === 'top' ? W : H;
      if (ends.every(tame) && ends.every((c) => (c ? (side === 'top' ? c.w : c.h) : 0) <= len * 0.2)) {
        const horizontal = side === 'top';
        bite[side] = { len: Math.round(len * between(0.26, 0.36)), depth: Math.round((horizontal ? H : W) * between(0.2, 0.3)) };
      }
    }

    // Corner emitters: C = corner point, din/dout = unit directions of the arriving and leaving sides.
    const corners = [
      { k: 'tl', C: [0, 0], din: [0, -1], dout: [1, 0] },
      { k: 'tr', C: [W, 0], din: [1, 0], dout: [0, 1] },
      { k: 'br', C: [W, H], din: [0, 1], dout: [-1, 0] },
      { k: 'bl', C: [0, H], din: [-1, 0], dout: [0, -1] }
    ];
    const at = (C, a, b) => [C[0] + a[0] + b[0], C[1] + a[1] + b[1]];
    const mul = (d, n) => [d[0] * n, d[1] * n];
    const emit = ({ k, C, din, dout }) => {
      const c = spec[k];
      if (!c) return [C];
      const horizIn = din[0] !== 0;
      const a = horizIn ? c.w : c.h; // extent along the arriving side
      const b = horizIn ? c.h : c.w; // extent along the leaving side
      const back = mul(din, -1);
      if (c.t === 'c') return [at(C, mul(back, a), [0, 0]), at(C, [0, 0], mul(dout, b))];
      if (c.t === 'n') return [at(C, mul(back, a), [0, 0]), at(C, mul(back, a), mul(dout, b)), at(C, [0, 0], mul(dout, b))];
      if (c.t === 's') {
        return [at(C, mul(back, a), [0, 0]), at(C, mul(back, a), mul(dout, b)), at(C, mul(back, a / 2), mul(dout, b)),
          at(C, mul(back, a / 2), mul(dout, b * 2)), at(C, [0, 0], mul(dout, b * 2))];
      }
      const r = c.w;
      const centre = at(C, mul(back, r), mul(dout, r));
      const out = [];
      for (let i = 0; i <= 8; i++) {
        const phi = (i / 8) * (Math.PI / 2);
        out.push([centre[0] + r * (-dout[0] * Math.cos(phi) + din[0] * Math.sin(phi)), centre[1] + r * (-dout[1] * Math.cos(phi) + din[1] * Math.sin(phi))]);
      }
      return out;
    };
    const biteOn = (side, from, to) => {
      const b = bite[side];
      if (!b) return [];
      const d = [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])];
      const n = [-d[1], d[0]]; // inward normal (interior lies to the right of travel)
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const s0 = (len - b.len) / 2;
      const s = [from[0] + d[0] * s0, from[1] + d[1] * s0];
      const e = [s[0] + d[0] * b.len, s[1] + d[1] * b.len];
      return [s, [s[0] + n[0] * b.depth, s[1] + n[1] * b.depth], [e[0] + n[0] * b.depth, e[1] + n[1] * b.depth], e];
    };
    const raw = [
      ...emit(corners[0]), ...biteOn('top', [0, 0], [W, 0]),
      ...emit(corners[1]), ...biteOn('right', [W, 0], [W, H]),
      ...emit(corners[2]),
      ...emit(corners[3]), ...biteOn('left', [0, H], [0, 0])
    ];
    const Q = raw.filter((p, i) => { const q = raw[(i + raw.length - 1) % raw.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });

    // Wall centreline: Q pulled in by half a cell, mitred at every vertex.
    const P = Q.map((c, i) => {
      const p = Q[(i + Q.length - 1) % Q.length];
      const n = Q[(i + 1) % Q.length];
      const unit = (u, v) => { const l = Math.hypot(v[0] - u[0], v[1] - u[1]); return [(v[0] - u[0]) / l, (v[1] - u[1]) / l]; };
      const d1 = unit(p, c);
      const d2 = unit(c, n);
      const n1 = [-d1[1], d1[0]];
      const n2 = [-d2[1], d2[0]];
      const k = 0.5 / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
      return [c[0] + (n1[0] + n2[0]) * k, c[1] + (n1[1] + n2[1]) * k];
    });

    const inPoly = (px, py) => {
      let inside = false;
      for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
        const [xi, yi] = Q[i];
        const [xj, yj] = Q[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    const inside = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
      const cx = x + 0.5;
      const cy = y + 0.5;
      return inPoly(cx + (cx < W / 2 ? 0.001 : -0.001), cy + (cy < H / 2 ? 0.002 : -0.002));
    }));
    return { inside, Q, P };
  }

  // SVG elements: floors, thin walls (one path), windows, doors, furniture and room labels.
  static toSVG({ grid, rooms, doors, decor, windows, extraLabels = [], entranceCells, entrance, dock = null, pads = [], width, height, cellSize: s, extWalls, shellP, shellQ, pathType, curvedCells, upper }) {
    const out = [];
    out.push(svgPoly(shellQ.map(([x, y]) => [x * s, y * s]), 'hall', '#f1f5f9'));
    // Walled rooms are filled only up to the wall centreline (inset); open areas fill their full box.
    const roomPath = (r, inset) => {
      const [a, b, c, e] = [0, 1, 2, 3].map((i) => (r.round?.flags[i] ? r.round.r - inset : 0));
      const x0 = (r.x + inset) * s;
      const y0 = (r.y + inset) * s;
      const x1 = (r.x + r.w - inset) * s;
      const y1 = (r.y + r.h - inset) * s;
      const arc = (rad, ex, ey) => (rad ? `A${rad * s} ${rad * s} 0 0 1 ${ex} ${ey}` : '');
      return `M${x0 + a * s} ${y0}H${x1 - b * s}${arc(b, x1, y0 + b * s)}V${y1 - c * s}${arc(c, x1 - c * s, y1)}H${x0 + e * s}${arc(e, x0, y1 - e * s)}V${y0 + a * s}${arc(a, x0 + a * s, y0)}Z`;
    };
    for (const r of rooms) {
      const def = ROOM_DEFS[r.type];
      const cls = `floor ${r.type}${def ? ' special' : ''}`;
      const inset = ['open', 'reception', 'lounge', 'cafe'].includes(r.type) ? 0 : 0.5;
      let poly;
      if (r.round) {
        poly = document.createElementNS(SVG_NS, 'path');
        poly.setAttribute('d', roomPath(r, inset));
        poly.setAttribute('class', cls);
        poly.setAttribute('fill', '#e0f2fe');
      } else poly = svgPoly(rectPoints(r.x + inset, r.y + inset, r.w - 2 * inset, r.h - 2 * inset, s), cls, '#e0f2fe');
      if (def) poly.style.setProperty('--room', def.fill);
      out.push(poly);
    }

    // Pathways: horizontal runs of corridor cells, primary darker than secondary. A pathway also paints the doorway cell
    // it opens onto, so it visibly reaches the door.
    for (const v of [2, 1]) {
      let pd = '';
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (pathType[y][x] !== v) continue;
          let run = 1;
          while (pathType[y][x + run] === v) run++;
          pd += `M${x * s} ${y * s}h${run * s}v${s}h${-run * s}z`;
          x += run - 1;
        }
      }
      // Only the half of the doorway cell facing the corridor is painted, so the pathway ends at the middle of the door.
      for (const dr of doors) {
        const dy = [-1, 1].find((k) => grid[dr.y + k]?.[dr.x] === CELL.HALL && pathType[dr.y + k][dr.x] === v);
        if (dy) pd += `M${dr.x * s} ${(dr.y + (dy > 0 ? 0.5 : 0)) * s}h${s}v${s / 2}h${-s}z`;
      }
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', v === 1 ? 'pathway primary' : 'pathway secondary');
      path.setAttribute('d', pd);
      out.push(path);
    }

    const windowSet = new Set(windows.map((w) => `${w.x},${w.y}`));
    const solid = (x, y) => grid[y]?.[x] === CELL.WALL || grid[y]?.[x] === CELL.DOOR;
    const t = 4; // exterior shell thickness
    const wt = 2; // interior wall thickness
    const half = wt / 2;
    let d = '';
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] !== CELL.WALL || windowSet.has(`${x},${y}`) || extWalls.has(`${x},${y}`) || curvedCells.has(`${x},${y}`)) continue;
        const cx = (x + 0.5) * s;
        const cy = (y + 0.5) * s;
        d += `M${cx - half} ${cy - half}h${wt}v${wt}h${-wt}z`;
        // A segment toward an exterior wall cell runs on to that cell's centre, so it meets the shell stroke instead of stopping short.
        const reach = (nx, ny) => (extWalls.has(`${nx},${ny}`) ? s : s / 2);
        if (solid(x + 1, y)) d += `M${cx} ${cy - half}h${reach(x + 1, y)}v${wt}h${-reach(x + 1, y)}z`;
        if (solid(x - 1, y)) d += `M${cx - reach(x - 1, y)} ${cy - half}h${reach(x - 1, y)}v${wt}h${-reach(x - 1, y)}z`;
        if (solid(x, y + 1)) d += `M${cx - half} ${cy}h${wt}v${reach(x, y + 1)}h${-wt}z`;
        if (solid(x, y - 1)) d += `M${cx - half} ${cy - reach(x, y - 1)}h${wt}v${reach(x, y - 1)}h${-wt}z`;
      }
    }
    const walls = document.createElementNS(SVG_NS, 'path');
    walls.setAttribute('class', 'wall');
    walls.setAttribute('fill', '#334155');
    walls.setAttribute('d', d);
    out.push(walls);

    // Curved interior walls: smooth arcs over the stepped wall cells they replace.
    const arcs = rooms.filter((r) => r.round).map((r) => {
      const q = r.round.r - 0.5;
      const segs = [];
      const corner = [[r.x + 0.5, r.y + r.round.r, r.x + r.round.r, r.y + 0.5], [r.x + r.w - r.round.r, r.y + 0.5, r.x + r.w - 0.5, r.y + r.round.r],
        [r.x + r.w - 0.5, r.y + r.h - r.round.r, r.x + r.w - r.round.r, r.y + r.h - 0.5], [r.x + r.round.r, r.y + r.h - 0.5, r.x + 0.5, r.y + r.h - r.round.r]];
      r.round.flags.forEach((on, i) => {
        if (!on) return;
        const [ax, ay, bx, by] = corner[i];
        segs.push(`M${ax * s} ${ay * s}A${q * s} ${q * s} 0 0 1 ${bx * s} ${by * s}`);
      });
      return segs.join('');
    }).join('');
    if (arcs) {
      const arcPath = document.createElementNS(SVG_NS, 'path');
      arcPath.setAttribute('class', 'wall-curve');
      arcPath.setAttribute('fill', 'none');
      arcPath.setAttribute('stroke', '#334155');
      arcPath.setAttribute('stroke-width', wt);
      arcPath.setAttribute('d', arcs);
      out.push(arcPath);
    }

    const shellPath = document.createElementNS(SVG_NS, 'path');
    shellPath.setAttribute('class', 'shell');
    shellPath.setAttribute('fill', 'none');
    shellPath.setAttribute('stroke', '#334155');
    shellPath.setAttribute('stroke-width', t);
    shellPath.setAttribute('stroke-linejoin', 'miter');
    shellPath.setAttribute('d', `M${shellP.map(([x, y]) => `${x * s} ${y * s}`).join('L')}Z`);
    out.push(shellPath);

    for (const w of windows) {
      const horizontal = w.h;
      out.push(horizontal
        ? svgPoly([[w.x * s, (w.y + 0.5) * s - 2.5], [(w.x + 1) * s, (w.y + 0.5) * s - 2.5], [(w.x + 1) * s, (w.y + 0.5) * s + 2.5], [w.x * s, (w.y + 0.5) * s + 2.5]], 'window', '#7dd3fc')
        : svgPoly([[(w.x + 0.5) * s - 2.5, w.y * s], [(w.x + 0.5) * s + 2.5, w.y * s], [(w.x + 0.5) * s + 2.5, (w.y + 1) * s], [(w.x + 0.5) * s - 2.5, (w.y + 1) * s]], 'window', '#7dd3fc'));
    }

    for (const e of entranceCells) {
      out.push(svgPoly([[e.x * s, (e.y + 0.5) * s - 1.5], [(e.x + 1) * s, (e.y + 0.5) * s - 1.5], [(e.x + 1) * s, (e.y + 0.5) * s + 1.5], [e.x * s, (e.y + 0.5) * s + 1.5]], 'entrance', '#22c55e'));
    }
    if (dock) {
      for (const c of dock.cells) {
        out.push(dock.dy !== 0
          ? svgPoly([[c.x * s, (c.y + 0.5) * s - 2], [(c.x + 1) * s, (c.y + 0.5) * s - 2], [(c.x + 1) * s, (c.y + 0.5) * s + 2], [c.x * s, (c.y + 0.5) * s + 2]], 'dock', '#ea580c')
          : svgPoly([[(c.x + 0.5) * s - 2, c.y * s], [(c.x + 0.5) * s + 2, c.y * s], [(c.x + 0.5) * s + 2, (c.y + 1) * s], [(c.x + 0.5) * s - 2, (c.y + 1) * s]], 'dock', '#ea580c'));
      }
    }
    const PAD_STYLE = { publicElevator: ['ELEVATOR', 'pubelev', '#0ea5e9'], serviceElevator: ['SERVICE ELEV.', 'svcelev', '#14b8a6'], stairs: ['STAIRS', 'stairs', '#8b5cf6'] };
    for (const p of pads) out.push(svgPoly(rectPoints(p.x + 0.1, p.y + 0.1, p.w - 0.2, p.h - 0.2, s), `portal ${PAD_STYLE[p.kind][1]}`, PAD_STYLE[p.kind][2]));
    for (const dr of doors) {
      const horizontalWall = grid[dr.y][dr.x - 1] === CELL.WALL || grid[dr.y][dr.x + 1] === CELL.WALL;
      out.push(horizontalWall
        ? svgPoly([[dr.x * s, (dr.y + 0.5) * s - 1.5], [(dr.x + 1) * s, (dr.y + 0.5) * s - 1.5], [(dr.x + 1) * s, (dr.y + 0.5) * s + 1.5], [dr.x * s, (dr.y + 0.5) * s + 1.5]], 'door', '#f59e0b')
        : svgPoly([[(dr.x + 0.5) * s - 1.5, dr.y * s], [(dr.x + 0.5) * s + 1.5, dr.y * s], [(dr.x + 0.5) * s + 1.5, (dr.y + 1) * s], [(dr.x + 0.5) * s - 1.5, (dr.y + 1) * s]], 'door', '#f59e0b'));
    }

    for (const f of decor) {
      if (f.type === 'rtable' || f.type === 'rchair') {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('class', f.type === 'rtable' ? 'decor table' : 'decor chair');
        c.setAttribute('cx', f.cx * s);
        c.setAttribute('cy', f.cy * s);
        c.setAttribute('r', (f.type === 'rtable' ? f.r : 0.28) * s);
        out.push(c);
      } else if (f.type === 'plant' || f.type === 'chair') {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('class', `decor ${f.type}`);
        c.setAttribute('cx', (f.x + 0.5) * s);
        c.setAttribute('cy', (f.y + 0.5) * s);
        c.setAttribute('r', s * (f.type === 'plant' ? 0.35 : 0.3));
        out.push(c);
      } else {
        const poly = svgPoly(rectPoints(f.x + 0.08, f.y + 0.08, f.w - 0.16, f.h - 0.16, s), `decor ${f.type}${f.color ? ' fx' : ''}`, '#cbd5e1');
        if (f.color) poly.style.setProperty('--fx', f.color);
        out.push(poly);
      }
    }

    const label = (text, x, y, type) => {
      const el = document.createElementNS(SVG_NS, 'text');
      el.setAttribute('class', 'room-label');
      el.dataset.room = type;
      el.setAttribute('x', x);
      el.setAttribute('y', y);
      el.textContent = text;
      out.push(el);
    };
    for (const r of rooms) {
      if (!r.label) continue;
      const y = ['open', 'reception', 'lounge', 'cafe'].includes(r.type) ? r.y + 0.8 : (r.top ? r.y + 1 : r.y + r.h - 2) + 0.7;
      label(r.label, (r.x + r.w / 2) * s, y * s, r.type);
    }
    for (const e of extraLabels) label(e.text, e.x * s, e.y * s, 'phone');
    if (!upper) label('ENTRANCE', (entrance.x + 0.5) * s, (entrance.y - 0.3) * s, 'entrance');
    if (dock) label('LOADING DOCK', (dock.spawn.x + 0.5 - dock.dx * 3.5) * s, (dock.spawn.y + 0.5 - dock.dy * 1.5 + 0.2) * s, 'dock');
    for (const p of pads) label(PAD_STYLE[p.kind][0], (p.x + p.w / 2) * s, (p.y - 0.3) * s, PAD_STYLE[p.kind][1]);
    return out;
  }
}
