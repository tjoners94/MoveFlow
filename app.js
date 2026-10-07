const COLS = 64;
const ROWS = 40;
const TEAM_COLORS = Object.fromEntries(Object.entries(DEPTS).map(([k, d]) => [k, d.color])); // keyed by department
const DEPT_LABELS = Object.fromEntries(Object.entries(DEPTS).map(([k, d]) => [k, d.label]));

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CFG = Dev.params('Gameplay', {
  walkSpeed: { value: 25, min: 5, max: 100, step: 1, label: 'Walk speed (cells/s)' },
  unmetPenalty: { value: 4, min: 0, max: 5, step: 0.1, label: 'Stars lost if no preferences met' },
  rewardPerEmployee: { value: 100, min: 0, max: 1000, step: 10, label: 'Reward per employee ($)' },
  bonusShare: { value: 25, min: 0, max: 100, step: 5, label: 'Each bonus reward (% of base reward)' },
  quietRoomMaxDesks: { value: 6, min: 1, max: 30, step: 1, label: 'Quiet room max desks' },
  nearEntranceDist: { value: 30, min: 1, max: 100, step: 1, label: 'Near-entrance distance' },
  nearPhoneDist: { value: 16, min: 4, max: 60, step: 1, label: 'Near-phone-room distance' },
  nearWindowDist: { value: 4, min: 1, max: 20, step: 1, label: 'Near-window distance' },
  nearBreakDist: { value: 14, min: 4, max: 40, step: 1, label: 'Near-break-area distance' },
  adjacentDist: { value: 3, min: 1, max: 10, step: 1, label: 'Adjacent-seat distance' },
  moversPerFloor: { value: 6, min: 1, max: 20, step: 1, label: 'Max Movers per floor' },
  retrieveSecs: { value: 15, min: 0, max: 60, step: 1, label: 'Truck retrieval time per object (s)' }
});

const devLayout = (jobKey) => (v) => { if (state.job) state.job[jobKey] = v; newGame(); };
const LAYOUT = Dev.params('Layout (restarts job)', {
  employeeCount: { value: 8, min: 1, max: 250, step: 1, label: 'Employees', onChange: devLayout('employees') },
  minLeaf: { value: 10, min: 7, max: 20, step: 1, label: 'BSP min leaf size', onChange: devLayout('minLeaf') },
  maxLeaf: { value: 22, min: 12, max: 40, step: 1, label: 'BSP max leaf size', onChange: devLayout('maxLeaf') },
  seed: { value: 0, min: 0, max: 99999, step: 1, label: 'Seed (0 = random)', onChange: devLayout('seed') }
});

// Job-supplied value if present, else the dev-panel default.
function jobVal(key, fallback) {
  return state.job && state.job[key] !== undefined ? state.job[key] : fallback;
}

// ---------- Data models ----------
class Employee {
  constructor(id, { first, last, dept, team, rank = 'staff', title, flavor, preferences, managerId = null, ...flags }) {
    this.id = id;
    this.first = first;
    this.last = last;
    this.dept = dept; // key into DEPTS
    this.team = team; // team name inside the department
    this.teamId = `${dept}/${team}`;
    this.rank = rank; // key into RANKS
    this.title = title;
    this.flavor = flavor;
    this.preferences = preferences; // key into PREF_LABELS
    this.managerId = managerId; // id of the person this employee reports to
    this.officeRequired = !!flags.officeRequired; // must sit in a private office
    this.receptionist = !!flags.receptionist; // must sit at the reception desk
    this.nearPhone = !!flags.nearPhone; // must sit near a phone room
    this.roomReq = flags.roomReq || null; // must work in this industry room (SPECIAL_ROOMS id)
    this.groundFloor = !!flags.groundFloor; // must sit on a ground floor
    this.sameFloorMgr = !!flags.sameFloorMgr; // must be on the same floor as their manager
    this.sameBuildingBoss = !!flags.sameBuildingBoss; // must be in the same building as their boss
    this.nearManager = !!flags.nearManager; // must sit adjacent to their manager
    this.nearTeammate = !!flags.nearTeammate; // must sit adjacent to a teammate
  }
  get isManager() { return RANKS[this.rank].leader; }
  get fullName() { return `${this.first} ${this.last}`; }
  get initials() { return `${this.first[0]}${this.last[0]}`; }
}

class Workstation {
  constructor({ id, gridX, gridY, desk, kind, roomId, floor = 0 }) {
    this.id = id; this.gridX = gridX; this.gridY = gridY; this.desk = desk; this.kind = kind; this.roomId = roomId; this.floor = floor;
    this.assignedEmployeeId = null;
  }
}

const floorOf = (ws) => state.floors[ws.floor];

const needsSpecialSeat = (emp) => emp.officeRequired || emp.receptionist || emp.nearPhone || emp.nearManager || emp.nearTeammate || !!emp.roomReq
  || emp.groundFloor || emp.sameFloorMgr || emp.sameBuildingBoss;

const seatsAdjacent = (a, b) => a !== b && a.floor === b.floor && Math.abs(a.gridX - b.gridX) + Math.abs(a.gridY - b.gridY) <= CFG.adjacentDist;

function managerAdjacent(emp) {
  const mine = seatOf(emp.id);
  const boss = emp.managerId == null ? null : seatOf(emp.managerId);
  return !!mine && !!boss && seatsAdjacent(mine, boss);
}

function teammateAdjacent(emp) {
  const mine = seatOf(emp.id);
  return !!mine && state.employees.some((o) => {
    const theirs = o.id !== emp.id && o.teamId === emp.teamId ? seatOf(o.id) : null;
    return !!theirs && seatsAdjacent(mine, theirs);
  });
}

// Live status of each seating requirement; met is null while the employee is unseated.
function requirementStatus(emp) {
  const seat = seatOf(emp.id);
  const list = [];
  const add = (text, ok, who = null) => list.push({ text, met: seat ? !!ok : null, who });
  if (emp.receptionist) add('Must sit at the Reception desk', seat?.kind === 'reception');
  if (emp.officeRequired) add('Must sit in a private office', seat?.kind === 'office');
  if (emp.roomReq) add(`Must work in the ${SPECIAL_ROOMS[emp.roomReq].name}`, seat?.kind === emp.roomReq);
  if (emp.nearPhone) add('Must be near a Phone Room', seat && nearPhoneRoom(seat));
  if (emp.nearManager) add('Must be adjacent to Manager {who}', managerAdjacent(emp), emp.managerId);
  if (emp.groundFloor) add('Must sit on a ground floor', seat && floorOf(seat).f === 0);
  if (emp.sameFloorMgr) add('Must be on the same floor as {who}', sameFloorAs(seat, emp.managerId, false), emp.managerId);
  if (emp.sameBuildingBoss) add('Must be in the same building as {who}', sameFloorAs(seat, emp.managerId, true), emp.managerId);
  if (emp.nearTeammate) add('Must be adjacent to a Teammate', teammateAdjacent(emp));
  return list;
}

function nearPhoneRoom(ws) {
  return floorOf(ws).layout.rooms.some((r) => r.type === 'phone' && Math.abs(r.door.x - ws.gridX) + Math.abs(r.door.y - ws.gridY) <= CFG.nearPhoneDist);
}

// Returns why this employee cannot sit here, or null when the seat is valid.
function seatProblem(emp, ws) {
  if (!assignable(ws)) return 'Phone rooms are shared spaces, not assignable desks';
  if (ws.kind === 'reception' && !emp.receptionist) return 'The reception desk is reserved for the receptionist';
  if (SPECIAL_ROOMS[ws.kind] && emp.roomReq !== ws.kind) return `The ${SPECIAL_ROOMS[ws.kind].name} is reserved for its specialist staff`;
  if (emp.roomReq && ws.kind !== emp.roomReq) return `${emp.fullName} must work in the ${SPECIAL_ROOMS[emp.roomReq].name}`;
  if (emp.receptionist && ws.kind !== 'reception') return `${emp.fullName} must sit at the Reception desk`;
  if (emp.officeRequired && ws.kind !== 'office') return `${emp.fullName} needs a private office`;
  if (emp.nearPhone && !nearPhoneRoom(ws)) return `${emp.fullName} must sit near a Phone Room`;
  if (emp.groundFloor && floorOf(ws).f !== 0) return `${emp.fullName} must sit on a ground floor`;
  return null;
}

// Same floor (or same building) as another employee's seat; false while either is unseated.
function sameFloorAs(seat, otherId, buildingOnly) {
  const theirs = otherId == null ? null : seatOf(otherId);
  if (!seat || !theirs) return false;
  return buildingOnly ? floorOf(seat).b === floorOf(theirs).b : seat.floor === theirs.floor;
}

const state = {
  floors: [], // { idx, b, f, bName, name, seats, layout, navGrid, ox, oy, g, dyn, walkers }
  focus: { b: 0, f: 0 }, // the selected floor
  mode: 'floor', // floor | building | iso | campus (see viewer.js)
  analyze: false,
  world: { x: 0, y: 0, w: COLS * 10, h: ROWS * 10 },
  workstations: [],
  employees: [],
  damage: 0, // payout lost to Fragile Goods breakages
  broken: 0,
  phase: 'planning', // planning | execute | feedback | done
  job: null,
  openDept: null,
  openEmp: null,
  timeLeft: 0,
  walkingIds: new Set(),
  gen: 0,
  finished: false
};

