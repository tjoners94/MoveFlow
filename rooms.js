/**
 * Industry-specific rooms. A job only gets these when its `industry` (a Client Type) or `specials` calls for them.
 * w/h: footprint in cells; seats: reserved workstations (kind = room id) for employees who require the room;
 * team: department those employees belong to; fixture/fx: furniture drawn inside; fill: floor colour.
 */
const SPECIAL_ROOMS = {
  server: { label: 'SERVER ROOM', name: 'Server Room', w: 6, h: 6, seats: 1, team: 'it', fill: '#cffafe', fixture: 'rack', fx: '#334155',
    roles: [['Rack Whisperer', 'Talks to the servers softly. They still crash on Fridays.'], ['Cable Management Zealot', 'Colour-codes every cable by mood.']] },
  vault: { label: 'VAULT', name: 'Vault', w: 6, h: 6, seats: 1, team: 'fin', fill: '#e5e7eb', fixture: 'safe', fx: '#a1a1aa',
    roles: [['Combination Keeper', 'Knows the code. Has forgotten it twice.'], ['Vault Door Greeter', 'Says "mind the door" with real feeling.']] },
  security: { label: 'SECURITY OFFICE', name: 'Security Office', w: 6, h: 6, seats: 1, team: 'admin', fill: '#fecdd3', fixture: 'monitor', fx: '#1e293b',
    roles: [['Head of Badge Scanning', 'Has scanned the same badge four thousand times.'], ['Camera Feed Connoisseur', 'Watches sixteen screens and the break room fridge.']] },
  exam: { label: 'EXAM ROOM', name: 'Exam Room', w: 6, h: 6, seats: 1, team: 'ops', fill: '#d1fae5', fixture: 'bed', fx: '#93c5fd',
    roles: [['Chief Stethoscope Warmer', 'Believes cold instruments are a breach of trust.'], ['Head of Paper Gown Logistics', 'Knows one size fits no one.']] },
  sterile: { label: 'STERILIZATION', name: 'Sterilization Room', w: 6, h: 6, seats: 1, team: 'ops', fill: '#ccfbf1', fixture: 'steel', fx: '#cbd5e1',
    roles: [['Autoclave Operator', 'Treats a clean tray like a sacred text.'], ['Sterility Sentinel', 'Can smell an unwashed glove from the hallway.']] },
  library: { label: 'LAW LIBRARY', name: 'Law Library', w: 11, h: 8, seats: 2, team: 'legal', fill: '#ffe4c4', fixture: 'shelf', fx: '#92400e',
    roles: [['Keeper of Precedents', 'Has a case for everything, including this sentence.'], ['Footnote Archivist', 'Reads the footnotes to the footnotes.']] },
  lab: { label: 'LABORATORY', name: 'Laboratory', w: 11, h: 8, seats: 3, team: 'rnd', fill: '#d9f99d', fixture: 'bench', fx: '#64748b',
    roles: [['Principal Pipette Wrangler', 'Measures in microlitres and grudges.'], ['Senior Beaker Diplomat', 'Mediates disputes between flasks.'], ['Fume Hood Philosopher', 'Contemplates the nature of smells.']] },
  cleanroom: { label: 'CLEAN ROOM', name: 'Clean Room', w: 11, h: 8, seats: 2, team: 'rnd', fill: '#e0f2fe', fixture: 'steel', fx: '#e2e8f0',
    roles: [['Particle Counter', 'Takes dust personally.'], ['Bunny Suit Captain', 'Has not seen their own hair in months.']] },
  workshop: { label: 'WORKSHOP', name: 'Workshop', w: 11, h: 8, seats: 2, team: 'mfg', fill: '#fde68a', fixture: 'machine', fx: '#57534e',
    roles: [['Master Tinkerer', 'Fixes it with a hammer. Then asks questions.'], ['Head of Sawdust Relations', 'Wears a fine coat of it daily.']] },
  briefing: { label: 'EXEC BRIEFING', name: 'Executive Briefing Room', w: 11, h: 8, seats: 2, team: 'exec', fill: '#ddd6fe', fixture: 'table', fx: '#a78bfa',
    roles: [['Executive Briefing Coordinator', 'Makes a slide deck for the slide deck.'], ['Director of Pointer Operations', 'Guards the only working laser pointer.']] },
  studio: { label: 'BROADCAST STUDIO', name: 'Broadcast Studio', w: 11, h: 8, seats: 2, team: 'prod', fill: '#fbcfe8', fixture: 'camera', fx: '#be185d',
    roles: [['Floor Director', 'Counts down from five and means it.'], ['Lead Boom Operator', 'Hangs overhead and judges quietly.']] },
  control: { label: 'CONTROL ROOM', name: 'Control Room', w: 11, h: 8, seats: 2, team: 'it', fill: '#c7d2fe', fixture: 'console', fx: '#312e81',
    roles: [['Signal Flow Sorcerer', 'Finds the one loose cable by vibes alone.'], ['Master of the Big Red Button', 'Presses it only on cue. Mostly.']] },
  lecture: { label: 'LECTURE HALL', name: 'Lecture Hall', w: 11, h: 8, seats: 1, team: 'rnd', fill: '#fef08a', fixture: 'pew', fx: '#b45309',
    roles: [['Visiting Lecture Wrangler', 'Has been mid-sentence since 2009.'], ['Podium Custodian', 'Adjusts the microphone height for everyone.']] },
  gameroom: { label: 'GAME ROOM', name: 'Game Room', w: 11, h: 8, seats: 0, team: 'dev', fill: '#bbf7d0', fixture: 'pingpong', fx: '#15803d', roles: [] }
};

