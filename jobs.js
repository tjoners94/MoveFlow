/** Job definitions. Fields: employees, timeLimit (s, 0 = none), rewardMult, satGoal, seed.
 *  Optional campus shape: sites [{ name, floors, specials, weight }], or buildings / floors counts; otherwise headcount decides (see campus.js). */

// Floor plans are generated with this share of the crew as extra desks (bsp.js).
const SPARE_DESK_SHARE = 0.25;
const spareDesks = (job) => Math.ceil(job.employees * SPARE_DESK_SHARE);

// Jobs without an industry are a general office.
const GENERAL_INDUSTRY = { icon: '\ud83d\udcbc', name: 'General Office' };
const industryOf = (job) => INDUSTRIES[job.industry] || GENERAL_INDUSTRY;

// Parody clients per industry: [name, one-line description].
const CLIENT_POOLS = {
  startup: [
    ['Gloogle Labs', 'Disrupts industries by lunchtime and pivots to something else by dinner.'],
    ['Faceplant.io', 'A social network for houseplants that is somehow already worth a billion dollars.'],
    ['Uberoo', 'Delivers anything anywhere, eventually, mostly to the wrong address.'],
    ['Slackr', 'Replaces meetings with messages and messages with more meetings.'],
    ['Airbnbed', 'Lets strangers sleep in your spare room and your spare conference room.'],
    ['Spotifry', 'Streams music nobody asked for while the burn rate plays the hits.']
  ],
  law: [
    ['Dewey, Cheatham & Howe', 'Bills in six-minute increments and has never once checked the clock.'],
    ['Sue Grabbit & Runne', 'Specializes in settlements, strongly worded letters and very long lunches.'],
    ['Objection & Overruled LLP', 'Argues everything twice and wins on a technicality both times.'],
    ['Hammer, Gavel & Associates', 'A boutique firm where every handshake comes with a retainer.'],
    ['Habeas Corpus & Sons', 'Defends clients, grudges and an unusually large collection of leather chairs.'],
    ['Baker & McMuffin', 'Drafts airtight contracts and leaves the crumbs for the other side.']
  ],
  medical: [
    ['Mayonnaise Clinic', 'Spreads good health, one slightly uncomfortable waiting room at a time.'],
    ['Cleveland Cliniq', 'World-class care with a gift shop that is somehow the main attraction.'],
    ['WebbedFeet MD', 'Diagnoses everything online and prescribes rest, fluids and a second opinion.'],
    ['Placebo General Hospital', 'Treats patients with great confidence and even better pamphlets.'],
    ['Kaiser Roll Medical Group', 'Covers everything except the thing you actually came in for.'],
    ['Johns Hopskotch Clinic', 'Refers patients onward so quickly they end up back where they started.']
  ],
  design: [
    ['Pixelar Studios', 'Renders everything beautifully and finishes it a sequel later.'],
    ['Abode Creative', 'Gives every client a mood board and every mood board an invoice.'],
    ['Figment Design Co.', 'Turns imaginary briefs into very real revision rounds.'],
    ['Canva-ss & Co.', 'Believes every problem is solved by a bolder font and a gradient.'],
    ['Ideal-O Design', 'Brainstorms in beanbags and presents in turtlenecks.'],
    ['Sketchy Sketch Studio', 'Pitches bold new ideas that look suspiciously like last year\u2019s.']
  ],
  bank: [
    ['Goldmine Sacks', 'Turns other people\u2019s money into mostly its own, with excellent stationery.'],
    ['JP Morgan Chaise', 'So large that even the lounge furniture has an interest rate.'],
    ['Wells Fargone', 'Always one more account away from a satisfied customer.'],
    ['Bank of Americano', 'Offers free coffee with every loan and hidden fees with every coffee.'],
    ['Cityzens Bank', 'Keeps its vault very secure and its fee schedule very long.'],
    ['Morgan Stan-Ley', 'Manages wealth with a firm handshake and an even firmer minimum balance.']
  ],
  university: [
    ['Harvarf University', 'Admits the brightest minds and then charges them accordingly.'],
    ['Standford', 'Where the lecture halls are grand and the office hours are theoretical.'],
    ['M.I.Tea Institute of Technology', 'Brews brilliant ideas and an alarming amount of herbal tea.'],
    ['Yawl University', 'Famous for tradition, ivy and a very exclusive rowing team.'],
    ['Princetown Tech', 'Publishes fiercely and has nowhere to park.'],
    ['Oxbridge-ish College', 'Offers centuries of heritage and a library that is mostly rumour.']
  ],
  research: [
    ['Bell Curve Labs', 'Grades every experiment on a curve and every grant on hope.'],
    ['CERN-ish Institute', 'Smashes particles together and calls the resulting paperwork science.'],
    ['Los Alamost Laboratories', 'Cannot find its own results but is certain they were significant.'],
    ['NASSA Applied Research', 'Reaches for the stars after filing the correct procurement form.'],
    ['Xerox PARQ', 'Invented the future and left the patents in the copier.'],
    ['Eureka & Oops Labs', 'Celebrates every breakthrough and every small fire with equal enthusiasm.']
  ],
  media: [
    ['CNM Cable News Maybe', 'Reports breaking news just as soon as it finishes breaking.'],
    ['Netflux', 'Streams endless shows and asks, every episode, if you are still watching.'],
    ['BBQ Broadcasting', 'Serves up hot takes, well done.'],
    ['HBOy Max', 'Prestige television for people who have finished everything else.'],
    ['Dizzy Studios', 'Makes magic, sequels and more sequels on a nonstop loop.'],
    ['ESPNope Sports', 'Covers every game live, except the one you wanted.']
  ],
  general: [
    ['Synergy & Associates', 'Leverages core competencies to hold meetings about meetings.'],
    ['Consolidated Widgets Ltd.', 'Makes widgets, sells widgets and reviews widgets every quarter.'],
    ['Megacorp Unlimited', 'So diversified that nobody has ever finished the org chart.'],
    ['Amazin\u2019 Logistics', 'Delivers within two business days, or three, depending on the weather.'],
    ['Walmarty Enterprises', 'Sells everything at everyday low prices and slightly high anxiety.'],
    ['Generic Corp International', 'Does a bit of everything and a lot of nothing in particular.']
  ]
};