// ---------- Viewport (pan / zoom) ----------
const svg = document.getElementById('game-board');
const view = { x: 0, y: 0, w: COLS * 10, h: ROWS * 10 };
const pointers = new Map();
let pinchStart = null;

// Bounds of whatever the viewer is showing: one floor, or the whole campus.
function focusBounds() {
  if (state.mode !== 'floor') return state.world;
  const fl = state.floors.find((x) => x.b === state.focus.b && x.f === state.focus.f) || state.floors[0];
  return fl ? { x: fl.ox, y: fl.oy, w: fl.layout.width * 10, h: fl.layout.height * 10 } : { x: 0, y: 0, w: COLS * 10, h: ROWS * 10 };
}

function applyView() {
  const full = focusBounds();
  view.w = Math.min(Math.max(view.w, full.w / 6), full.w);
  view.h = view.w * (full.h / full.w);
  view.x = Math.min(Math.max(view.x, full.x), full.x + full.w - view.w);
  view.y = Math.min(Math.max(view.y, full.y), full.y + full.h - view.h);
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
}

function clientToWorld(cx, cy) {
  const r = svg.getBoundingClientRect();
  const scale = Math.max(view.w / r.width, view.h / r.height);
  const offX = (r.width - view.w / scale) / 2;
  const offY = (r.height - view.h / scale) / 2;
  return { x: view.x + (cx - r.left - offX) * scale, y: view.y + (cy - r.top - offY) * scale, scale };
}

function worldToClient(wx, wy) {
  const r = svg.getBoundingClientRect();
  const { scale } = clientToWorld(0, 0);
  const offX = (r.width - view.w / scale) / 2;
  const offY = (r.height - view.h / scale) / 2;
  return { x: r.left + offX + (wx - view.x) / scale, y: r.top + offY + (wy - view.y) / scale };
}

function zoomAt(cx, cy, factor) {
  const before = clientToWorld(cx, cy);
  view.w *= factor;
  applyView();
  const after = clientToWorld(cx, cy);
  view.x += before.x - after.x;
  view.y += before.y - after.y;
  applyView();
}

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.001));
}, { passive: false });

svg.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) pinchStart = { dist: pinchDist(), w: view.w };
});

svg.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  if (pointers.size === 1) {
    const { scale } = clientToWorld(0, 0);
    view.x -= (cur.x - prev.x) * scale;
    view.y -= (cur.y - prev.y) * scale;
    pointers.set(e.pointerId, cur);
    applyView();
  } else if (pointers.size === 2 && pinchStart) {
    pointers.set(e.pointerId, cur);
    const [a, b] = [...pointers.values()];
    const targetW = pinchStart.w * (pinchStart.dist / pinchDist());
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, targetW / view.w);
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  pinchStart = null;
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

function pinchDist() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y) || 1;
}

// ---------- Scoring ----------
function calculateJobRating(optionalConstraintsFulfilled, totalOptionalConstraints) {
  const ratio = totalOptionalConstraints > 0 ? optionalConstraintsFulfilled / totalOptionalConstraints : 1;
  const shortfall = Math.max(0, 1 - ratio);
  const rating = 5 - CFG.unmetPenalty * shortfall;
  return Math.min(5, Math.max(1, Math.round(rating * 10) / 10));
}

// ---------- Setup ----------
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Floor plans, people and names all derive from the job seed, so a paused job rebuilds exactly as it was.
function newGame() {
  const seed = jobVal('seed', LAYOUT.seed) || Math.floor(Math.random() * 1e9) + 1;
  const realRandom = Math.random;
  Math.random = mulberry32(seed ^ 0x5bd1e995);
  try { buildGame(seed); } finally { Math.random = realRandom; }
}

function buildGame(seed) {
  const wanted = jobVal('employees', LAYOUT.employeeCount);
  const nodes = planOrg(wanted, jobVal('managers', wanted >= 10 ? 2 : wanted >= 6 ? 1 : 0));
  const countRank = (...ranks) => nodes.filter((n) => ranks.includes(n.rank)).length;
  const plan = planCampus(state.job, wanted);
  // Private offices go to executives, presidents, VPs and directors first; smaller jobs keep one per four people.
  const needOffices = jobVal('offices', wanted >= 30 ? countRank('exec', 'pres', 'vp', 'dir') + Math.floor(countRank('mgr') / 3) : Math.floor(wanted / 4));
  const wantReception = jobVal('receptionist', wanted >= 6);
  const nearPhoneWanted = jobVal('nearPhone', wanted < 6 ? 0 : Math.max(wanted >= 8 ? 2 : 1, Math.round(wanted / 9)));
  const phoneRooms = jobVal('phoneRooms', nearPhoneWanted ? Math.max(wanted >= 10 ? 2 : 1, Math.ceil(nearPhoneWanted / 2)) : 0);

  // Break-room preferences drive how many lounges each floor gets.
  const breakDemand = nodes.slice(0, wanted).reduce((sum, n) => {
    const w = { ...DEFAULT_PREFS, ...(DEPTS[n.dept].prefs || {}) };
    return sum + (w.nearBreak || 0) / Object.values(w).reduce((a, b) => a + b, 0);
  }, 0);
  const lounges = jobVal('lounges', Math.max(1, Math.min(6, Math.ceil(breakDemand / plan.floors.length / 10))));

  const minLeaf = jobVal('minLeaf', LAYOUT.minLeaf);
  const built = buildCampus(plan, {
    lounges,
    maxW: COLS, maxH: ROWS, minSize: minLeaf,
    maxSize: Math.max(jobVal('maxLeaf', LAYOUT.maxLeaf), minLeaf * 2),
    seed,
    offices: needOffices, phones: phoneRooms, cafes: jobVal('cafe', wanted >= 16 ? plan.sites.length : 0), reception: wantReception
  });
  state.floors = built.map((fl, idx) => ({
    ...fl, idx, ox: 0, oy: 0,
    navGrid: fl.layout.grid.map((row) => row.map((c) => (c === CELL.HALL || c === CELL.ROOM || c === CELL.DOOR ? 0 : 1)))
  }));
  // Workstation ids are global across the campus; each room's desk list is remapped to match.
  state.workstations = [];
  for (const fl of state.floors) {
    const offset = state.workstations.length;
    fl.layout.rooms.forEach((r) => { r.desks = r.desks.map((d) => d + offset); });
    fl.layout.workstations.forEach((w) => state.workstations.push(new Workstation({ ...w, id: w.id + offset, floor: fl.idx })));
  }
  const allRooms = state.floors.flatMap((fl) => fl.layout.rooms);
  const buildingCount = new Set(state.floors.map((fl) => fl.b)).size;
  const tallBuilding = state.floors.some((fl) => fl.f > 0);

  // Which seating preferences this campus can actually test.
  const available = new Set(['withTeam', 'quietRoom', 'nearEntrance', 'openPlan']);
  if (state.floors.some((fl) => fl.layout.windows.length)) available.add('nearWindow');
  if (allRooms.some((r) => r.type === 'break' || r.type === 'lounge' || r.type === 'cafe')) available.add('nearBreak');
  if (tallBuilding) { available.add('groundFloor'); available.add('topFloor'); }
  if (buildingCount > 1) available.add('withDept');

  const count = Math.min(wanted, state.workstations.filter(assignable).length);
  const people = nodes.slice(0, count).map((n) => ({ ...n }));
  const flags = people.map(() => ({}));
  const isStaff = (i) => people[i].rank === 'staff' && !flags[i].receptionist && !flags[i].roomReq;
  const staffPool = shuffle([...people.keys()].filter((i) => people[i].rank === 'staff'));
  const takeStaff = (pred = () => true) => {
    const at = staffPool.findIndex((i) => isStaff(i) && pred(i));
    return at < 0 ? null : staffPool.splice(at, 1)[0];
  };

  // Hand out special requirements only where the floor plan actually provides the space.
  const officeRooms = allRooms.filter((r) => r.type === 'office').length;
  const hasReception = state.workstations.some((w) => w.kind === 'reception');
  const hasPhone = allRooms.some((r) => r.type === 'phone');
  if (hasReception && staffPool.length > 1) {
    const i = takeStaff((k) => people[k].dept === 'admin') ?? takeStaff();
    if (i !== null) {
      flags[i].receptionist = true;
      Object.assign(people[i], { dept: 'admin', team: 'Reception & Mail', role: RECEPTION_ROLE, boss: null });
    }
  }

  // Industry rooms reserve their workstations for specialist staff; one per room type first, then fill.
  const roomSeats = {};
  state.workstations.forEach((w) => { if (SPECIAL_ROOMS[w.kind]) roomSeats[w.kind] = (roomSeats[w.kind] || 0) + 1; });
  const roomRoles = Object.fromEntries(Object.keys(roomSeats).map((k) => [k, shuffle(SPECIAL_ROOMS[k].roles)]));
  let roomBudget = Math.ceil(count / 2);
  for (let round = 0; round < 4; round++) {
    for (const [kind, seats] of Object.entries(roomSeats)) {
      if (round >= seats || roomBudget <= 0 || staffPool.length <= 1) continue;
      const i = takeStaff();
      if (i === null) continue;
      const dept = SPECIAL_ROOMS[kind].team;
      flags[i].roomReq = kind;
      Object.assign(people[i], { dept, team: DEPTS[dept].teams[0], role: roomRoles[kind].pop() || SPECIAL_ROOMS[kind].roles[0], boss: null });
      roomBudget--;
    }
  }
  const taken = new Set([...people.keys()].filter((i) => flags[i].receptionist || flags[i].roomReq));

  // Offices: top of the org chart first, then whoever is left.
  const rankOrder = ['exec', 'pres', 'vp', 'dir', 'mgr'];
  const byRank = [...people.keys()].filter((i) => !taken.has(i) && people[i].rank !== 'staff')
    .sort((a, b) => rankOrder.indexOf(people[a].rank) - rankOrder.indexOf(people[b].rank));
  const officeFor = [...byRank, ...staffPool.filter(isStaff)].slice(0, Math.min(officeRooms, needOffices));
  officeFor.forEach((i) => { flags[i].officeRequired = true; });
  officeFor.forEach((i) => { const at = staffPool.indexOf(i); if (at >= 0) staffPool.splice(at, 1); });

  // Unique names for everyone.
  const usedNames = new Set();
  const nextName = () => {
    for (;;) {
      const pair = [FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)], LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]];
      if (!usedNames.has(pair.join(' '))) { usedNames.add(pair.join(' ')); return pair; }
    }
  };
  state.employees = people.map((p, i) => {
    const [first, last] = nextName();
    return new Employee(i, {
      first, last, dept: p.dept, team: p.team, rank: p.rank, title: p.role[0], flavor: p.role[1], managerId: p.boss,
      preferences: flags[i].receptionist ? 'nearEntrance' : pickPreference(p.dept, available), ...flags[i]
    });
  });
  state.openDept = null;
  state.openEmp = null;

  // Cargo uses its own seeded stream so the roster itself is unchanged.
  const cargoRng = mulberry32((jobVal('seed', 1) ^ 0x2f6b4c1d) >>> 0);
  state.employees.forEach((e) => { e.cargo = rollCargo(e, cargoRng, jobVal('cargoLoad', 0.25)); });

  // Optional requirements and preferences are derived from a guaranteed full seating, so every job is solvable.
  deriveConstraints(buildWitness(), { count, hasPhone, nearPhoneWanted, tallBuilding, buildingCount, available });

  state.finished = false;
  state.damage = 0;
  state.broken = 0;
  state.gen++;
  state.walkingIds = new Set();
  Exec.reset();
  document.getElementById('result').hidden = true;

  state.focus = { b: 0, f: 0 };
  state.mode = 'floor';
  renderBoard();
  buildMeters();
  renderLegend();
  renderFloorNav();
  renderTray();
  updateHud();
  startTimer();
}

