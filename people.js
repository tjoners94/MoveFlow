/** People: departments, teams, ranks, roles, descriptions and preferences, plus the org-chart planner. */
const FIRST_NAMES = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivy', 'Jon', 'Kai', 'Lia', 'Max', 'Nia', 'Omar', 'Pia', 'Quinn', 'Raj', 'Sam', 'Tess',
  'Uma', 'Vik', 'Wren', 'Xavi', 'Yuki', 'Zane', 'Abel', 'Bea', 'Cal', 'Dara', 'Eden', 'Finn', 'Gia', 'Hugo', 'Isla', 'Jude', 'Kira', 'Leo', 'Mina', 'Noel',
  'Orla', 'Pax', 'Rhea', 'Sol', 'Tavi', 'Una', 'Vera', 'Wade', 'Yara', 'Zoe', 'Arlo', 'Bram', 'Cora', 'Dex', 'Elio', 'Faye', 'Gwen', 'Hal', 'Iris', 'Joss', 'Kemi', 'Lars', 'Mara', 'Nico'];
const LAST_NAMES = ['Abbott', 'Brooks', 'Chen', 'Duarte', 'Ellis', 'Fischer', 'Gupta', 'Hayes', 'Ito', 'Jensen', 'Khan', 'Lopez', 'Moreau', 'Novak', 'Okafor', 'Patel', 'Quigley', 'Rossi', 'Singh', 'Torres',
  'Underhill', 'Vance', 'Walsh', 'Xu', 'Yamada', 'Zhou', 'Adeyemi', 'Baptiste', 'Castillo', 'Dahl', 'Eriksen', 'Faraday', 'Gallo', 'Haddad', 'Ibarra', 'Jovanovic', 'Kowalski', 'Lindqvist', 'Mbeki', 'Nakamura',
  'Ortega', 'Petrov', 'Quintero', 'Reyes', 'Sato', 'Tanaka', 'Ueda', 'Valdez', 'Whitaker', 'Yilmaz', 'Zielinski', 'Ashby', 'Bianchi', 'Coleman', 'Delgado', 'Everett', 'Flores', 'Grant', 'Holloway', 'Iyer', 'Kaplan', 'Larsen', 'Mercer', 'Nolan'];

const RECEPTION_ROLE = ['Receptionist', 'Greets every visitor like a long-lost friend and every package like a bomb threat.'];

const QUIRKS = [
  'Eats lunch at 10:45 sharp.', 'Keeps a spare tie in the desk drawer.', 'Has named every houseplant on the floor.', 'Hums in the elevator, off-key.',
  'Owns a standing desk and sits at it.', 'Always has one more tab open.', 'Brings banana bread on Fridays.', 'Swears the thermostat is out to get them.',
  'Collects hotel pens.', 'Cannot start the day without one very specific mug.', 'Keeps a laminated to-do list.', 'Speaks fluent acronym.',
  'Is on a first-name basis with the vending machine.', 'Keeps snacks "for emergencies".', 'Has strong feelings about reply-all.', 'Wears headphones as a force field.',
  'Can find any meeting room in under a minute.', 'Rehearses every presentation in the car.', 'Has never once been late, nor early.', 'Answers email in the shower, allegedly.',
  'Brings a plant to every new desk.', 'Quotes movies in stand-ups.', 'Takes the stairs and wants you to know.', 'Claims to have invented the office jargon "circle back".',
  'Microwaves fish on purpose.', 'Has a very loud keyboard and no remorse.', 'Pronounces "GIF" confidently and wrongly.', 'Is always cold; carries a blanket.'
];

// Ranks, top to bottom. Leaders have reports; colour is the ring drawn around their token.
const RANKS = {
  exec: { label: 'Executive', ring: '#f59e0b', leader: true },
  pres: { label: 'President', ring: '#e11d48', leader: true },
  vp: { label: 'Vice President', ring: '#7c3aed', leader: true },
  dir: { label: 'Director', ring: '#2563eb', leader: true },
  mgr: { label: 'Manager', ring: '#1e293b', leader: true },
  staff: { label: 'Staff', ring: null, leader: false }
};