// Same industry and index always give the same client, so the briefing is stable across redraws.
function clientFor(industry, n) {
  const pool = CLIENT_POOLS[industry] || CLIENT_POOLS.general;
  const [name, blurb] = pool[n % pool.length];
  return { name, blurb };
}

const CAMPAIGN = [
  { id: 'c1', icon: '🟢', name: 'Introductory Job', desc: 'Pro-bono move for a tiny tech startup.', industry: 'startup', employees: 6, timeLimit: 600, rewardMult: 1, seed: 101 },
  { id: 'c2', icon: '🟡', name: 'Corporate Shuffle', desc: 'Reorganize a boutique law firm.', industry: 'law', employees: 8, timeLimit: 540, rewardMult: 1.2, seed: 202 },
  { id: 'c3', icon: '🔴', name: 'The Big Migration', desc: 'Move a busy medical clinic.', industry: 'medical', employees: 8, timeLimit: 480, rewardMult: 1.4, seed: 303 },
  { id: 'c4', icon: '🟢', name: 'Startup Scaling', desc: 'Settle new hires into a design studio.', industry: 'design', employees: 10, timeLimit: 420, rewardMult: 1.6, seed: 404 },
  { id: 'c5', icon: '🟡', name: 'Merger Madness', desc: 'Combine two bank branches.', industry: 'bank', employees: 10, timeLimit: 360, rewardMult: 1.8, seed: 505 },
  { id: 'c6', icon: '🔴', name: 'Skyscraper Drop', desc: 'Pack a university department into a three-floor tower.', industry: 'university', employees: 12, timeLimit: 300, rewardMult: 2, seed: 606 },
  { id: 'c7', icon: '🟡', name: 'Rush Hour', desc: 'The research lab opens Monday, split across two buildings.', industry: 'research', employees: 12, timeLimit: 240, rewardMult: 2.4, seed: 707 },
  { id: 'c8', icon: '🔴', name: 'Grand Finale', desc: 'Relocate a media station: studio lot plus admin tower.', industry: 'media', employees: 12, timeLimit: 180, rewardMult: 3, seed: 808 }
].map((j, i) => ({ ...j, campaign: true, specials: { ...INDUSTRIES[j.industry].rooms }, client: clientFor(j.industry, i) }));

// Thematic campuses: which buildings a mission spans, how tall they are, and which industry rooms live where.
const CAMPAIGN_SITES = {
  c5: [{ name: 'North Branch', floors: 1, specials: { vault: 1, security: 1 } }, { name: 'South Branch', floors: 1, specials: { server: 1, briefing: 1 } }],
  c6: [{ name: 'University Tower', floors: 3 }],
  c7: [{ name: 'Lab Block', floors: 2, specials: { lab: 1, cleanroom: 1, server: 1 } }, { name: 'Workshop Annex', floors: 1, specials: { workshop: 1 } }],
  c8: [{ name: 'Studio Lot', floors: 1, specials: { studio: 1, control: 1, server: 1 } }, { name: 'Admin Tower', floors: 2 }]
};
CAMPAIGN.forEach((j) => { if (CAMPAIGN_SITES[j.id]) j.sites = CAMPAIGN_SITES[j.id]; });