// ---------- Rendering ----------
let overlay;

// ---------- Legend: every entry can be hidden or shown on the board ----------
const ROOM_LEGEND = {
  open: ['Open Seating', '#e0f2fe'], office: ['Office', '#fef9c3'], meeting: ['Meeting', '#ede9fe'], break: ['Break Room', '#dcfce7'],
  lounge: ['Lounge', '#ffedd5'], cafe: ['Cafe', '#fef3c7'], reception: ['Reception', '#fae8ff'], phone: ['Phone Room', '#fee2e2']
};
const FEATURE_LEGEND = [
  ['feature:hall', 'Hallway', '#f1f5f9', ['.hall'], 'Features'],
  ['feature:path1', 'Primary Pathway', '#cbd5e1', ['.pathway.primary'], 'Features'],
  ['feature:path2', 'Secondary Pathway', '#e2e8f0', ['.pathway.secondary'], 'Features'],
  ['feature:entrance', 'Entrance', '#22c55e', ['.entrance', '.room-label[data-room="entrance"]'], 'Features'],
  ['feature:dock', 'Loading Dock', '#ea580c', ['.dock', '.room-label[data-room="dock"]'], 'Features'],
  ['feature:pubelev', 'Public Elevator', '#0ea5e9', ['.portal.pubelev', '.room-label[data-room="pubelev"]'], 'Features'],
  ['feature:cargoelev', 'Cargo Elevator', '#b45309', ['.portal.cargoelev', '.room-label[data-room="cargoelev"]'], 'Features'],
  ['feature:svcelev', 'Service Elevator', '#14b8a6', ['.portal.svcelev', '.room-label[data-room="svcelev"]'], 'Features'],
  ['feature:stairs', 'Stairs', '#8b5cf6', ['.portal.stairs', '.room-label[data-room="stairs"]'], 'Features'],
  ['feature:door', 'Door', '#f59e0b', ['.door'], 'Features'],
  ['feature:window', 'Window', '#7dd3fc', ['.window'], 'Features'],
  ['feature:column', 'Structural Column', '#475569', ['.column'], 'Features'],
  ['layer:mgmt', 'Management Lines', '#6366f1', ['.mgmt-lines'], 'Features', true]
];
const legendHidden = new Set();
let legendStyle = null;
const legendUi = { open: false, pinned: false };
try { Object.assign(legendUi, JSON.parse(localStorage.getItem('moveflow.legend')) || {}); } catch { /* defaults */ }
const saveLegendUi = () => localStorage.setItem('moveflow.legend', JSON.stringify(legendUi));

// Hidden entries become CSS rules scoped to the board.
function legendCss(key) {
  const [kind, id] = key.split(':');
  if (kind === 'room') return [`.floor.${id}`, `.room-label[data-room="${id}"]`].map((s) => `#game-board ${s}`).join(',') + '{display:none}';
  if (kind === 'dept') return `#game-board .ws.taken[data-team="${id}"]{fill:#f1f5f9 !important;stroke:#94a3b8 !important}#game-board circle[data-team="${id}"]{display:none}`;
  const sel = FEATURE_LEGEND.find((f) => f[0] === key)[3];
  return sel.map((s) => `#game-board ${s}`).join(',') + '{display:none}';
}

function renderLegend() {
  const legend = document.getElementById('legend');
  legendHidden.clear();
  if (!legendStyle) { legendStyle = document.createElement('style'); document.head.append(legendStyle); }
  const present = new Set(state.employees.map((e) => e.dept));
  const roomTypes = [...new Set(state.floors.flatMap((fl) => fl.layout.rooms.map((r) => r.type)))].filter((t) => ROOM_LEGEND[t] || ROOM_DEFS[t]);
  const entries = [
    ...Object.keys(TEAM_COLORS).filter((d) => present.has(d)).map((d) => ({ key: `dept:${d}`, cat: 'Departments', label: DEPT_LABELS[d], color: TEAM_COLORS[d], dot: true })),
    ...roomTypes.map((t) => ({ key: `room:${t}`, cat: 'Room Types', label: ROOM_LEGEND[t] ? ROOM_LEGEND[t][0] : ROOM_DEFS[t].name, color: ROOM_LEGEND[t] ? ROOM_LEGEND[t][1] : ROOM_DEFS[t].fill })),
    ...FEATURE_LEGEND.map(([key, label, color, , cat, line]) => ({ key, cat, label, color, line }))
  ];
  // Reporting lines are busy on big jobs, so they start hidden there.
  if (state.employees.length >= 60) legendHidden.add('layer:mgmt');

  const buttons = new Map();
  const catButtons = new Map();
  const count = el('span', 'legend-count');
  const sync = () => {
    buttons.forEach((b, key) => { b.classList.toggle('off', legendHidden.has(key)); b.setAttribute('aria-pressed', String(!legendHidden.has(key))); });
    catButtons.forEach((b, cat) => b.classList.toggle('off', entries.filter((e) => e.cat === cat).every((e) => legendHidden.has(e.key))));
    count.textContent = legendHidden.size ? `${legendHidden.size} hidden` : '';
    legendStyle.textContent = [...legendHidden].map(legendCss).join('\n');
  };
  const groups = el('div', 'legend-groups');
  groups.style.display = 'contents';
  for (const cat of [...new Set(entries.map((e) => e.cat))]) {
    const row = el('div', 'legend-row');
    const catBtn = el('button', 'legend-cat', cat);
    catBtn.type = 'button';
    catBtn.title = `Show or hide every ${cat.toLowerCase()} entry`;
    const items = el('div', 'legend-items');
    const mine = entries.filter((e) => e.cat === cat);
    catBtn.addEventListener('click', () => {
      const allShown = mine.every((e) => !legendHidden.has(e.key));
      mine.forEach((e) => (allShown ? legendHidden.add(e.key) : legendHidden.delete(e.key)));
      sync();
    });
    catButtons.set(cat, catBtn);
    for (const e of mine) {
      const b = el('button', 'lg');
      b.type = 'button';
      const swatch = el('i', e.dot ? 'dot' : e.line ? 'line' : '');
      if (e.line) swatch.style.color = e.color; else swatch.style.background = e.color;
      b.append(swatch, e.label);
      b.addEventListener('click', () => { if (!legendHidden.delete(e.key)) legendHidden.add(e.key); sync(); });
      buttons.set(e.key, b);
      items.append(b);
    }
    row.append(catBtn, items);
    groups.append(row);
  }

  const all = (hide) => () => { entries.forEach((e) => (hide ? legendHidden.add(e.key) : legendHidden.delete(e.key))); sync(); };
  const show = el('button', 'legend-btn', 'Show All');
  const hide = el('button', 'legend-btn', 'Hide All');
  show.type = hide.type = 'button';
  show.addEventListener('click', all(false));
  hide.addEventListener('click', all(true));
  const head = el('div', 'legend-head');
  head.append(show, hide);
  const inner = el('div', 'legend-inner');
  inner.append(groups);
  const body = el('div', 'legend-body');
  body.append(inner);

  const toggle = el('button', 'legend-toggle');
  toggle.type = 'button';
  toggle.append(el('b', '', 'Legend'), el('span', 'legend-chevron', '\u25B2'));
  const pin = el('button', 'legend-pin', '\ud83d\udccc');
  pin.type = 'button';
  pin.title = 'Pin the legend open';
  const handle = el('div', 'legend-handle');
  handle.append(toggle, show, hide, count, pin);
  const apply = () => {
    legend.classList.toggle('open', legendUi.open || legendUi.pinned);
    legend.classList.toggle('pinned', legendUi.pinned);
    pin.classList.toggle('on', legendUi.pinned);
    pin.setAttribute('aria-pressed', String(legendUi.pinned));
    toggle.setAttribute('aria-expanded', String(legendUi.open || legendUi.pinned));
    saveLegendUi();
  };
  toggle.addEventListener('click', () => { legendUi.open = !(legendUi.open || legendUi.pinned); legendUi.pinned = legendUi.pinned && legendUi.open; apply(); });
  pin.addEventListener('click', () => { legendUi.pinned = !legendUi.pinned; legendUi.open = legendUi.pinned || legendUi.open; apply(); });
  legend.replaceChildren(body, handle);
  apply();
  sync();
}