// Everyday rooms that fill leftover floor on any job; max = per floor, minW/minH = smallest free area they fit.
const UTILITY_ROOMS = {
  restroom: { label: 'RESTROOMS', name: 'Restrooms', w: 9, h: 6, minW: 7, minH: 6, max: 2, seats: 0, fill: '#e0e7ff', fixture: 'stall', fx: '#a5b4fc' },
  huddle: { label: 'HUDDLE', name: 'Huddle Room', w: 7, h: 6, minW: 6, minH: 6, max: 4, seats: 0, fill: '#ede9fe', fixture: 'table', fx: '#c4b5fd' },
  copy: { label: 'COPY / PRINT', name: 'Copy / Print Room', w: 5, h: 5, minW: 5, minH: 5, max: 2, seats: 0, fill: '#e2e8f0', fixture: 'machine', fx: '#94a3b8' },
  storage: { label: 'STORAGE', name: 'Storage', w: 6, h: 5, minW: 5, minH: 4, max: 3, seats: 0, fill: '#e7e5e4', fixture: 'shelf', fx: '#a8a29e' }
};
// The ground floor's loading dock room: no seats, furnished only by the company truck.
const DOCK_ROOM = { label: 'LOADING DOCK', name: 'Dock Bay', seats: 0, fill: '#fed7aa' };
const ROOM_DEFS = { ...UTILITY_ROOMS, ...SPECIAL_ROOMS, dock: DOCK_ROOM };

// Client Types (Unlocks menu) and the rooms each one calls for.
const INDUSTRIES = {
  startup: { icon: '🏢', name: 'Tech Startup', rooms: { server: 1, gameroom: 1 } },
  law: { icon: '⚖️', name: 'Law Firm', rooms: { library: 1, briefing: 1 } },
  medical: { icon: '🏥', name: 'Medical Clinic', rooms: { exam: 2, sterile: 1 } },
  design: { icon: '🎨', name: 'Design Studio', rooms: { workshop: 1, briefing: 1 } },
  bank: { icon: '🏦', name: 'Bank HQ', rooms: { vault: 1, security: 1, server: 1, briefing: 1 } },
  university: { icon: '🏫', name: 'University Dept', rooms: { lecture: 1, lab: 1, library: 1 } },
  research: { icon: '🧪', name: 'Research Lab', rooms: { lab: 1, cleanroom: 1, server: 1, workshop: 1 } },
  media: { icon: '📺', name: 'Media Station', rooms: { studio: 1, control: 1, server: 1 } }
};

// Special rooms a job asks for: explicit `specials`, else its industry's list, else none.
function jobSpecials(job) {
  return (job && (job.specials || INDUSTRIES[job.industry]?.rooms)) || {};
}
