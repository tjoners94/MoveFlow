/** Constraints are generated against a guaranteed solution. After the floor plan exists, a witness seating puts every
 *  employee on a desk (teams and departments packed together); each optional requirement and preference is then chosen
 *  only among those the employee's witness desk satisfies. So every job can be solved with every requirement met and
 *  every preference satisfied, and "Assign All" just applies the witness.
 *  Loaded before app.js; reads app.js globals when called. */

// Seats the whole roster: hard roles first (reception, industry rooms, offices), then everyone else packed by
// department and team into open desks, so managers and teammates end up adjacent.
function buildWitness() {
  const emps = state.employees;
  const wsAll = state.workstations;
  const seat = new Map();
  const taken = new Set();
  const floorKey = (ws) => { const fl = floorOf(ws); return fl.b * 100 + fl.f; };
  const desksOf = (kind) => wsAll.filter((w) => w.kind === kind).sort((a, b) => floorKey(a) - floorKey(b) || a.id - b.id);
  const put = (e, ws) => { seat.set(e.id, ws); taken.add(ws.id); };
  const firstFree = (list) => list.find((w) => !taken.has(w.id)) || null;
  const rankIdx = (e) => Object.keys(RANKS).indexOf(e.rank);

  const reception = desksOf('reception');
  emps.filter((e) => e.receptionist).forEach((e) => { const ws = firstFree(reception); if (ws) put(e, ws); });
  const special = {};
  emps.filter((e) => e.roomReq).forEach((e) => { const ws = firstFree(special[e.roomReq] || (special[e.roomReq] = desksOf(e.roomReq))); if (ws) put(e, ws); });
  const offices = desksOf('office');
  emps.filter((e) => e.officeRequired).sort((a, b) => rankIdx(a) - rankIdx(b) || a.id - b.id).forEach((e) => { const ws = firstFree(offices); if (ws) put(e, ws); });

  const deptOrder = Object.keys(DEPTS);
  const rest = emps.filter((e) => !seat.has(e.id))
    .sort((a, b) => deptOrder.indexOf(a.dept) - deptOrder.indexOf(b.dept) || a.team.localeCompare(b.team) || rankIdx(a) - rankIdx(b) || a.id - b.id);
  const open = desksOf('open');
  for (const e of rest) {
    const ws = firstFree(open) || firstFree(offices);
    if (ws) put(e, ws);
  }
  return seat;
}

// Picks every optional requirement and each employee's preference from what the witness seat already satisfies.
function deriveConstraints(seat, ctx) {
  const emps = state.employees;
  state.workstations.forEach((w) => { w.assignedEmployeeId = null; });
  seat.forEach((ws, id) => { ws.assignedEmployeeId = id; });
  seatCache = seat;

  const used = new Set();
  const plain = (e) => e.rank === 'staff' && !e.receptionist && !e.roomReq && !e.officeRequired && !used.has(e.id) && seat.has(e.id);
  const claim = (e, flag) => { e[flag] = true; used.add(e.id); };

  if (ctx.hasPhone) {
    const near = shuffle(emps.filter((e) => plain(e) && nearPhoneRoom(seat.get(e.id))));
    const favoured = near.filter((e) => ['support', 'sales', 'it'].includes(e.dept));
    [...favoured, ...near.filter((e) => !favoured.includes(e))].slice(0, ctx.nearPhoneWanted).forEach((e) => claim(e, 'nearPhone'));
  }

  // Up to two reports per team manager sit beside them (never a manager in a private office).
  for (const m of emps) {
    if (m.rank !== 'mgr' || m.officeRequired || !seat.has(m.id)) continue;
    const reports = emps.filter((e) => e.managerId === m.id && plain(e));
    const take = reports.length ? Math.min(2, Math.max(1, Math.floor(reports.length / 2))) : 0;
    shuffle(reports.filter((e) => seatsAdjacent(seat.get(e.id), seat.get(m.id)))).slice(0, take).forEach((e) => claim(e, 'nearManager'));
  }

  if (ctx.tallBuilding) {
    const sameFloor = emps.filter((e) => plain(e) && e.managerId !== null && seat.has(e.managerId) && seat.get(e.id).floor === seat.get(e.managerId).floor);
    shuffle(sameFloor).slice(0, Math.max(1, Math.round(ctx.count * 0.06))).forEach((e) => claim(e, 'sameFloorMgr'));
    shuffle(emps.filter((e) => plain(e) && floorOf(seat.get(e.id)).f === 0)).slice(0, Math.max(1, Math.round(ctx.count / 60))).forEach((e) => claim(e, 'groundFloor'));
  }

  if (ctx.buildingCount > 1) {
    const leaders = shuffle(emps.filter((e) => ['mgr', 'dir', 'vp'].includes(e.rank) && e.managerId !== null && !e.receptionist && !e.roomReq
      && seat.has(e.id) && seat.has(e.managerId) && floorOf(seat.get(e.id)).b === floorOf(seat.get(e.managerId)).b));
    leaders.slice(0, Math.ceil(leaders.length * 0.4)).forEach((e) => { e.sameBuildingBoss = true; });
  }

  const withMate = emps.filter((e) => plain(e) && emps.some((o) => o.id !== e.id && o.teamId === e.teamId && seat.has(o.id) && seatsAdjacent(seat.get(e.id), seat.get(o.id))));
  shuffle(withMate).slice(0, ctx.count >= 6 ? Math.floor(ctx.count / 5) : 0).forEach((e) => claim(e, 'nearTeammate'));

  // Preferences: department weights, limited to what this employee's witness desk satisfies.
  const prefKeys = Object.keys(PREF_LABELS).filter((p) => ctx.available.has(p));
  for (const e of emps) {
    const ws = seat.get(e.id);
    if (!ws) { e.preferences = pickPreference(e.dept, ctx.available); continue; }
    const ok = prefKeys.filter((p) => { e.preferences = p; return preferenceMet(e, ws); });
    const weights = { ...DEFAULT_PREFS, ...(DEPTS[e.dept].prefs || {}) };
    const weighted = ok.filter((p) => (weights[p] || 0) > 0);
    const pool = weighted.length ? weighted : ok;
    let pick = e.receptionist && ok.includes('nearEntrance') ? 'nearEntrance' : null;
    if (!pick && pool.length) {
      let roll = Math.random() * pool.reduce((a, p) => a + (weights[p] || 1), 0);
      pick = pool.find((p) => (roll -= (weights[p] || 1)) <= 0) || pool[pool.length - 1];
    }
    e.preferences = pick || 'openPlan';
  }

  state.workstations.forEach((w) => { w.assignedEmployeeId = null; });
  seatCache = null;
  state.witness = [...seat].map(([id, ws]) => [id, ws.id]);
}