// An unpinned legend slides back down when the player clicks the board or presses Escape.
document.addEventListener('pointerdown', (e) => {
  const legend = document.getElementById('legend');
  if (legendUi.open && !legendUi.pinned && !legend.contains(e.target)) { legendUi.open = false; legend.classList.remove('open'); saveLegendUi(); }
});
document.addEventListener('keydown', (e) => {
  const legend = document.getElementById('legend');
  if (e.key === 'Escape' && legendUi.open && !legendUi.pinned) { legendUi.open = false; legend.classList.remove('open'); saveLegendUi(); }
});

// Every floor lives in one SVG as a translated group; the viewer shows one group or all of them.
function renderBoard() {
  svg.replaceChildren(Lighting.defs());
  const tod = state.job?.timeOfDay;
  Lighting.apply(svg, tod);
  for (const fl of state.floors) {
    fl.g = document.createElementNS(SVG_NS, 'g');
    fl.g.setAttribute('class', 'floor-g');
    fl.layout.elements.forEach((node) => fl.g.appendChild(node));
    fl.dyn = document.createElementNS(SVG_NS, 'g');
    fl.links = document.createElementNS(SVG_NS, 'g');
    fl.links.setAttribute('class', 'mgmt-lines');
    fl.links.setAttribute('pointer-events', 'none');
    fl.walkers = document.createElementNS(SVG_NS, 'g');
    fl.walkers.setAttribute('pointer-events', 'none');
    fl.chart = document.createElementNS(SVG_NS, 'g');
    fl.chart.setAttribute('class', 'chart-layer');
    fl.chart.setAttribute('pointer-events', 'none');
    fl.light = Lighting.build(fl, tod);
    fl.g.append(fl.light, fl.dyn, fl.links, fl.walkers, fl.chart);
    svg.appendChild(fl.g);
  }
  overlay = document.createElementNS(SVG_NS, 'g');
  overlay.setAttribute('class', 'overview');
  svg.appendChild(overlay);
  arrangeCampus();
  renderDynamic();
  showFocus(true);
}

// Lays floors out for the 2D multi-floor views (buildings as columns with floors stacked, or as rows) and draws the labels.
// `only` limits the layout to one building.
function arrangeCampus(forced, only) {
  const group = only === undefined ? state.floors : state.floors.filter((fl) => fl.b === only);
  const maxW = Math.max(...group.map((fl) => fl.layout.width * 10));
  const maxH = Math.max(...group.map((fl) => fl.layout.height * 10));
  const fs = maxW / 14;
  const title = fs * 1.7;
  const lab = fs * 1.5;
  const gapX = fs * 0.8;
  const gapY = fs * 0.6;
  const buildings = [...new Set(group.map((fl) => fl.b))];
  const floorsIn = (b) => group.filter((fl) => fl.b === b).length;
  const tallest = Math.max(...buildings.map(floorsIn));
  const widest = tallest;
  const place = (orient) => {
    const pos = new Map();
    let w; let h;
    if (orient === 'cols') {
      for (const fl of group) pos.set(fl, [buildings.indexOf(fl.b) * (maxW + gapX), title + (tallest - 1 - fl.f) * (maxH + lab + gapY) + lab]);
      w = buildings.length * (maxW + gapX) - gapX;
      h = title + tallest * (maxH + lab + gapY) - gapY;
    } else {
      const block = title + lab + maxH + gapY * 2;
      for (const fl of group) pos.set(fl, [fl.f * (maxW + gapX), buildings.indexOf(fl.b) * block + title + lab]);
      w = widest * (maxW + gapX) - gapX;
      h = buildings.length * block - gapY * 2;
    }
    return { pos, w, h };
  };
  const stage = svg.getBoundingClientRect();
  const fit = (p) => Math.min(stage.width / p.w, stage.height / p.h);
  const cols = place('cols');
  const rows = place('rows');
  const orient = forced || (stage.width && stage.height && fit(rows) > fit(cols) ? 'rows' : 'cols');
  const chosen = orient === 'rows' ? rows : cols;
  state.orient = orient;
  const pad = fs * 0.5;
  state.world = { x: -pad, y: -pad, w: chosen.w + pad * 2, h: chosen.h + pad * 2 };

  overlay.replaceChildren();
  const text = (cls, str, x, y, size) => {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('class', cls);
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('font-size', size);
    t.textContent = str;
    overlay.appendChild(t);
    return t;
  };
  state.floors.forEach((fl) => { fl.label = null; });
  for (const fl of group) {
    [fl.ox, fl.oy] = chosen.pos.get(fl);
    fl.g.setAttribute('transform', `translate(${fl.ox} ${fl.oy})`);
    fl.label = text('ov-floor', '', fl.ox, fl.oy - lab * 0.3, fs * 0.7);
    fl.label.addEventListener('click', () => showFloor(fl.b, fl.f));
  }
  for (const b of buildings) {
    const first = group.filter((fl) => fl.b === b).sort((p, q) => p.f - q.f)[0];
    const [bx, by] = orient === 'cols' ? [first.ox, title * 0.75] : [0, first.oy - lab - title * 0.25];
    text('ov-title', first.bName, bx, by, fs * 1.1);
  }
  updateFloorLabels();
}

function updateFloorLabels() {
  for (const fl of state.floors) {
    if (!fl.label) continue;
    const seats = state.workstations.filter((w) => w.floor === fl.idx && assignable(w));
    fl.label.textContent = `${fl.bName} \u00b7 ${fl.name}  (${seats.filter((w) => w.assignedEmployeeId !== null).length}/${seats.length} desks used)`;
  }
}

function showFloor(b, f) {
  state.focus = { b, f };
  setViewMode('floor');
}

// Shows the floors the current mode calls for and fits the view to them.
function showFocus(refit) {
  const m = state.mode;
  const visible = (fl) => (m === 'floor' ? fl.b === state.focus.b && fl.f === state.focus.f : m === 'building' ? fl.b === state.focus.b : true);
  for (const fl of state.floors) fl.g.style.display = visible(fl) ? '' : 'none';
  overlay.style.display = m === 'floor' ? 'none' : '';
  if (refit) {
    const full = focusBounds();
    view.x = full.x; view.y = full.y; view.w = full.w;
    applyView();
  }
  updateFloorNav();
  updateCharts();
}

// Re-fit whenever the board's size changes (window resize, or the employee card docking beside it).
new ResizeObserver(() => {
  if (document.body.classList.contains('playing') && state.floors.length && state.mode === 'campus') setViewMode('campus');
}).observe(svg);

function navButton(cls, label, title, fn) {
  const b = el('button', `nav-btn ${cls}`);
  b.type = 'button';
  b.title = title;
  b.append(el('span', 'nav-name', label), el('small', 'nav-count', ''));
  b.addEventListener('click', fn);
  return b;
}

// Building and floor buttons for the viewer (hidden when the job has a single floor).
function renderFloorNav() {
  const nav = document.getElementById('floor-nav');
  nav.hidden = !state.floors.length;
  nav.replaceChildren();
  if (nav.hidden) return;
  const buildings = [...new Set(state.floors.map((fl) => fl.b))];
  const row = el('div', 'nav-row');
  row.append(el('span', 'nav-label', 'Building'));
  for (const b of buildings) {
    const name = state.floors.find((fl) => fl.b === b).bName;
    const floorsInB = state.floors.filter((fl) => fl.b === b).length;
    const btn = navButton('nav-b', buildingLetter(b), name, () => {
      state.focus = { b, f: Math.min(state.focus.f, floorsInB - 1) };
      setViewMode(modeFrom(false, isAllFloors()));
    });
    btn.dataset.b = b;
    row.append(btn);
  }
  if (buildings.length > 1) {
    row.append(navButton('nav-allb wide', 'View All', 'View every building: floors stacked in isometric view', () => setViewMode(modeFrom(!isAllBuildings(), isAllFloors()))));
  }
  nav.append(row);
  nav.append(el('div', 'nav-row nav-floors'));
  updateFloorNav();
}