// Floor-plan requirements per mission: private offices, receptionist, near-phone staff, phone rooms.
const CAMPAIGN_RULES = {
  c1: { offices: 1, receptionist: false, nearPhone: 0, phoneRooms: 0, cafe: 0, managers: 0 },
  c2: { offices: 2, receptionist: true, nearPhone: 1, phoneRooms: 1, cafe: 0, managers: 1 },
  c3: { offices: 2, receptionist: true, nearPhone: 1, phoneRooms: 1, cafe: 0, managers: 1 },
  c4: { offices: 2, receptionist: true, nearPhone: 2, phoneRooms: 2, cafe: 0, managers: 2 },
  c5: { offices: 3, receptionist: true, nearPhone: 2, phoneRooms: 2, cafe: 1, managers: 2 },
  c6: { offices: 3, receptionist: true, nearPhone: 2, phoneRooms: 2, cafe: 1, managers: 2 },
  c7: { offices: 3, receptionist: true, nearPhone: 3, phoneRooms: 2, cafe: 1, managers: 3 },
  c8: { offices: 4, receptionist: true, nearPhone: 3, phoneRooms: 3, cafe: 2, managers: 3 }
};
CAMPAIGN.forEach((j) => Object.assign(j, CAMPAIGN_RULES[j.id]));
// Satisfaction goal: the share of the crew whose preference should be met (rises with the mission number).
CAMPAIGN.forEach((j, i) => { j.satGoal = Math.round((0.5 + i * 0.04) * 100) / 100; });
// Cargo load: how many plants, computers and furniture pieces each employee brings (0 = boxes only).
CAMPAIGN.forEach((j, i) => { j.cargoLoad = Math.round((0.1 + i * 0.08) * 100) / 100; });

// Random contracts scale with headcount; the campus (buildings x floors) follows from it (see campus.js).
// Time limits assume the average employee takes SECONDS_PER_EMPLOYEE to place, times a per-tier slack (0 = untimed).
const SECONDS_PER_EMPLOYEE = 60;
const RANDOM_TIERS = [
  { tier: 'chill', icon: '⚪', name: 'Chill Contract', people: [8, 12], slack: 0, rewardMult: 0.8, satGoal: 0.5, cargoLoad: 0.1 },
  { tier: 'easy', icon: '🟢', name: 'Easy Contract', people: [25, 45], slack: 2, rewardMult: 1, satGoal: 0.6, cargoLoad: 0.25 },
  { tier: 'medium', icon: '🟡', name: 'Medium Contract', people: [70, 110], slack: 1.5, rewardMult: 1.5, satGoal: 0.65, cargoLoad: 0.4 },
  { tier: 'hard', icon: '🟠', name: 'Hard Contract', people: [130, 180], slack: 1.25, rewardMult: 2.2, satGoal: 0.7, cargoLoad: 0.55 },
  { tier: 'expert', icon: '🔴', name: 'Expert Contract', people: [200, 250], slack: 1.2, rewardMult: 3, satGoal: 0.75, cargoLoad: 0.7 }
];

const tierTimeLimit = (t, employees) => (t.slack ? Math.round((employees * SECONDS_PER_EMPLOYEE * t.slack) / 10) * 10 : 0);

// 3725 -> "1:02:05"; 125 -> "2:05".
function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

// 12000 -> "3h 20m"; 540 -> "9m".
function formatSpan(sec) {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
}

// Random contracts can come from any unlocked client whose special rooms fit the crew size.
function pickClient(employees) {
  const cap = Math.max(3, Math.floor(employees / 6));
  const open = Object.entries(INDUSTRIES).filter(([, c], i) => Save.isUnlocked('clients', i) && clientRoomCount(c) <= cap);
  return open.length && Math.random() < 0.6 ? open[Math.floor(Math.random() * open.length)][0] : null;
}

function makeRandomJob(t) {
  const [lo, hi] = t.people;
  const employees = lo + Math.floor(Math.random() * (hi - lo + 1));
  const job = {
    id: `r-${t.tier}`, name: t.name, icon: t.icon, campaign: false, employees,
    timeLimit: tierTimeLimit(t, employees), rewardMult: t.rewardMult, satGoal: t.satGoal, cargoLoad: t.cargoLoad, seed: 0
  };
  const client = pickClient(employees);
  job.client = clientFor(client, Math.floor(Math.random() * 1000));
  // Not every big job is a sprawling campus: some are one floor, some one tall building, whatever the headcount.
  const shape = Math.random();
  if (employees >= 30) {
    if (shape < 0.3) Object.assign(job, { buildings: 1, floors: 1 });
    else if (shape < 0.5) Object.assign(job, { buildings: 1, floors: 2 + Math.floor(Math.random() * 3) });
  }
  if (client) {
    const c = INDUSTRIES[client];
    Object.assign(job, { industry: client, specials: { ...c.rooms }, desc: `${c.icon} A ${c.name} needs moving.`, rewardMult: t.rewardMult });
  }
  return job;
}
