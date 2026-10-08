/** Upgrades, unlock effects and contract riders. All perk math lives here; the game reads it through `Perks`.
 *  Upgrades are bought with money (levels 1-10, so up to 9 purchases); hires, clients, riders and branding unlock with campaign missions. */
const MAX_UPGRADE_LEVEL = 10;

// Each upgrade's effect grows linearly: level 1 gives nothing and level 10 gives `max`. n = levels bought.
const upgradeAt = (max, n) => +((max * n) / (MAX_UPGRADE_LEVEL - 1)).toFixed(1);

const UPGRADES = [
  { key: 'headcount', icon: '👥', name: 'Headcount', base: 1000, max: 10, desc: 'A bigger planning team finishes sooner.', mod: `+${upgradeAt(10, 1)}% Fast Planning window`, now: (n) => `+${upgradeAt(10, n)}% Fast Planning window` },
  { key: 'speed', icon: '⚡', name: 'Speed', base: 400, max: 50, desc: 'Movers walk and work faster.', mod: `+${upgradeAt(50, 1)}% Mover speed`, now: (n) => `+${upgradeAt(50, n)}% Mover speed` },
  { key: 'capacity', icon: '📦', name: 'Capacity', base: 600, max: 50, desc: 'Bigger loads, bigger invoices.', mod: `+${upgradeAt(50, 1)}% job payout`, now: (n) => `+${upgradeAt(50, n)}% job payout` },
  { key: 'safety', icon: '🦺', name: 'Safety', base: 500, max: 100, desc: 'Fewer smashed goods.', mod: `Fragile Goods breakage -${upgradeAt(100, 1)}%`, now: (n) => `Fragile Goods breakage -${upgradeAt(100, n)}%` },
  { key: 'diligence', icon: '🧐', name: 'Diligence', base: 900, max: 25, desc: 'Sharper seating instincts.', mod: `Satisfaction goal -${upgradeAt(25, 1)}%`, now: (n) => `Satisfaction goal -${upgradeAt(25, n)}%` }
];
const upgradeCost = (u, level) => u.base * level;

// Item i of each list unlocks when campaign mission i is first completed.
// Specialty Hires: [icon, name, perk, cost as a share of the job's reward subtotal]. Hire number N is unlocked by campaign mission N,
// but each one is bought per job (see jobRewards) and is spent on that job only.
const HIRES = [
  ['⚡', 'Speed Demon', 'Movers are 20% faster, and Rainstorm’s retrieval slowdown is halved.', 0.05],
  ['🏋️', 'Heavy Lifter', 'Furniture deploys 40% faster, and Narrow Doors costs only 1.5x.', 0.04],
  ['🛡️', 'Careful Carl', 'Bonus rewards +10%, and Fragile Goods break 40% less.', 0.06],
  ['🧹', 'Clean Freak', 'Plants and computers deploy 50% faster, and Cleaning takes only 2.5s per desk.', 0.04],
  ['🥷', 'Ninja Mover', 'Movers walk 33% faster.', 0.06],
  ['🤖', 'Robo-Loader', 'Every deploy takes 15% less time, and +2 Movers per floor.', 0.08],
  ['🧗', 'Stair Master', 'Movers climb stairs instantly, even with No Elevators.', 0.04],
  ['🦸', 'The Hero', '+5% Fast Planning window, and Rush Job cuts the Time Limit to 60% instead of 50%.', 0.07]
];
const HIRE_MIN_COST = 50;
const hireCost = (i, subtotal) => Math.max(HIRE_MIN_COST, Math.round(subtotal * HIRES[i][3]));