function updateFloorNav() {
  const nav = document.getElementById('floor-nav');
  if (nav.hidden) return;
  const focus = state.focus;
  const allB = isAllBuildings();
  const allF = isAllFloors();
  const seated = (pred) => {
    const ws = state.workstations.filter((w) => assignable(w) && pred(state.floors[w.floor]));
    return `${ws.filter((w) => w.assignedEmployeeId !== null).length}/${ws.length}`;
  };
  nav.querySelectorAll('.nav-b').forEach((btn) => {
    const b = +btn.dataset.b;
    btn.classList.toggle('active', !allB && focus.b === b);
    btn.querySelector('.nav-count').textContent = seated((fl) => fl.b === b);
  });
  const allBtn = nav.querySelector('.nav-allb');
  if (allBtn) {
    allBtn.classList.toggle('active', allB);
    allBtn.querySelector('.nav-count').textContent = seated(() => true);
  }
  const row = nav.querySelector('.nav-floors');
  const floors = state.floors.filter((fl) => fl.b === focus.b).sort((p, q) => p.f - q.f);
  row.replaceChildren(el('span', 'nav-label', 'Floor'));
  for (const fl of floors) {
    const btn = el('button', `nav-btn nav-f${state.mode === 'floor' && focus.f === fl.f ? ' active' : ''}`);
    btn.type = 'button';
    btn.title = `${fl.bName} \u00b7 ${fl.name}`;
    btn.append(el('span', 'nav-name', `${fl.f + 1}F`), el('small', 'nav-count', seated((x) => x === fl)));
    btn.addEventListener('click', () => showFloor(fl.b, fl.f));
    row.append(btn);
  }
  if (floors.length > 1) {
    const allF2 = navButton(`nav-allf wide${allF ? ' active' : ''}`, 'View All', 'View every floor of this building (overhead). With View All buildings on, switches the isometric view to overhead.', () => setViewMode(modeFrom(isAllBuildings(), !isAllFloors())));
    allF2.querySelector('.nav-count').textContent = seated((fl) => fl.b === focus.b);
    row.append(allF2);
  }
  updateFloorLabels();
}

function renderDynamic() {
  clearFocus();
  const s = 10;
  for (const fl of state.floors) {
    fl.dyn.replaceChildren();
    const ent = fl.layout.entrance;
    const mark = document.createElementNS(SVG_NS, 'rect');
    mark.setAttribute('x', ent.x * s); mark.setAttribute('y', ent.y * s);
    mark.setAttribute('width', s); mark.setAttribute('height', s);
    mark.setAttribute('fill', fl.f > 0 ? '#0ea5e9' : '#3fb27f');
    fl.dyn.appendChild(mark);
  }

  for (const ws of state.workstations) {
    if (!assignable(ws)) continue;
    const layer = state.floors[ws.floor].dyn;
    const d = ws.desk;
    const rect = document.createElementNS(SVG_NS, 'rect');
    const owner = ws.assignedEmployeeId === null ? null : state.employees[ws.assignedEmployeeId];
    rect.setAttribute('class', owner ? 'ws taken' : 'ws');
    if (owner) rect.style.setProperty('--team', TEAM_COLORS[owner.dept]);
    rect.dataset.ws = ws.id;
    if (owner) { rect.dataset.team = owner.dept; rect.dataset.emp = owner.id; }
    rect.setAttribute('x', d.x * s + 0.5); rect.setAttribute('y', d.y * s + 0.5);
    rect.setAttribute('width', d.w * s - 1); rect.setAttribute('height', d.h * s - 1);
    rect.setAttribute('rx', 1.5);
    layer.appendChild(rect);

    const chair = document.createElementNS(SVG_NS, 'circle');
    chair.setAttribute('class', 'chair');
    chair.dataset.ws = ws.id;
    chair.setAttribute('cx', (ws.desk.x + ws.desk.w / 2) * s); chair.setAttribute('cy', ws.gridY * s + s / 2);
    chair.setAttribute('r', s * 0.38);
    layer.appendChild(chair);

    if (ws.assignedEmployeeId !== null && !state.walkingIds.has(ws.assignedEmployeeId)) {
      const emp = state.employees[ws.assignedEmployeeId];
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', (ws.desk.x + ws.desk.w / 2) * s); dot.setAttribute('cy', ws.gridY * s + s / 2);
      dot.setAttribute('r', s * 0.3);
      dot.setAttribute('fill', TEAM_COLORS[emp.dept]);
      dot.setAttribute('stroke', 'rgba(0,0,0,.2)');
      dot.setAttribute('pointer-events', 'none');
      dot.setAttribute('class', 'emp-dot');
      dot.dataset.team = emp.dept;
      dot.dataset.emp = emp.id;
      layer.appendChild(dot);
    }
  }
  renderLinks();
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Hovering a name dims every other employee bubble in the org chart and on the floor plan.
function focusEmployee(id) {
  document.getElementById('app').classList.add('focusing');
  document.querySelectorAll(`[data-emp="${id}"]`).forEach((n) => n.classList.add('is-focus'));
}

function clearFocus() {
  document.getElementById('app').classList.remove('focusing');
  document.querySelectorAll('.is-focus').forEach((n) => n.classList.remove('is-focus'));
}

function selectEmployee(id) {
  clearFocus();
  state.openDept = state.employees[id].dept;
  state.openEmp = id;
  renderTray();
}

function empLink(emp) {
  const link = el('span', 'emp-link', emp.fullName);
  link.tabIndex = 0;
  link.setAttribute('role', 'button');
  link.title = emp.title;
  link.addEventListener('mouseenter', () => focusEmployee(emp.id));
  link.addEventListener('mouseleave', clearFocus);
  link.addEventListener('click', () => selectEmployee(emp.id));
  link.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectEmployee(emp.id); });
  return link;
}

// Replaces a {who} marker with a clickable name.
const withNameLink = (text, who) => (who != null && text.includes('{who}')
  ? text.split('{who}').flatMap((part, i, all) => (i < all.length - 1 ? [part, empLink(state.employees[who])] : [part]))
  : [text]);

function employeeInfo(emp) {
  const card = el('div', 'emp-info');
  card.append(el('b', '', emp.fullName), el('div', 'emp-title', `${emp.title} \u00b7 ${DEPT_LABELS[emp.dept]} \u00b7 ${emp.team}`));
  const seat = seatOf(emp.id);
  const mark = (met) => el('span', `mark${met === null ? '' : met ? ' ok' : ' bad'}`, met === null ? '\u2022' : met ? '\u2713' : '\u2717');

  const reqs = requirementStatus(emp);
  card.append(el('div', 'emp-label', 'Requirements'));
  const reqList = el('ul');
  if (!reqs.length) reqList.append(el('li', 'rel-item', 'Any desk will do'));
  for (const r of reqs) {
    const li = el('li', 'req-item');
    li.append(mark(r.met), ...withNameLink(r.text, r.who));
    reqList.append(li);
  }
  card.append(reqList, el('div', 'emp-label', 'Preferences'));
  const prefLi = el('li', 'pref-item');
  prefLi.append(mark(seat ? preferenceMet(emp, seat) : null), PREF_LABELS[emp.preferences]);
  card.append(el('ul'));
  card.lastChild.append(prefLi);

  const cargoLi = el('li', 'rel-item', cargoOf(emp).map((k) => `${OBJECT_TYPES[k].emoji} ${Math.round(Perks.deploySecs(k) * 10) / 10}s`).join(' \u00b7 '));
  card.append(el('div', 'emp-label', 'Cargo to move'), el('ul'));
  card.lastChild.append(cargoLi);

  // Relationships: everyone named here is selectable.
  const rel = [];
  const names = (list) => list.flatMap((o, i) => (i ? [', ', empLink(o)] : [empLink(o)]));
  if (emp.isManager) {
    const reports = state.employees.filter((o) => o.managerId === emp.id);
    rel.push(['Manages: ', ...(reports.length ? [...names(reports.slice(0, 12)), reports.length > 12 ? ` and ${reports.length - 12} more` : ''] : ['no one'])]);
  }
  if (emp.managerId != null) rel.push(['Reports to: ', empLink(state.employees[emp.managerId]), `, ${state.employees[emp.managerId].title}`]);
  if (rel.length) {
    const relList = el('ul');
    rel.forEach((parts) => { const li = el('li', 'rel-item'); li.append(...parts); relList.append(li); });
    card.append(el('div', 'emp-label', 'Relationships'), relList);
  }
  card.append(el('p', 'emp-flavor', `\u201c${emp.flavor}\u201d`));
  if (seat) {
    card.append(el('div', 'emp-seated', `Seated: ${floorOf(seat).bName}, ${floorOf(seat).name}`));
    if (state.phase === 'planning') {
      const back = el('button', 'unassign-btn inline', '🗑️ Unassign');
      back.type = 'button';
      back.addEventListener('click', () => unseat(seat));
      card.append(back);
    }
  }
  return card;
}

