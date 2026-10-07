/**
 * Multi-building, multi-floor jobs. A job can name its sites explicitly
 *   sites: [{ name: 'Factory', floors: 2, specials: { workshop: 2 }, weight: 1 }]
 * or give buildings / floors counts; otherwise the headcount decides (about FLOOR_CAPACITY people per floor).
 */
const FLOOR_CAPACITY = 16;
const MAX_BUILDINGS = 6;
const MAX_FLOORS = 4;
const buildingLetter = (i) => String.fromCharCode(65 + i);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

// Largest-remainder split of `total` across `weights`.
function distribute(total, weights) {
  const sum = weights.reduce((a, w) => a + w, 0) || 1;
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, n) => a + n, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return out;
}

// Buildings, floors, seats and industry rooms per floor.
function planCampus(job, wanted) {
  let sites;
  if (job && Array.isArray(job.sites) && job.sites.length) {
    sites = job.sites.slice(0, MAX_BUILDINGS).map((s, i) => ({
      name: s.name || `Building ${buildingLetter(i)}`, floors: clampInt(s.floors || 1, 1, MAX_FLOORS), specials: s.specials || null, weight: s.weight || 1
    }));
  } else {
    let nb = job && job.buildings;
    const nf = job && job.floors;
    const total = nb && nf ? nb * nf : Math.max(1, Math.ceil(wanted / FLOOR_CAPACITY));
    if (!nb) nb = nf ? Math.ceil(total / nf) : Math.ceil(total / 3);
    nb = clampInt(nb, 1, MAX_BUILDINGS);
    const perBuilding = nf ? new Array(nb).fill(clampInt(nf, 1, MAX_FLOORS)) : distribute(Math.min(total, nb * MAX_FLOORS), new Array(nb).fill(1));
    sites = perBuilding.map((n, i) => ({ name: `Building ${buildingLetter(i)}`, floors: Math.max(1, n), specials: null, weight: 1 }));
  }
  // Never plan more floors than there are people to fill them.
  let over = sites.reduce((a, s) => a + s.floors, 0) - Math.max(1, wanted);
  for (let i = sites.length - 1; over > 0 && i >= 0; i--) {
    const cut = Math.min(over, sites[i].floors - (i === 0 ? 1 : 0));
    sites[i].floors -= cut;
    over -= cut;
  }
  const kept = sites.filter((s) => s.floors > 0);

  const floors = [];
  kept.forEach((s, b) => { for (let f = 0; f < s.floors; f++) floors.push({ b, f, name: `Floor ${f + 1}`, bName: s.name, specials: {} }); });
  const seats = distribute(wanted, floors.map((fl) => kept[fl.b].weight));
  floors.forEach((fl, i) => { fl.seats = seats[i]; });

  // Industry rooms: a site's own list goes round-robin over its floors; a job-wide list goes round-robin over every floor.
  const give = (fl, type) => { fl.specials[type] = (fl.specials[type] || 0) + 1; };
  if (kept.some((s) => s.specials)) {
    kept.forEach((s, b) => {
      const mine = floors.filter((fl) => fl.b === b);
      let n = 0;
      for (const [type, count] of Object.entries(s.specials || {})) for (let k = 0; k < count; k++) give(mine[n++ % mine.length], type);
    });
  } else {
    let n = 0;
    for (const [type, count] of Object.entries(jobSpecials(job))) for (let k = 0; k < count; k++) give(floors[n++ % floors.length], type);
  }
  return { sites: kept, floors };
}

// Footprint (cells) for a floor with this many seats: the standard plate, or ~75 cells per seat when that is bigger.
// generateFit grows it from here until every room fits.
function footprintFor(seats, [baseW, baseH]) {
  const area = Math.max(baseW * baseH, seats * 75);
  const w = Math.max(baseW, Math.round(Math.sqrt(area * 1.6)));
  return [w, Math.max(baseH, Math.round(area / w))];
}

/**
 * Generates every floor. Each building's most demanding floor is fitted first and its footprint and shell are
 * reused for its other floors. o: { maxW, maxH, minSize, maxSize, seed, offices, phones, cafes, reception }.
 */
function buildCampus(plan, o) {
  const weights = plan.floors.map((fl) => fl.seats);
  const offices = distribute(o.offices, weights);
  const phones = distribute(o.phones, weights);
  const cafes = plan.floors.map(() => 0);
  const groundFirst = plan.floors.map((_, i) => i).sort((a, b) => plan.floors[a].f - plan.floors[b].f || a - b);
  for (let k = 0; k < o.cafes; k++) cafes[groundFirst[k % groundFirst.length]]++;

  const demand = (fl) => fl.seats + 6 * Object.values(fl.specials).reduce((a, n) => a + n, 0);
  const order = plan.floors.map((_, i) => i).sort((a, b) => demand(plan.floors[b]) - demand(plan.floors[a]) || a - b);
  const fitted = {};
  const out = new Array(plan.floors.length);
  for (const i of order) {
    const fl = plan.floors[i];
    const shared = fitted[fl.b];
    const [fitW, fitH] = footprintFor(fl.seats, [o.maxW, o.maxH]);
    const layout = BSPNode.generateFit(fitW, fitH, {
      minSize: o.minSize, maxSize: o.maxSize, seats: fl.seats, offices: offices[i], phones: phones[i], cafes: cafes[i], lounges: o.lounges || 0,
      reception: o.reception && fl.b === 0 && fl.f === 0, specials: fl.specials, upper: fl.f > 0,
      tall: plan.floors.some((x) => x.b === fl.b && x.f > 0),
      seed: o.seed + i * 104729, shellSeed: o.seed + fl.b * 65537 + 17,
      ...(shared ? { size: shared.size, plain: shared.plain, tries: fl.seats > 20 ? 8 : 4 } : {})
    });
    if (!shared) fitted[fl.b] = { size: [layout.width, layout.height], plain: layout.plain };
    out[i] = { ...fl, layout };
  }
  return out;
}