const EXEC_ORDER = ['ceo', 'coo', 'cfo', 'cto', 'cmo'];
const EXEC_ROLES = {
  ceo: ['Chief Executive Officer', 'Delegates vision. Retains the good parking spot.'],
  coo: ['Chief Operating Officer', 'Runs the company by running everyone else\u2019s meetings.'],
  cfo: ['Chief Financial Officer', 'Knows where every dollar went and exactly who spent it.'],
  cto: ['Chief Technology Officer', 'Has strong opinions about frameworks that do not exist yet.'],
  cmo: ['Chief Marketing Officer', 'Believes any problem can be solved with a rebrand.']
};
const PRESIDENT_DIVISIONS = ['Americas', 'EMEA', 'Asia-Pacific', 'Enterprise', 'Consumer'];
const PRESIDENT_FLAVOR = [
  'Presides over a division that is, officially, doing great.',
  'Holds quarterly town halls and a lifetime supply of lanyards.',
  'Has a corner office and a corner of every spreadsheet.'
];

const PREF_LABELS = {
  withTeam: 'Prefers to sit with their team',
  quietRoom: 'Prefers a quiet room (few desks)',
  nearEntrance: 'Prefers a desk near the entrance',
  nearWindow: 'Prefers a desk by a window',
  nearBreak: 'Prefers to be near a break room, lounge or cafe',
  openPlan: 'Prefers open seating over a closed room',
  groundFloor: 'Prefers the ground floor',
  topFloor: 'Prefers the top floor of their building',
  withDept: 'Prefers to share a building with their department'
};
const DEFAULT_PREFS = { withTeam: 3, quietRoom: 2, nearEntrance: 1, nearWindow: 2, nearBreak: 2, openPlan: 2, groundFloor: 1, topFloor: 1, withDept: 1 };