function makeToken(emp) {
  const isSeated = !!seatOf(emp.id);
  const ring = RANKS[emp.rank].ring;
  const cls = ['token', isSeated && 'seated', state.openEmp === emp.id && 'picked', emp.officeRequired && 'needs-office', emp.roomReq && 'needs-room', ring && 'ranked', (emp.nearManager || emp.nearTeammate) && 'needs-adj'];
  const tok = el('div', cls.filter(Boolean).join(' '), emp.initials);
  tok.style.setProperty('--team', TEAM_COLORS[emp.dept]);
  if (ring) tok.style.setProperty('--ring', ring);
  tok.title = `${emp.fullName}, ${emp.title}`;
  tok.dataset.fx = 'none';
  tok.dataset.emp = emp.id;
  if (isSeated) tok.addEventListener('click', () => { state.openEmp = state.openEmp === emp.id ? null : emp.id; renderTray(); });
  else tok.addEventListener('pointerdown', (e) => startDrag(e, emp, tok));
  return tok;
}

// One reporting line: a leader on top, an arrow down, then their direct reports (leaders nest their own lines).
// Each team gets its own Unassign All button.
function orgBranch(node, childrenOf) {
  const branch = el('div', 'org-branch');
  if (node.rank === 'mgr') {
    const team = state.employees.filter((e) => e.teamId === node.teamId);
    const btn = el('button', 'unassign-btn small', '🗑️');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Unassign All');
    btn.title = `Send the ${node.team} team back to the roster`;
    btn.disabled = !team.some((e) => seatOf(e.id));
    btn.addEventListener('click', () => unassignGroup(`${node.team} team`, team));
    branch.append(btn, el('div', 'org-team', node.team));
  }
  branch.append(makeToken(node));
  const kids = childrenOf.get(node.id) || [];
  if (!kids.length) return branch;
  const arrow = document.createElementNS(SVG_NS, 'svg');
  arrow.setAttribute('class', 'org-arrows');
  arrow.setAttribute('width', 14);
  arrow.setAttribute('height', 20);
  arrow.innerHTML = '<line x1="7" y1="0" x2="7" y2="13" stroke="#64748b" stroke-width="2"/><path d="M2 11L7 19L12 11z" fill="#64748b"/>';
  const row = el('div', 'org-kids');
  kids.forEach((k) => row.append(k.isManager ? orgBranch(k, childrenOf) : makeToken(k)));
  branch.append(arrow, row);
  return branch;
}

// Sends a group of employees back to the roster after a confirmation.
async function unassignGroup(label, people) {
  if (state.phase !== 'planning') { toast('Seating is locked once Execute begins'); return; }
  const seats = people.map((e) => seatOf(e.id)).filter(Boolean);
  if (!seats.length) return;
  const n = seats.length;
  const ok = await Modal.confirm({
    title: 'Unassign All?',
    message: `${label}: ${n} seated employee${n === 1 ? '' : 's'} will return to the roster.`,
    confirmText: 'Unassign',
    danger: true
  });
  if (!ok || state.phase !== 'planning' || state.finished) return;
  for (const ws of seats) {
    ws.assignedEmployeeId = null;
  }
  FX.play('pop');
  renderDynamic();
  renderTray();
  updateHud();
}

document.getElementById('unassign-all-btn').addEventListener('click', () => unassignGroup('Everyone', state.employees));
document.getElementById('unassign-dept-btn').addEventListener('click', () => {
  if (state.openDept) unassignGroup(DEPT_LABELS[state.openDept], state.employees.filter((e) => e.dept === state.openDept));
});

// Departments grid (square tiles, seated count only); the selected department's org chart renders in its own panel.
function renderTray() {
  clearFocus();
  document.getElementById('unassign-all-btn').disabled = !state.workstations.some((w) => w.assignedEmployeeId !== null);
  const tray = document.getElementById('tray');
  const panel = document.getElementById('side');
  const keep = panel.scrollTop;
  tray.replaceChildren();
  for (const dept of Object.keys(DEPTS)) {
    const emps = state.employees.filter((e) => e.dept === dept);
    if (!emps.length) continue;
    const seated = emps.filter((e) => seatOf(e.id)).length;
    const btn = el('button', `dept-btn${state.openDept === dept ? ' open' : ''}${seated === emps.length ? ' done' : ''}`);
    btn.type = 'button';
    btn.title = DEPT_LABELS[dept];
    btn.style.setProperty('--team', TEAM_COLORS[dept]);
    btn.append(el('span', 'dept-dot'), el('span', 'dept-name', DEPT_LABELS[dept]), el('span', 'dept-stats', `${seated}/${emps.length}`));
    btn.addEventListener('click', () => {
      state.openDept = state.openDept === dept ? null : dept;
      state.openEmp = null;
      renderTray();
    });
    tray.append(btn);
  }
  panel.scrollTop = keep;
  renderOrg();
  renderLinks();
}

// Faint dashed curves from each seated employee to their manager (same floor only); the selected person's lines are drawn bold.
function renderLinks() {
  if (!state.floors.length || !state.floors[0].links) return;
  for (const fl of state.floors) fl.links.replaceChildren();
  const s = 10;
  const seatByEmp = new Map(state.workstations.filter((w) => w.assignedEmployeeId !== null).map((w) => [w.assignedEmployeeId, w]));
  const centre = (w) => [(w.desk.x + w.desk.w / 2) * s, w.gridY * s + s / 2];
  const pairs = [];
  for (const emp of state.employees) {
    if (emp.managerId === null) continue;
    const a = seatByEmp.get(emp.id);
    const b = seatByEmp.get(emp.managerId);
    if (a && b && a.floor === b.floor) pairs.push({ emp, a, b, hot: state.openEmp === emp.id || state.openEmp === emp.managerId });
  }
  pairs.sort((p, q) => p.hot - q.hot); // bold lines last so they sit on top
  for (const { emp, a, b, hot } of pairs) {
    const [x1, y1] = centre(a);
    const [x2, y2] = centre(b);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d = Math.hypot(dx, dy);
    if (d < 1) continue;
    const bend = Math.min(d * 0.18, 16);
    const cx = (x1 + x2) / 2 - (dy / d) * bend;
    const cy = (y1 + y2) / 2 + (dx / d) * bend;
    // Stop just short of the manager's bubble and finish with a small arrowhead.
    const ex = x2 - cx;
    const ey = y2 - cy;
    const el2 = Math.hypot(ex, ey) || 1;
    const ux = ex / el2;
    const uy = ey / el2;
    const tx = x2 - ux * 4.5;
    const ty = y2 - uy * 4.5;
    const color = TEAM_COLORS[emp.dept];
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M${x1} ${y1}Q${cx} ${cy} ${tx - ux * 3} ${ty - uy * 3}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', hot ? 2.2 : 1);
    path.setAttribute('stroke-opacity', hot ? 1 : 0.4);
    if (!hot) path.setAttribute('stroke-dasharray', '3 2.5');
    const head = document.createElementNS(SVG_NS, 'polygon');
    const size = hot ? 6 : 4.5;
    head.setAttribute('points', `${tx},${ty} ${tx - ux * size - uy * size * 0.5},${ty - uy * size + ux * size * 0.5} ${tx - ux * size + uy * size * 0.5},${ty - uy * size - ux * size * 0.5}`);
    head.setAttribute('fill', color);
    head.setAttribute('fill-opacity', hot ? 1 : 0.55);
    floorOf(a).links.append(path, head);
  }
}

function renderOrg() {
  const tree = document.getElementById('org-tree');
  const wrap = document.getElementById('emp-card');
  const card = document.getElementById('emp-card-body');
  const panel = document.getElementById('org-panel');
  const keep = panel.scrollTop;
  tree.replaceChildren();
  card.replaceChildren();
  const dept = state.openDept;
  document.getElementById('org-title').textContent = dept ? DEPT_LABELS[dept] : '';
  const deptBtn = document.getElementById('unassign-dept-btn');
  deptBtn.hidden = !dept;
  deptBtn.disabled = !dept || !state.employees.some((e) => e.dept === dept && seatOf(e.id));
  const picked = state.openEmp === null ? null : state.employees[state.openEmp];
  if (picked) card.append(employeeInfo(picked));
  else if (empCardUi.pinned) { const tip = el('div', 'org-tip'); tip.append(el('span', '', '\ud83d\udc64'), 'Select an employee to view'); card.append(tip); }
  wrap.hidden = !picked && !empCardUi.pinned;
  if (!dept) {
    const tip = el('div', 'org-tip');
    tip.append(el('span', '', '\ud83d\uddc2\ufe0f'), 'Select a Department to view');
    tree.append(tip);
    return;
  }
  const emps = state.employees.filter((e) => e.dept === dept);
  const rankOrder = Object.keys(RANKS);

  // Roots are people whose boss sits in another department (or nobody); everyone else hangs beneath them.
  const childrenOf = new Map();
  for (const e of emps) {
    if (e.managerId === null || state.employees[e.managerId].dept !== dept) continue;
    if (!childrenOf.has(e.managerId)) childrenOf.set(e.managerId, []);
    childrenOf.get(e.managerId).push(e);
  }
  const isRoot = (e) => e.managerId === null || state.employees[e.managerId].dept !== dept;
  const org = el('div', 'emp-org');
  for (const boss of emps.filter((e) => isRoot(e) && e.isManager).sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank))) org.append(orgBranch(boss, childrenOf));
  const loose = emps.filter((e) => isRoot(e) && !e.isManager);
  if (loose.length) {
    const row = el('div', 'emp-grid');
    loose.forEach((e) => row.append(makeToken(e)));
    org.append(row);
  }
  tree.append(org);
  panel.scrollTop = keep;
}