// Optional riders on Random Jobs: each makes the contract harder and pays more.
const MODIFIERS = [
  { id: 'noElevators', icon: '🪜', name: 'No Elevators', desc: 'Movers and employees must take the stairs, adding 6s per floor above ground each way.' },
  { id: 'fragile', icon: '🍷', name: 'Fragile Goods', desc: 'Objects can break and must be replaced; every breakage is deducted from the payout.' },
  { id: 'rush', icon: '⏳', name: 'Rush Job', desc: 'Time limit cut in half.' },
  { id: 'flooring', icon: '🧱', name: 'Protective Flooring', desc: 'Movers deploy protective flooring before carrying objects to their assigned desks.' },
  { id: 'rain', icon: '🌧️', name: 'Rainstorm', desc: 'Retrieving each object from the truck takes 25% longer (15s base).' },
  { id: 'narrow', icon: '🚪', name: 'Narrow Doors', desc: 'Furniture takes 2x time to deploy.' },
  { id: 'angry', icon: '😡', name: 'Angry Boss', desc: 'Satisfaction goal +10%.' },
  { id: 'cleaning', icon: '🧽', name: 'Cleaning', desc: 'After unpacking, Movers clean each desk and vacuum the floor on the way out.' }
];

// Fragile Goods: chance a delivered object breaks, and its cost as a share of one employee's reward.
const BREAK_CHANCE = { plant: 0.18, box: 0.12, computer: 0.28, furniture: 0.15 };
const DAMAGE_SHARE = { plant: 0.2, box: 0.15, computer: 0.5, furniture: 0.4 };

const RIDER_COUNTERS = {
  noElevators: 'Stair Master', fragile: 'Safety upgrade, Careful Carl', rush: 'The Hero', flooring: 'TBD',
  rain: 'Speed upgrade, Speed Demon', narrow: 'Heavy Lifter', angry: 'Diligence upgrade', cleaning: 'Clean Freak'
};

const MODIFIER_PAY = 0.1; // each modifier raises the job's payout by this much
const FIRST_CLEAR_BONUS = 0.5; // extra payout the first time a campaign mission is completed
const clientRoomCount = (client) => Object.values(client.rooms).reduce((a, b) => a + b, 0);

const Perks = (() => {
  const lvl = (k) => Save.perkLevel(k);
  const full = (k) => lvl(k) / (MAX_UPGRADE_LEVEL - 1); // 0 at level 1, 1 at level 10
  const hire = (i, job = state.job) => !!job?.hires?.includes(i);
  const mod = (id, job = state.job) => !!job?.mods?.includes(id);
  const owned = (cat) => [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => Save.isUnlocked(cat, i)).length;

  return {
    // Share of the Time Limit within which planning counts as fast.
    fastShare: (job) => 0.75 + 0.1 * full('headcount') + (hire(7, job) ? 0.05 : 0),
    speedMult: () => (1 + 0.5 * full('speed')) * (hire(0) ? 1.2 : 1),
    payMult: () => (1 + 0.5 * full('capacity')) * (1 + 0.01 * Math.max(0, owned('uniforms') - 1)),
    // Satisfaction needed for the bonus: the job's goal, raised by Angry Boss and lowered by Diligence.
    satGoal: (job) => Math.min(1, Math.max(0.1, (job?.satGoal ?? 0.6) + (mod('angry', job) ? 0.1 : 0) - 0.25 * full('diligence'))),
    bonusMult: (job) => 1 + (hire(2, job) ? 0.1 : 0),
    walkMult: () => (hire(4) ? 0.75 : 1),
    // Movers use the stairs when No Elevators is on; otherwise the service elevator (or loading dock on the ground floor).
    stairsOnly: () => mod('noElevators'),
    // Movers (and employees) climbing stairs with No Elevators: seconds per floor, each way.
    stairSecs: () => (mod('noElevators') && !hire(6) ? 6 : 0),
    // Protective Flooring: time Movers spend on every tile going out. Cleaning: vacuuming time per tile coming back.
    flooringSecs: () => (mod('flooring') ? 0.1 : 0),
    vacuumSecs: () => (mod('cleaning') ? 0.1 : 0),
    // Seconds spent cleaning the desk after each delivery.
    cleanSecs: () => (mod('cleaning') ? (hire(3) ? 2.5 : 5) : 0),
    // Seconds a Mover spends at the truck picking up the next object; Rainstorm makes it 25% longer.
    retrieveSecs: () => (CFG.retrieveSecs * (mod('rain') ? (hire(0) ? 1.125 : 1.25) : 1)) / Perks.speedMult(),
    crewBonus: () => (hire(5) ? 2 : 0) + Math.floor(owned('vehicles') / 2),
    breakChance: (type) => (mod('fragile') ? BREAK_CHANCE[type] * (1 - full('safety')) * (hire(2) ? 0.6 : 1) : 0),
    damageCost: (type) => Math.round(CFG.rewardPerEmployee * DAMAGE_SHARE[type] * jobVal('rewardMult', 1)),
    // Seconds a Mover spends placing one object of this type.
    deploySecs(type) {
      let m = hire(5) ? 0.85 : 1;
      if (type === 'furniture') m *= (hire(1) ? 0.6 : 1) * (mod('narrow') ? (hire(1) ? 1.5 : 2) : 1);
      if ((type === 'plant' || type === 'computer') && hire(3)) m *= 0.5;
      return OBJECT_TYPES[type].secs * m;
    }
  };
})();