// weight: relative headcount; execs: which C-level each department's head reports to; prefs: preference weights.
const DEPTS = {
  exec: { label: 'Executive Office', color: '#334155', weight: 0, teams: ['Office of the CEO', 'Divisions'], staff: [], mgr: [], dir: [], vp: [], execs: [], prefs: { quietRoom: 5, nearWindow: 5, openPlan: 0, nearEntrance: 0 } },
  sales: { label: 'Sales', color: '#ef4444', weight: 14, execs: ['cmo', 'coo'], prefs: { openPlan: 4, nearEntrance: 3, withTeam: 4, quietRoom: 0 },
    teams: ['Enterprise', 'Mid-Market', 'Inside Sales', 'Channel Partners', 'Sales Ops', 'Renewals'],
    staff: [['Account Executive', 'Remembers every client\u2019s dog\u2019s name but not a single renewal date.'], ['Sales Development Rep', 'Sends 200 emails a day and believes in every one.'], ['Solutions Consultant', 'Has promised the client three features that do not exist and a fourth that cannot.'], ['Customer Success Rep', 'Calls it a "check-in". The client calls it Tuesday.'], ['Deal Desk Analyst', 'Turns "no" into a discount tier.'], ['Partnerships Lead', 'Has shaken every hand in three time zones.'], ['Sales Enablement Specialist', 'Makes slide decks to explain the other slide decks.']],
    mgr: [['Sales Manager', 'Motivates the team with whiteboard sketches of hockey-stick graphs.'], ['Regional Sales Manager', 'Has a quota, a vision, and a surprisingly large collection of lanyards.']],
    dir: [['Director of Sales', 'Believes every deal is "basically closed". None of them are.']],
    vp: [['VP of Sales', 'Rings a gong. Nobody remembers who bought it.']] },
  mkt: { label: 'Marketing', color: '#ec4899', weight: 8, execs: ['cmo'], prefs: { nearWindow: 4, nearBreak: 3, withTeam: 3 },
    teams: ['Brand', 'Content', 'Demand Gen', 'Events', 'Social', 'Product Marketing'],
    staff: [['Content Strategist', 'Writes the headline first and the article never.'], ['Social Media Specialist', 'Fluent in memes. Terrified of the comments.'], ['Brand Designer', 'Can tell #FF5733 from #FF5734 across a room.'], ['Events Coordinator', 'Owns 400 lanyards and a spreadsheet for each.'], ['SEO Analyst', 'Whispers keywords to the algorithm at night.'], ['Campaign Manager', 'Has launched everything and the kitchen sink.'], ['Product Marketer', 'Translates engineer into customer and back, badly.']],
    mgr: [['Marketing Manager', 'Approves the logo by moving it two pixels.'], ['Brand Manager', 'Guardian of the one true shade of blue.']],
    dir: [['Director of Marketing', 'Measures success in impressions, vibes, and impressions of vibes.']],
    vp: [['VP of Marketing', 'Has a bold new vision for the previous bold new vision.']] },
  dev: { label: 'Engineering', color: '#3b82f6', weight: 18, execs: ['cto'], prefs: { quietRoom: 5, nearWindow: 3, openPlan: 1, nearEntrance: 0 },
    teams: ['Platform', 'Frontend', 'Mobile', 'Backend', 'QA', 'DevOps', 'Data'],
    staff: [['Software Engineer', 'Their best code was written by an anonymous stranger in 2013.'], ['Frontend Developer', 'Has opinions about border-radius that cannot be repeated here.'], ['Backend Developer', 'Has never met a database index they did not respect.'], ['QA Engineer', 'Finds the bug you swore was a feature.'], ['DevOps Engineer', 'Wakes at 3am when the pager does.'], ['Mobile Developer', 'Tests on seventeen phones and trusts none.'], ['Data Engineer', 'Keeps the pipelines flowing and the dashboards fibbing.']],
    mgr: [['Engineering Manager', 'Schedules a meeting to discuss why there are too many meetings.'], ['Tech Lead Manager', 'Reviews pull requests with the sigh of a poet.']],
    dir: [['Director of Engineering', 'Still insists the roadmap is "directional".']],
    vp: [['VP of Engineering', 'Collects technical debt. Pays none of it.']] },
  prod: { label: 'Product & Design', color: '#8b5cf6', weight: 9, execs: ['cto', 'cmo'], prefs: { nearWindow: 4, quietRoom: 3, withTeam: 3 },
    teams: ['Core Product', 'Growth', 'Design Systems', 'UX Research', 'Platform Product'],
    staff: [['Product Manager', 'Writes the spec, rewrites the spec, specs the rewrite.'], ['UX Designer', 'Moves the button 2px and calls it a redesign.'], ['UI Designer', 'Has 400 shades of grey and a favourite.'], ['UX Researcher', 'Interviewed five users and found six opinions.'], ['Product Analyst', 'Can prove anything with a funnel chart.'], ['Technical Writer', 'Documents the feature the day after it ships.'], ['Design Ops Specialist', 'Keeps the design files from becoming folklore.']],
    mgr: [['Group Product Manager', 'Prioritises everything as "P0, but also P1".'], ['Design Manager', 'Critiques by asking "what are we feeling here?"']],
    dir: [['Director of Product', 'Owns the vision and, regrettably, the backlog.']],
    vp: [['VP of Product', 'Says "north star" so often the compass is jealous.']] },
  ops: { label: 'Operations', color: '#eab308', weight: 10, execs: ['coo'], prefs: { withTeam: 4, nearBreak: 3, nearEntrance: 2 },
    teams: ['Business Ops', 'Process Improvement', 'Strategy & Planning', 'Vendor Management', 'Program Office'],
    staff: [['Operations Analyst', 'Believes any problem can be solved with one more tab and a pivot table.'], ['Program Manager', 'Can fit a three-person meeting into a zero-person availability window.'], ['Process Engineer', 'Has a process for creating processes about processes.'], ['Vendor Coordinator', 'On first-name terms with the stapler supplier.'], ['Business Analyst', 'Turns "it depends" into a 40-slide deck.'], ['Procurement Specialist', 'Haggles over paperclips as a matter of principle.'], ['Project Coordinator', 'Keeps the Gantt chart alive through sheer will.']],
    mgr: [['Operations Manager', 'Believes every problem can be solved by a better laminated sign.'], ['Programs Manager', 'Runs stand-ups so standing that nobody sits.']],
    dir: [['Director of Operations', 'Has a flowchart for the flowchart review.']],
    vp: [['VP of Operations', 'Optimises everything except the commute.']] },
  fin: { label: 'Finance', color: '#10b981', weight: 8, execs: ['cfo'], prefs: { quietRoom: 4, groundFloor: 1, nearWindow: 2 },
    teams: ['Accounting', 'FP&A', 'Accounts Payable', 'Treasury', 'Tax', 'Audit'],
    staff: [['Staff Accountant', 'Reconciles the books and, occasionally, the team.'], ['Financial Analyst', 'Forecasts with confidence and a margin of vibes.'], ['AP Specialist', 'Pays invoices with the solemnity of a priest.'], ['Payroll Specialist', 'The most beloved person on the 15th.'], ['Tax Analyst', 'Reads the tax code for fun and for dread.'], ['Internal Auditor', 'Smiles politely while counting your receipts.'], ['Treasury Analyst', 'Moves money between accounts and nerves between desks.']],
    mgr: [['Finance Manager', 'Says "per policy" in three different tones.'], ['Controller', 'Has never once rounded up.']],
    dir: [['Director of Finance', 'Keeps a calculator in each pocket.']],
    vp: [['VP of Finance', 'Describes the budget as "aspirational".']] },
  hr: { label: 'People & Culture', color: '#f97316', weight: 6, execs: ['coo', 'cfo'], prefs: { withTeam: 3, nearBreak: 4, nearEntrance: 3 },
    teams: ['Recruiting', 'Talent Development', 'Benefits', 'Employee Relations', 'People Ops'],
    staff: [['Recruiter', 'Has "just a quick call" with 300 people a week.'], ['HR Generalist', 'Knows everything and promises to tell no one.'], ['Benefits Specialist', 'Can explain deductibles without crying. Mostly.'], ['Learning & Development Specialist', 'Runs a workshop on workshops.'], ['Compensation Analyst', 'Defends the pay bands from all comers.'], ['Employee Relations Partner', 'Calms conflicts with a single raised eyebrow.'], ['People Ops Coordinator', 'Onboards a new hire every Monday and every Monday is chaos.']],
    mgr: [['HR Manager', 'Keeps a drawer of tissues and one of policy binders.'], ['Talent Acquisition Manager', 'Believes in "culture add", whatever it is.']],
    dir: [['Director of People', 'Hosts the wellness hour and the wellness hour reschedule.']],
    vp: [['VP of People', 'Insists the org chart is a "living document".']] },
  legal: { label: 'Legal & Compliance', color: '#6366f1', weight: 5, execs: ['cfo', 'coo'], prefs: { quietRoom: 5, nearWindow: 2, openPlan: 0 },
    teams: ['Corporate', 'Contracts', 'Compliance', 'Intellectual Property', 'Litigation'],
    staff: [['Corporate Counsel', 'Replies "it depends" in under four seconds.'], ['Contracts Specialist', 'Reads the fine print so you will not have to.'], ['Compliance Analyst', 'Has a checklist for the checklist.'], ['Paralegal', 'Knows where every document is and which drawer sulks.'], ['IP Counsel', 'Defends the logo as if it were a child.'], ['Legal Operations Analyst', 'Turns clauses into dashboards.'], ['Privacy Officer', 'Asks "do we really need that data?" and means it.']],
    mgr: [['Legal Manager', 'Redlines the redlines.'], ['Compliance Manager', 'Smiles only in audit season.']],
    dir: [['Director of Legal', 'Has a precedent for lunch.']],
    vp: [['VP of Legal', 'Signs off on everything and reads half of it.']] },
  support: { label: 'Customer Support', color: '#14b8a6', weight: 11, execs: ['coo', 'cmo'], prefs: { withTeam: 5, openPlan: 3, nearBreak: 3, quietRoom: 0 },
    teams: ['Tier 1', 'Tier 2', 'Enterprise Support', 'Community', 'Knowledge Base', 'Customer Experience'],
    staff: [['Support Agent', 'Has said "can you hear me now?" 4,000 times and counting.'], ['Technical Support Engineer', 'Reproduces the bug only when the customer is watching.'], ['Community Manager', 'Mediates forum disputes with bottomless patience.'], ['Knowledge Base Author', 'Writes the article that fixes the ticket nobody reads.'], ['Escalations Specialist', 'Receives the angriest emails first and the thanks never.'], ['Customer Experience Analyst', 'Turns complaints into charts and charts into hope.'], ['Onboarding Specialist', 'Walks new clients through the login screen again.']],
    mgr: [['Support Manager', 'Wears a headset to meetings out of habit.'], ['Customer Success Manager', 'Opens every email with "per my last email".']],
    dir: [['Director of Support', 'Judges the day by ticket count and mug count.']],
    vp: [['VP of Customer Experience', 'Measures delight in NPS and sighs.']] },
  it: { label: 'IT & Security', color: '#0ea5e9', weight: 7, execs: ['cto', 'coo'], prefs: { quietRoom: 3, nearEntrance: 2, groundFloor: 3 },
    teams: ['Help Desk', 'Infrastructure', 'Network', 'Security', 'Systems Admin', 'End-User Computing'],
    staff: [['IT Support Specialist', 'Has solved 90% of problems by turning it off and on again.'], ['Systems Administrator', 'Talks to the servers softly. They still crash on Fridays.'], ['Network Engineer', 'Colour-codes every cable by mood.'], ['Security Analyst', 'Sees a phishing email in every birthday greeting.'], ['Cloud Engineer', 'Lives in the cloud; rents it by the hour.'], ['Desktop Technician', 'Carries a screwdriver and a sense of fatalism.'], ['Identity & Access Admin', 'Resets passwords and bruised egos daily.']],
    mgr: [['IT Manager', 'Believes the printer is possessed and has data to prove it.'], ['Security Manager', 'Locks the door, then the door to the door.']],
    dir: [['Director of IT', 'Answers "have you tried restarting?" with a straight face.']],
    vp: [['VP of Technology Services', 'Keeps the lights on and the tickets in a drawer.']] },
  rnd: { label: 'Research & Development', color: '#84cc16', weight: 7, execs: ['cto'], prefs: { quietRoom: 4, nearWindow: 4, topFloor: 2 },
    teams: ['Applied Research', 'Data Science', 'Prototyping', 'Materials', 'Innovation Lab'],
    staff: [['Research Scientist', 'Hypothesises loudly and publishes quietly.'], ['Data Scientist', 'Can make a regression out of a coin toss.'], ['Lab Technician', 'Labels every sample twice and trusts neither label.'], ['Research Engineer', 'Builds prototypes that work exactly once, on demo day.'], ['Innovation Analyst', 'Scouts the future and files the report in the past.'], ['Statistician', 'Is p < 0.05 about everything.'], ['Patent Researcher', 'Knows everything has already been invented, twice.']],
    mgr: [['Research Manager', 'Funds curiosity in quarterly increments.'], ['Lab Manager', 'Keeps the fume hood schedule sacred.']],
    dir: [['Director of Research', 'Has a moonshot, a roadmap, and a modest budget.']],
    vp: [['VP of Research & Development', 'Says "disruptive" before noon.']] },
  admin: { label: 'Administration', color: '#a8a29e', weight: 5, execs: ['coo'], prefs: { nearEntrance: 4, groundFloor: 3, withTeam: 3 },
    teams: ['Facilities', 'Office Services', 'Reception & Mail', 'Executive Support', 'Workplace Experience'],
    staff: [['Office Administrator', 'Knows where the good pens are and whom to ask.'], ['Facilities Coordinator', 'Adjusts the thermostat in secret. Everyone knows.'], ['Executive Assistant', 'Controls three calendars and the fate of many.'], ['Mailroom Clerk', 'Delivers packages like a postal poet.'], ['Workplace Experience Lead', 'Believes a kombucha tap is a strategy.'], ['Security Guard', 'Greets every visitor with a nod and every badge with suspicion.'], ['Travel Coordinator', 'Has rebooked the same flight nine times with a smile.']],
    mgr: [['Facilities Manager', 'Has a key for every door and an excuse for each.'], ['Office Manager', 'Is the true CEO of snacks.']],
    dir: [['Director of Administration', 'Keeps the building and the morale upright.']],
    vp: [['VP of Workplace', 'Designs open floors and closed-door policies.']] },
  mfg: { label: 'Manufacturing', color: '#92400e', weight: 8, execs: ['coo'], prefs: { groundFloor: 5, withTeam: 4, nearEntrance: 3, quietRoom: 0 },
    teams: ['Assembly', 'Quality Control', 'Machining', 'Packaging', 'Plant Maintenance', 'Supply Chain'],
    staff: [['Assembly Technician', 'Can tighten a bolt to precisely "good enough".'], ['Quality Inspector', 'Rejects things with a single, devastating glance.'], ['Machinist', 'Has ten fingers and strong opinions about tolerances.'], ['Packaging Operator', 'Wraps things like gifts to be regretted.'], ['Maintenance Technician', 'Fixes the line with duct tape and rumour.'], ['Supply Chain Planner', 'Tracks forty containers and loses sleep over three.'], ['Production Scheduler', 'Re-plans Monday on Sunday night.']],
    mgr: [['Production Manager', 'Knows the line speed like a heartbeat.'], ['Plant Supervisor', 'Walks the floor with a clipboard and a sense of destiny.']],
    dir: [['Director of Manufacturing', 'Measures life in units per hour.']],
    vp: [['VP of Manufacturing', 'Believes every problem is a conveyor-belt problem.']] }
};
const STAFF_DEPTS = Object.keys(DEPTS).filter((d) => d !== 'exec');