const empCardUi = { pinned: false };
try { Object.assign(empCardUi, JSON.parse(localStorage.getItem('moveflow.empcard')) || {}); } catch { /* defaults */ }
function applyEmpPin() {
  const pin = document.getElementById('emp-pin');
  document.getElementById('emp-card').classList.toggle('pinned', empCardUi.pinned);
  pin.classList.toggle('on', empCardUi.pinned);
  pin.setAttribute('aria-pressed', String(empCardUi.pinned));
  localStorage.setItem('moveflow.empcard', JSON.stringify(empCardUi));
}
document.getElementById('emp-pin').addEventListener('click', () => { empCardUi.pinned = !empCardUi.pinned; applyEmpPin(); renderOrg(); });
applyEmpPin();

function updateHud() {
  if (state.floors.length) updateFloorNav();
  updateMeters();
  updateCharts();
}

// ---------- Header meters: time limit, employees assigned, satisfaction ----------

function satisfaction() {
  if (!state.employees.length) return 0;
  const seatByEmp = new Map(state.workstations.filter((w) => w.assignedEmployeeId !== null).map((w) => [w.assignedEmployeeId, w]));
  let met = 0;
  for (const emp of state.employees) {
    const ws = seatByEmp.get(emp.id);
    if (ws && preferenceMet(emp, ws)) met++;
  }
  return met / state.employees.length;
}

const meters = { box: null, list: [] };

function meterSpecs() {
  const n = state.employees.length;
  const placed = state.workstations.filter((w) => w.assignedEmployeeId !== null).length;
  const sat = satisfaction();
  const goal = Perks.satGoal(state.job);
  return [
    {
      key: 'crew', name: 'Employees', value: placed, max: n, cost: false,
      text: `${placed} assigned \u00b7 ${n - placed} unassigned`, delta: (d) => `${d > 0 ? '+' : ''}${d}`, marks: []
    },
    {
      key: 'sat', name: 'Satisfaction', value: sat, max: 1, cost: false, goal,
      text: `${Math.round(sat * 100)}%`, delta: (d) => `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`,
      marks: [{ at: goal, label: 'Goal', tip: `Goal: ${Math.round(goal * 100)}% of the crew with their preference met` }]
    }
  ];
}

function buildMeters() {
  const box = document.getElementById('hud-meters');
  box.replaceChildren();
  meters.box = box;

  // Time limit comes first (bottom left); the countdown itself is driven by updateTimerChip.
  const timer = el('div', 'meter meter-timer');
  timer.id = 'meter-timer';
  const tFill = el('span', 'meter-fill');
  tFill.id = 'time-fill';
  const tBar = el('div', 'meter-bar');
  tBar.append(tFill);
  const tTrack = el('div', 'meter-track');
  tTrack.append(tBar);
  const tVal = el('b', 'meter-val');
  tVal.id = 'hud-time';
  timer.append(el('span', 'meter-name', 'Time Limit'), tTrack, tVal);
  box.append(timer);

  meters.list = meterSpecs().map((spec) => {
    const m = el('div', `meter meter-${spec.key}`);
    const name = el('span', 'meter-name', spec.name);
    const val = el('b', 'meter-val');
    const bar = el('div', 'meter-bar');
    const fill = el('span', 'meter-fill');
    bar.append(fill);
    const track = el('div', 'meter-track');
    track.append(bar);
    const marks = spec.marks.map(() => { const i = el('i', 'meter-ms'); i.append(el('em')); track.append(i); return i; });
    const delta = el('span', 'meter-delta');
    track.append(delta);
    m.append(name, track, val);
    box.append(m);
    return { key: spec.key, m, fill, val, marks, delta, prev: null, hit: marks.map(() => null) };
  });
}

function restart(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function updateMeters() {
  if (!meters.box || !state.employees.length) return;
  const specs = meterSpecs();
  meters.list.forEach((ui, k) => {
    const s = specs[k];
    const pct = (v) => `${Math.max(0, Math.min(1, v / s.max)) * 100}%`;
    ui.fill.style.width = pct(s.value);
    ui.fill.className = `meter-fill ${s.value >= (s.goal ?? s.max) ? 'ok' : 'low'}`;
    ui.val.textContent = s.text;
    // Marks that land on the same spot (no spare moves) share one label.
    const marks = s.marks.filter((mk, i) => !s.marks.slice(i + 1).some((o) => Math.abs(o.at - mk.at) < s.max * 0.02));
    ui.marks.forEach((node, i) => {
      const mk = marks[i];
      node.hidden = !mk;
      if (!mk) return;
      node.style.left = pct(mk.at);
      node.classList.toggle('first', i === 0 && marks.length > 1);
      node.firstChild.textContent = s.marks.length > marks.length ? 'Par = Limit' : mk.label;
      node.title = mk.tip;
      const hit = s.value >= mk.at;
      if (ui.hit[i] !== null && ui.hit[i] !== hit && hit) restart(node, 'pop');
      ui.hit[i] = hit;
      node.classList.toggle('hit', hit);
    });
    if (ui.prev !== null && Math.abs(s.value - ui.prev) > 1e-9) {
      const d = s.value - ui.prev;
      const good = s.cost ? null : d > 0;
      ui.m.classList.remove('bump-up', 'bump-down', 'bump-cost');
      restart(ui.m, good === null ? 'bump-cost' : good ? 'bump-up' : 'bump-down');
      ui.delta.textContent = s.delta(d);
      ui.delta.dataset.kind = good === null ? 'cost' : good ? 'up' : 'down';
      restart(ui.delta, 'show');
    }
    ui.prev = s.value;
  });
}

let timerId;
function updateTimerChip() {
  const limit = jobVal('timeLimit', 0);
  const fill = document.getElementById('time-fill');
  if (!fill) return;
  const sec = Math.ceil(state.timeLeft);
  document.getElementById('hud-time').textContent = limit ? formatClock(sec) : 'No time limit';
  fill.style.width = limit ? `${(state.timeLeft / limit) * 100}%` : '100%';
  fill.className = `meter-fill ${!limit ? 'low' : sec <= 60 ? 'bad' : state.timeLeft / limit <= 0.25 ? 'warn' : 'ok'}`;
}

FX.registerSound('warn', { freq: 240, to: 170, dur: 0.12, type: 'square', gain: 0.35 });

function pulseTimer() {
  const node = document.getElementById('meter-timer');
  node.classList.remove('alert');
  void node.offsetWidth;
  node.classList.add('alert');
}

// One-minute and 30-second warnings, then a pulse and tick every second until zero.
function timerSecond(sec, limit) {
  document.getElementById('meter-timer').classList.toggle('low', sec <= 60);
  if (sec <= 0) return;
  if ((sec === 60 && limit > 60) || (sec === 30 && limit > 30)) { FX.play('error'); pulseTimer(); }
  else if (sec < 30) { FX.play('warn'); pulseTimer(); }
}

function startTimer() {
  clearInterval(timerId);
  const limit = jobVal('timeLimit', 0);
  state.timeLeft = limit;
  state.lastSec = null;
  document.getElementById('meter-timer')?.classList.remove('low', 'alert');
  updateTimerChip();
  if (!state.timeLeft) return;
  timerId = setInterval(() => {
    const paused = document.querySelector('#tutorial, #modal-root .modal-overlay') || state.phase !== 'planning';
    if (state.finished || paused || !document.body.classList.contains('playing')) return;
    state.timeLeft = Math.max(0, state.timeLeft - 0.25);
    updateTimerChip();
    const sec = Math.ceil(state.timeLeft);
    if (sec !== state.lastSec) { state.lastSec = sec; timerSecond(sec, limit); }
    if (state.timeLeft <= 0) failJob();
  }, 250);
}

function failJob() {
  clearInterval(timerId);
  state.finished = true;
  FX.play('error');
  const summary = { failed: true, rating: 0, reward: 0, met: 0, total: 0, employees: state.employees.length };
  const result = document.getElementById('result');
  result.innerHTML = `<div class="dialog">
    <h2>Time's Up</h2>
    <p>The time limit was exceeded.</p>
    <p>Job rating: 0 stars</p>
    <button type="button" class="squircle danger" id="fail-btn">Return to Menu</button>
  </div>`;
  result.hidden = false;
  document.getElementById('fail-btn').addEventListener('click', () => {
    if (Game.hooks.onFail) Game.hooks.onFail(summary);
    else Game.hooks.onQuit?.();
  });
}

// Plain-JSON record of an in-progress job: the job itself (with its seed), who sits where, and the clock.
function snapshotJob() {
  return {
    job: { ...state.job },
    seats: state.workstations.filter((w) => w.assignedEmployeeId !== null).map((w) => [w.assignedEmployeeId, w.id]),
    timeLeft: state.timeLeft,
    employees: state.employees.length,
    desks: state.workstations.length,
    savedAt: Date.now()
  };
}

function restoreSnapshot(snap) {
  // Seats only restore onto an identical build (same headcount and desks).
  if (snap.employees === state.employees.length && snap.desks === state.workstations.length) {
    for (const [empId, wsId] of snap.seats) {
      const ws = state.workstations[wsId];
      if (ws && state.employees[empId] && ws.assignedEmployeeId === null) ws.assignedEmployeeId = empId;
    }
  }
  if (jobVal('timeLimit', 0)) state.timeLeft = Math.min(snap.timeLeft, jobVal('timeLimit', 0));
  renderDynamic();
  renderTray();
  updateHud();
  updateTimerChip();
}

const Game = {
  hooks: {},
  start(job, hooks, snapshot) {
    Game.hooks = hooks || {};
    state.job = { ...job };
    state.job.seed = state.job.seed || Math.floor(Math.random() * 1e9) + 1;
    state.job.uid = state.job.uid || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    document.getElementById('hud-job').textContent = `${state.job.campaign ? 'Campaign' : 'Random'} - ${state.job.name}`;
    document.body.classList.add('playing');
    newGame();
    if (snapshot) restoreSnapshot(snapshot);
  },
  snapshot: snapshotJob,
  stop() {
    clearInterval(timerId);
    Exec.stop();
    state.job = null;
    document.body.classList.remove('playing');
    document.getElementById('result').hidden = true;
  }
};

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// While Assign All searches, seats are looked up in this map instead of scanning every desk.
let seatCache = null;
function seatOf(empId) {
  if (seatCache) return seatCache.get(empId) || null;
  return state.workstations.find((w) => w.assignedEmployeeId === empId) || null;
}

// ---------- Drag and drop ----------
function startDrag(e, emp, token) {
  if (state.finished || state.phase !== 'planning') return;
  e.preventDefault();
  const sx = e.clientX;
  const sy = e.clientY;
  let ghost = null;
  let hover = null;

  const move = (ev) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      FX.play('pickup');
      ghost = token.cloneNode(true);
      ghost.classList.add('ghost');
      document.body.appendChild(ghost);
    }
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
    const target = wsAt(ev.clientX, ev.clientY);
    if (hover !== target) {
      hover?.classList.remove('over');
      target?.classList.add('over');
      hover = target;
    }
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    hover?.classList.remove('over');
    if (!ghost) {
      if (ev.type === 'pointerup') { state.openEmp = state.openEmp === emp.id ? null : emp.id; renderTray(); }
      return;
    }
    ghost.remove();
    const target = wsAt(ev.clientX, ev.clientY);
    if (target && ev.type === 'pointerup') assign(emp, state.workstations[+target.dataset.ws]);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function wsAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.dataset && el.dataset.ws !== undefined ? el : null;
}