// Itemized payout. Completion is fixed per employee; the difficulty multiplier, each modifier and the company bonus are added on top.
// Fast Planning and Satisfaction bonuses are a share of that subtotal, and Enable All doubles everything.
function jobRewards(job) {
  const completion = job.employees * CFG.rewardPerEmployee;
  const mult = job.base?.rewardMult ?? job.rewardMult ?? 1;
  const difficulty = Math.round(completion * (mult - 1));
  const mods = (job.mods || []).map((id) => MODIFIERS.find((m) => m.id === id)).filter(Boolean)
    .map((m) => ({ id: m.id, icon: m.icon, name: m.name, amount: Math.round(completion * MODIFIER_PAY) }));
  const company = Math.round(completion * (Perks.payMult() - 1));
  const subtotal = completion + difficulty + mods.reduce((t, m) => t + m.amount, 0) + company;
  const bonus = Math.round(subtotal * (CFG.bonusShare / 100) * Perks.bonusMult(job));
  const fastBonus = job.timeLimit ? bonus : 0;
  const factor = job.allMods ? 2 : 1;
  const gross = (earnedFast = true, earnedSat = true) => (subtotal + (earnedFast ? fastBonus : 0) + (earnedSat ? bonus : 0)) * factor;
  // Specialty Hires are paid for out of the payout once the job is done, so a failed or aborted job costs nothing.
  const hires = (job.hires || []).filter((i) => HIRES[i]).map((i) => ({ id: i, icon: HIRES[i][0], name: HIRES[i][1], amount: hireCost(i, subtotal) }));
  const hireTotal = hires.reduce((t, x) => t + x.amount, 0);
  const total = (earnedFast = true, earnedSat = true) => gross(earnedFast, earnedSat) - hireTotal;
  return { completion, mult, difficulty, mods, company, subtotal, fastBonus, satBonus: bonus, fastShare: Perks.fastShare(job), factor, hires, hireTotal, gross, total };
}

// A job with the chosen modifiers applied to its time limit. hires defaults to the job's own.
function applyMods(job, ids, hires = job.hires || []) {
  const base = job.base || { timeLimit: job.timeLimit, rewardMult: job.rewardMult };
  let time = base.timeLimit;
  if (ids.includes('rush')) time = Math.round(((time || job.employees * SECONDS_PER_EMPLOYEE * 2) * (hires.includes(7) ? 0.6 : 0.5)) / 10) * 10;
  return { ...job, base, mods: ids, timeLimit: time };
}

// Mission N (after the first) carries every modifier that missions 1 to N-1 unlocked, so the Grand Finale runs them all.
CAMPAIGN.forEach((j, i) => { j.modIds = MODIFIERS.slice(0, i).map((m) => m.id); });