// Round-robin over a shuffled copy of a list, reshuffling when it runs out.
function cycle(list) {
  let deck = [];
  return () => { if (!deck.length) deck = shuffle(list); return deck.pop(); };
}

const withQuirk = (text) => (Math.random() < 0.6 ? `${text} ${QUIRKS[Math.floor(Math.random() * QUIRKS.length)]}` : text);

// Weighted preference for a department, limited to the preferences this campus can actually test.
function pickPreference(dept, available) {
  const weights = { ...DEFAULT_PREFS, ...(DEPTS[dept].prefs || {}) };
  const options = Object.entries(weights).filter(([p, w]) => w > 0 && available.has(p));
  const total = options.reduce((a, [, w]) => a + w, 0);
  let roll = Math.random() * total;
  for (const [p, w] of options) { roll -= w; if (roll <= 0) return p; }
  return 'withTeam';
}

/**
 * Org chart for N people: executives and presidents (large jobs), then per department a VP, directors,
 * one manager per team and the staff beneath them. managersWanted only matters for small jobs (< 30 people),
 * which stay a flat manager/staff structure. Returns nodes { dept, team, rank, role, boss } in id order.
 */
function planOrg(N, managersWanted = 0) {
  const nodes = [];
  const add = (n) => { nodes.push({ boss: null, ...n }); return nodes.length - 1; };
  const execN = N >= 30 ? Math.min(5, 1 + Math.floor(N / 70)) : 0;
  const presN = N >= 100 ? Math.min(3, Math.round(N / 90)) : 0;

  const execAt = {};
  EXEC_ORDER.slice(0, execN).forEach((k) => { execAt[k] = add({ dept: 'exec', team: 'Office of the CEO', rank: 'exec', role: [EXEC_ROLES[k][0], withQuirk(EXEC_ROLES[k][1])] }); });
  const ceo = execAt.ceo ?? null;
  Object.values(execAt).forEach((i) => { if (i !== ceo) nodes[i].boss = ceo; });
  shuffle(PRESIDENT_DIVISIONS).slice(0, presN).forEach((div, p) => {
    add({ dept: 'exec', team: 'Divisions', rank: 'pres', role: [`President, ${div}`, withQuirk(PRESIDENT_FLAVOR[p % PRESIDENT_FLAVOR.length])], boss: ceo });
  });
  const execFor = (dept) => { const k = (DEPTS[dept].execs || []).find((e) => execAt[e] !== undefined); return k ? execAt[k] : ceo; };

  const depts = Math.min(STAFF_DEPTS.length, N < 14 ? 3 : Math.max(4, Math.round(Math.sqrt(N) * 0.9)));
  const chosen = shuffle(STAFF_DEPTS).slice(0, depts);
  const sizes = distribute(N - nodes.length, chosen.map((d) => DEPTS[d].weight));
  const bySize = chosen.map((d, i) => [d, sizes[i]]).filter(([, s]) => s > 0);
  let managersLeft = Math.min(managersWanted, Math.floor(N / 3));

  for (const [dept, size] of [...bySize].sort((a, b) => b[1] - a[1])) {
    const def = DEPTS[dept];
    const big = N >= 30;
    const vp = N >= 50 && size >= 8 ? 1 : 0;
    const dirs = big ? Math.max(size >= 10 ? 1 : 0, Math.round(size / 14)) : 0;
    const teamCount = Math.max(1, Math.min(def.teams.length, big ? Math.round((size - vp - dirs) / 8) : 1));
    let mgrs;
    if (big) mgrs = Math.min(teamCount, Math.max(0, size - vp - dirs - 1));
    else if (managersLeft > 0 && size >= 3) { mgrs = 1; managersLeft--; } else mgrs = 0;
    const staff = size - vp - dirs - mgrs;
    const teams = shuffle(def.teams).slice(0, teamCount);
    const pickStaff = cycle(def.staff);
    const pickMgr = cycle(def.mgr);

    const vpAt = vp ? add({ dept, team: 'Leadership', rank: 'vp', role: [def.vp[0][0], withQuirk(def.vp[0][1])], boss: execFor(dept) }) : null;
    const dirAt = Array.from({ length: dirs }, () => add({ dept, team: 'Leadership', rank: 'dir', role: [def.dir[0][0], withQuirk(def.dir[0][1])], boss: vpAt ?? execFor(dept) }));
    const mgrAt = Array.from({ length: mgrs }, (_, t) => {
      const role = pickMgr();
      return add({ dept, team: teams[t % teams.length], rank: 'mgr', role: [role[0], withQuirk(role[1])], boss: dirAt.length ? dirAt[t % dirAt.length] : vpAt ?? (big ? execFor(dept) : null) });
    });
    for (let k = 0; k < staff; k++) {
      const role = pickStaff();
      const t = k % teams.length;
      const mgrIdx = mgrAt.find((m) => nodes[m].team === teams[t]);
      add({ dept, team: teams[t], rank: 'staff', role: [role[0], withQuirk(role[1])], boss: mgrIdx ?? null });
    }
  }
  return nodes;
}