function assign(emp, ws) {
  if (state.phase !== 'planning') { toast('Seating is locked once Execute begins'); return; }
  if (ws.assignedEmployeeId !== null) { FX.play('error'); toast('Desk already taken'); return; }
  const problem = seatProblem(emp, ws);
  if (problem) { FX.play('error'); toast(problem); return; }
  const fl = floorOf(ws);
  const path = findPath(fl.navGrid, fl.layout.entrance, { x: ws.gridX, y: ws.gridY });
  if (!path.length) { FX.play('error'); toast('No path to that desk'); return; }

  FX.play('drop');
  const s = 10;
  const p = worldToClient(fl.ox + ws.gridX * s + s / 2, fl.oy + ws.gridY * s + s / 2);
  FX.burst(p.x, p.y, TEAM_COLORS[emp.dept]);
  ws.assignedEmployeeId = emp.id;
  renderDynamic();
  renderTray();
  updateHud();
}

function unseat(ws) {
  if (state.phase !== 'planning') { toast('Seating is locked once Execute begins'); return; }
  if (state.finished || ws.assignedEmployeeId === null) return;
  FX.play('pop');
  ws.assignedEmployeeId = null;
  renderDynamic();
  renderTray();
  updateHud();
}

// Tap a seated employee's desk to open their Employee Information; unassigning is a button there.
svg.addEventListener('click', (e) => {
  const el = e.target;
  if (!el.dataset || el.dataset.ws === undefined) return;
  const emp = state.employees[state.workstations[+el.dataset.ws].assignedEmployeeId];
  if (!emp) return;
  state.openDept = emp.dept;
  state.openEmp = emp.id;
  renderTray();
});

// ---------- Evaluation ----------
function preferenceMet(emp, ws) {
  const fl = floorOf(ws);
  const room = fl.layout.rooms[ws.roomId];
  if (emp.preferences === 'withTeam') {
    return room.desks.some((id) => {
      const other = state.workstations[id].assignedEmployeeId;
      return other !== null && other !== emp.id && state.employees[other].teamId === emp.teamId;
    });
  }
  if (emp.preferences === 'quietRoom') return room.desks.length <= CFG.quietRoomMaxDesks;
  const near = (x, y, dist) => Math.abs(ws.gridX - x) + Math.abs(ws.gridY - y) <= dist;
  switch (emp.preferences) {
    case 'nearWindow': return fl.layout.windows.some((w) => near(w.x, w.y, CFG.nearWindowDist));
    case 'nearBreak': return fl.layout.rooms.some((r) => ['break', 'lounge', 'cafe'].includes(r.type) && near(r.x + r.w / 2, r.y + r.h / 2, CFG.nearBreakDist));
    case 'openPlan': return ws.kind === 'open';
    case 'groundFloor': return fl.f === 0;
    case 'topFloor': return fl.f === Math.max(...state.floors.filter((x) => x.b === fl.b).map((x) => x.f));
    case 'withDept': return state.workstations.some((o) => o.assignedEmployeeId !== null && o.assignedEmployeeId !== emp.id
      && state.employees[o.assignedEmployeeId].dept === emp.dept && state.floors[o.floor].b === fl.b);
    default: break;
  }
  const ent = fl.layout.entrance;
  return near(ent.x, ent.y, CFG.nearEntranceDist);
}

function evaluate() {
  let met = 0;
  const total = state.employees.length; // anyone left unseated counts as unsatisfied
  for (const emp of state.employees) {
    const ws = seatOf(emp.id);
    if (ws && preferenceMet(emp, ws)) met++;
  }
  const rating = calculateJobRating(met, total);
  const pay = jobRewards(state.job);
  const limit = jobVal('timeLimit', 0);
  const fast = limit > 0 && state.timeLeft >= limit * (1 - pay.fastShare);
  const satHit = total > 0 && met / total >= Perks.satGoal(state.job);
  const fastBonus = fast ? pay.fastBonus : 0;
  const satBonus = satHit ? pay.satBonus : 0;
  const gross = pay.total(fast, satHit);
  return {
    met, total, rating, base: pay.completion, extras: pay.subtotal - pay.completion, timed: limit > 0, fast, fastBonus, satHit, satBonus,
    doubled: gross - pay.total(fast, satHit) / pay.factor, damage: state.damage, broken: state.broken,
    reward: Math.max(0, gross - state.damage), employees: state.employees.length
  };
}

// Execute button: confirm the Planning results, then run the Execute and Feedback stages.
async function requestExecute() {
  if (state.phase !== 'planning' || state.finished) return;
  const unmet = state.employees.filter((e) => needsSpecialSeat(e) && (!seatOf(e.id) || seatProblem(e, seatOf(e.id)) || !requirementStatus(e).every((r) => r.met)));
  if (unmet.length) {
    FX.play('error');
    const names = unmet.slice(0, 5).map((e) => e.fullName).join(', ');
    toast(`Resolve seating requirements first: ${names}${unmet.length > 5 ? ` and ${unmet.length - 5} more` : ''}`);
    return;
  }
  const go = await confirmExecute(evaluate());
  if (!go || state.phase !== 'planning' || state.finished) return;
  FX.play('click');
  Exec.begin();
}

// Results button once Feedback is done.
function completeJob() {
  if (state.phase !== 'done' || state.finished) return;
  const result = document.getElementById('result');
  const summary = evaluate();
  const { met, total, rating, reward } = summary;

  state.finished = true;
  clearInterval(timerId);
  Exec.hideSummary();
  FX.play('win');
  if (Game.hooks.onFinish) { Game.hooks.onFinish(summary); return; }
  result.innerHTML = `<div class="dialog">
    <h2>Job Complete</h2>
    <div class="stars">${'⭐'.repeat(Math.round(rating))}</div>
    <p>${rating.toFixed(1)} / 5.0</p>
    <p>Preferences met: ${met} / ${total}</p>
    <p style="color:#16a34a">Reward: +$${reward}</p>
    <button type="button" class="squircle primary" id="again-btn">Collect</button>
  </div>`;
  result.hidden = false;
  document.getElementById('again-btn').addEventListener('click', () => {
    if (Game.hooks.onFinish) Game.hooks.onFinish(summary);
    else newGame();
  });
}

function zoomCenter(factor) {
  const r = svg.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}

document.getElementById('zoom-in').addEventListener('click', () => zoomCenter(0.8));
document.getElementById('zoom-out').addEventListener('click', () => zoomCenter(1.25));
document.getElementById('mute-btn').addEventListener('click', () => Settings.set('sfx', FX.cfg.muted));

Dev.action('Assign All', assignAll);
Dev.action('Preview Score', () => {
  const r = evaluate();
  toast(`Rating ${r.rating.toFixed(1)} | prefs ${r.met}/${r.total} | fast ${r.fast ? 'yes' : 'no'} | reward $${r.reward}`);
});

document.getElementById('finish-btn').addEventListener('click', () => (state.phase === 'done' ? completeJob() : requestExecute()));
document.getElementById('speed-btn').addEventListener('click', () => Exec.cycleSpeed());
newGame();
