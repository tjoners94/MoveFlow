/** Wiki content: glossary terms and pages. Inline markup: [[page#heading|label]] link, {{term|shown}} glossary tooltip, **bold**.
 *  Page body blocks: string (paragraph), {h}, {ul}, {ol}, {table: [head, ...rows]}, {note}. A body may be a function so tables stay in step with the game. */

const WIKI_GLOSSARY = {
  'adjacency': 'In space planning, how close one team or function sits to another, usually set by how often they need to interact.',
  'campus': 'A group of buildings occupied by one organization on a shared site.',
  'circulation': 'The routes people and goods take to move through a building: corridors, stairs and lifts.',
  'clean room': 'A controlled environment with very low levels of airborne particles, used in electronics and pharmaceutical work.',
  'c-suite': 'An organization\'s most senior executives, whose titles usually start with Chief: CEO, COO, CFO, CTO, CMO.',
  'daylighting': 'Using natural light from windows to illuminate the inside of a building.',
  'deployment': 'Installing or placing equipment and furniture in its final working position.',
  'difficulty multiplier': 'A factor applied to a base payout so harder work pays proportionally more.',
  'ff&e': 'Furniture, fixtures and equipment: the movable items in a building, such as desks, chairs, plants and computers.',
  'floor plan': 'A scaled top-down drawing of one level of a building showing walls, doors, rooms and fixtures.',
  'freight elevator': 'An elevator built to carry goods and equipment rather than visitors. Also called a service elevator.',
  'ground floor': 'The storey of a building at street level.',
  'headcount': 'The number of people employed in, or to be housed by, an organization or space.',
  'hot-desking': 'A seating policy where desks are not assigned to individuals and staff use any free one.',
  'huddle room': 'A small meeting room, typically for two to six people, used for quick informal collaboration.',
  'isometric projection': 'A way of drawing a three-dimensional object on a flat page in which all three axes are equally foreshortened, so nothing shrinks with distance.',
  'kpi': 'Key performance indicator: a measurable value that shows how well an objective is being met.',
  'loading dock': 'A raised bay at the back of a building where trucks load and unload goods.',
  'move management': 'The planning and coordination of relocating people, furniture and equipment from one space to another.',
  'open-plan office': 'A layout with few internal walls, where many people share one large room.',
  'org chart': 'A diagram of an organization\'s structure showing who reports to whom.',
  'pro bono': 'Professional work done without charge, for the public good.',
  'private office': 'An enclosed room, usually with a door, for one or two people.',
  'procedural generation': 'Creating content by algorithm instead of by hand, so each result can be different.',
  'quiet room': 'A space with few occupants and low noise, used for focused work.',
  'receptionist': 'The staff member at the front desk who greets visitors and handles incoming enquiries.',
  'reporting line': 'The chain of authority linking an employee to their manager and up through the organization.',
  'rider': 'An additional clause attached to a contract that adds conditions, and often extra payment.',
  'seed': 'A starting value for a pseudo-random generator. The same seed always produces the same sequence.',
  'service elevator': 'A lift reserved for staff, goods and equipment rather than visitors.',
  'space planning': 'Arranging furniture, workstations and rooms in a building to fit an organization\'s needs.',
  'span of control': 'The number of direct reports a manager supervises.',
  'stacking plan': 'A diagram showing which departments occupy which floors of a multi-storey building.',
  'throughput': 'The amount of work completed in a given period of time.',
  'time limit': 'A fixed deadline by which a task must be completed. Also called time-boxing.',
  'utilization': 'The share of available space or capacity that is actually in use.',
  'wayfinding': 'The signs, layout and visual cues that help people find their way through a building.',
  'workstation': 'A designated desk, chair and equipment set-up where one person works.'
};

const WIKI_PREF_NOTES = {
  withTeam: 'Another member of their team sits in the same room.',
  quietRoom: 'Their room has only a handful of desks (six or fewer).',
  nearEntrance: 'Their desk is within a reasonable walk of the floor\'s entrance.',
  nearWindow: 'Their desk is within a few tiles of a window.',
  nearBreak: 'Their desk is fairly close to a break room, lounge or cafe.',
  openPlan: 'They sit in Open Seating, not in a private office.',
  groundFloor: 'They sit on a ground floor.',
  topFloor: 'They sit on the top floor of their building.',
  withDept: 'Someone else from their department sits in the same building.'
};

const WIKI_PREF_SHORT = {
  withTeam: 'sitting with their team', quietRoom: 'quiet rooms', nearEntrance: 'the entrance', nearWindow: 'windows',
  nearBreak: 'break areas', openPlan: 'open seating', groundFloor: 'the ground floor', topFloor: 'the top floor', withDept: 'their department\'s building'
};

const wikiMins = (s) => (s ? `${+(s / 60).toFixed(1)} min` : 'None');
const wikiList = (items) => items.join(', ');

const WIKI = [
  {
    id: 'start', icon: '🧭', name: 'Start Here',
    pages: [
      {
        id: 'welcome', title: 'Welcome to Move Flow',
        flavor: 'Congratulations on your new career in {{move management}}. Please keep all limbs inside the elevator.',
        tldr: 'You seat employees at desks, press Execute, and watch Movers carry everything in. Happier employees mean more stars and more money.',
        eli5: 'It is musical chairs, except nobody fights. You pick the chair for each person, then the moving crew brings their stuff.',
        body: [
          'Every job in Move Flow is an office relocation. You get a {{floor plan}}, a roster of employees and (usually) a {{time limit}}. Your task is {{space planning}}: decide who sits where.',
          { h: 'Where to next' },
          {
            ul: [
              '[[loop]]: the three-step cycle that every job follows.',
              '[[first-job]]: a short walkthrough for new hires.',
              '[[planning]]: everything about seating people.',
              '[[execution]]: what happens after you press the big button.',
              '[[payouts]]: how the money works.',
              '[[glossary]]: every underlined term in one place.'
            ]
          },
          { note: 'Underlined terms reveal their industry-standard definition when you hover or tap them. Try it: {{headcount}}.' }
        ]
      },
      {
        id: 'loop', title: 'The Core Loop',
        flavor: 'Plan. Execute. Get paid. Repeat until retirement or the bank balance says so.',
        tldr: 'Every job has three steps: [[planning|Plan]], [[execution|Execute]], then [[payouts|Get Paid]]. Money buys upgrades that make the next job easier.',
        eli5: 'First you decide where everyone sits. Then the movers do the hard part. Then you get coins to buy cooler movers.',
        body: [
          { h: 'The three steps' },
          {
            ol: [
              '**Plan.** Read each employee\'s [[requirements]] and [[preferences]], then drag them onto desks across the floor plan before the clock runs out.',
              '**Execute.** Press Execute when everyone is seated. Movers deliver every object, then employees arrive and react.',
              '**Get Paid.** Collect your reward, then spend it on [[upgrades]] or unlock new [[hires]], [[clients]] and [[modifiers]].'
            ]
          },
          { h: 'What feeds back into the loop' },
          {
            ul: [
              'Stars from [[ratings|Satisfaction]] build your Company Rating.',
              'Completing a [[campaign]] mission for the first time unlocks one item in every category.',
              'Upgrades make every future job faster, safer and better paid.'
            ]
          }
        ]
      },
      {
        id: 'first-job', title: 'Your First Job',
        flavor: 'Everyone starts somewhere. You start at a tiny startup that calls its break room "the ideation pod".',
        tldr: 'Create a company, open the Campaign, take on the Introductory Job, seat six people and press Execute.',
        eli5: 'Pick a name for your moving company, play the first level, and follow the little speech bubbles.',
        body: [
          {
            ol: [
              'Choose a save slot, then name your company and pick a logo and font.',
              'Open **Play Campaign** and choose the Introductory Job, billed as {{pro bono}}. The game pays you anyway.',
              'Read the briefing: client, crew size, time limit, cargo and rewards. Press **Start Job**.',
              'Pick a department in the roster. Drag an employee\'s initials onto a desk.',
              'Seat anyone with a [[requirements|requirement]] first. Then try to please everyone else.',
              'Press **Execute**, confirm, and enjoy the show.'
            ]
          },
          { note: 'Short tutorial bubbles appear the first time you use each screen. They can be replayed from Settings. See [[saves]].' }
        ]
      }
    ]
  },
  {
    id: 'planning', icon: '📋', name: 'Planning',
    pages: [
      {
        id: 'planning', title: 'The Planning Phase',
        flavor: 'Where dreams are drafted, deadlines loom and nobody has read the seating policy.',
        tldr: 'Drag every employee onto a desk before time runs out. Requirements are mandatory; preferences earn stars.',
        eli5: 'Everybody gets a name tag and you choose their chair. A few kids need one particular chair. Everyone else just likes some chairs more.',
        body: [
          { h: 'The screen' },
          {
            ul: [
              '**Header meters:** Time Limit, Employees seated, and Satisfaction with its goal marked.',
              '**Roster:** pick a department to see its employees. Its [[org|org chart]] opens underneath. By default the roster sits on the left; Settings can move it.',
              '**Floor plan:** drag employees onto a {{workstation}}. Tap a seated desk to open that employee\'s card, which has an Unassign button.',
              '**Trash buttons:** Unassign All for the whole company, or just the open department.'
            ]
          },
          { h: 'The clock' },
          'The {{time limit}} only runs while you are planning and pauses while any pop-up is open. If it reaches zero the job fails with zero stars. Chill contracts have no clock at all.',
          { h: 'Fast Planning' },
          'Pressing Execute early earns a bonus. See [[payouts#Bonuses|Bonuses]].',
          { h: 'Seats and spares' },
          'Floors come with roughly a quarter more desks than there are people, so you will never be forced into a bad seat by pure arithmetic. Only by your own choices.'
        ]
      },
      {
        id: 'requirements', title: 'Requirements',
        flavor: 'Rules are rules, mostly because somebody wrote them down in a binder.',
        tldr: 'Some employees must sit somewhere specific. Execute stays locked until every requirement is met.',
        eli5: 'Some kids need the chair by the door. You must give them that chair before the game lets you move on.',
        body: [
          {
            table: [
              ['Requirement', 'What it means'],
              ['Private office', 'Must sit in an enclosed {{private office}}.'],
              ['Reception desk', 'Must sit at the front desk. Only the {{receptionist}} may use it.'],
              ['Near a Phone Room', 'Must sit within a short walk of a phone room.'],
              ['Adjacent to manager', 'Must sit right beside their manager ({{adjacency}}). See [[org]].'],
              ['Adjacent to a teammate', 'Must sit right beside someone on their team.'],
              ['Ground floor', 'Must sit on a {{ground floor}}.'],
              ['Same floor as manager', 'Must be on the same level as their manager.'],
              ['Same building as boss', 'Must be somewhere in their boss\'s building.'],
              ['Industry room', 'Must work in a specialty room such as a Server Room or Vault. See [[clients]].']
            ]
          },
          { h: 'How the game helps' },
          {
            ul: [
              'An employee\'s card lists each requirement and turns it green when it is met.',
              'Invalid seats are refused with a short explanation.',
              'Phone rooms are shared and cannot be assigned. Specialty rooms accept only their specialists.'
            ]
          }
        ]
      },
      {
        id: 'preferences', title: 'Preferences',
        flavor: 'Optional wishes, delivered with the confidence of someone who has never been told no.',
        tldr: 'Every employee has one preference. Meeting it raises Satisfaction and your star rating.',
        eli5: 'Every kid has a favorite kind of chair. If they get it, they smile. Smiles are points.',
        body: () => [
          'Preferences are never required, but they decide your [[ratings|rating]]. Anyone left unseated counts as unsatisfied.',
          { table: [['Preference', 'Met when...'], ...Object.keys(PREF_LABELS).map((k) => [PREF_LABELS[k], WIKI_PREF_NOTES[k]])] },
          { note: 'Departments have habits. Engineering likes a {{quiet room}}; Sales likes company. See [[departments]].' }
        ]
      },
      {
        id: 'floorplans', title: 'Floor Plans & Rooms',
        flavor: 'Every floor is {{procedural generation|procedurally generated}}, so no two are alike, like snowflakes with more cubicles.',
        tldr: 'Floors are built from the job\'s {{seed}} and contain offices, open seating, shared rooms and corridors.',
        eli5: 'A floor plan is a map of a building seen from above. Rooms are boxes. Hallways are the roads between them.',
        body: [
          { h: 'Rooms' },
          {
            table: [
              ['Room', 'Purpose'],
              ['Private Office', 'Enclosed room for people who need one.'],
              ['Open Seating', 'Shared rooms of desks in an {{open-plan office}}. Not quite {{hot-desking}}: each desk still gets a name.'],
              ['Reception', 'Front desk by the entrance.'],
              ['Phone Room', 'Small booth for calls. Shared and not assignable.'],
              ['Break Room, Lounge, Cafe', 'Social spaces that satisfy "near a break area" preferences.'],
              ['Restrooms, Huddle, Copy / Print, Storage', 'Fill leftover space with no assignable desks. A {{huddle room}} is for quick chats, not for living in.'],
              ['Industry rooms', 'Server Room, Vault, Laboratory and friends. See [[clients]].']
            ]
          },
          { h: 'Corridors' },
          '{{circulation|Primary pathways}} are the main hallways. Secondary pathways branch off them to reach doors. Movers walk only on these. See [[movers]].',
          { h: 'Many floors, many buildings' },
          'Bigger jobs spread across several floors and buildings, forming a {{campus}}. Upper floors have no front door, so they use elevators and stairs instead. Windows line the outer walls, which matters to people who like {{daylighting}}. Square structural columns are built into the exterior wall at a regular spacing, the same on every floor of a building.',
          { h: 'Time of day' },
          'Every job has a time of day (Morning, Noon, Evening or Night), shown in its briefing. It only changes the lighting: sunbeams through the windows by day, ceiling lights at night. It has no effect on gameplay.'
        ]
      },
      {
        id: 'views', title: 'Views & Controls',
        flavor: 'Zoom in for details. Zoom out for existential dread.',
        tldr: 'Drag to pan, scroll or pinch to zoom, use the floor bar to switch floors, View All for the campus, and the chart button for Analyze.',
        eli5: 'Slide the map around, pinch it to make it big or small, and tap the buttons on top to peek at other floors.',
        body: [
          {
            ul: [
              '**Pan and zoom:** drag the map, scroll or pinch, or use the plus and minus buttons.',
              '**Floor bar:** appears above the map on multi-floor jobs. Pick a building and floor.',
              '**View All (buildings):** stacks every building in an {{isometric projection}}. Press the second View All to flatten it overhead.',
              '**View All (floors):** shows every floor of one building side by side.',
              '**Analyze (chart button):** dims the plans and charts each floor: seat {{utilization}} for Open Seating and Offices, plus a pie of employees by department. Handy as a poor man\'s {{stacking plan}}.',
              '**Legend:** explains the colors and symbols on the map. Think of it as light {{wayfinding}}.',
              '**Pin (employee card):** docks the card beside the map so it stays put.',
              '**Speed (during Execute):** cycles 1x, 2x, 4x and 8x.'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'people', icon: '👥', name: 'People',
    pages: [
      {
        id: 'departments', title: 'Departments',
        flavor: 'Thirteen departments, one shared fridge, zero agreement on the thermostat.',
        tldr: 'Employees belong to departments and teams. Each department leans toward certain kinds of seats.',
        eli5: 'Departments are clubs. Each club has a color and likes certain chairs.',
        body: () => [
          'Smaller jobs use fewer departments. Colors on tokens and the Analyze pie show which department someone belongs to. Teams are smaller groups inside a department.',
          {
            table: [
              ['Department', 'Tends to like'],
              ...Object.entries(DEPTS).filter(([k]) => k !== 'exec').map(([, d]) => [d.label,
                wikiList(Object.entries(d.prefs).filter(([, w]) => w >= 3).sort((a, b) => b[1] - a[1]).map(([k]) => WIKI_PREF_SHORT[k]))])
            ]
          },
          { note: 'Tendencies are only odds. Any employee might still surprise you. See [[preferences]].' }
        ]
      },
      {
        id: 'org', title: 'Ranks & the Org Chart',
        flavor: 'Somebody has to be in charge. Usually it is whoever has the window.',
        tldr: 'Ranks run from Executive down to Staff. The org chart shows who reports to whom, which matters for adjacency requirements.',
        eli5: 'The org chart is a family tree for the office. Bosses are on top, and some people must sit next to their boss.',
        body: [
          {
            table: [
              ['Rank', 'Ring color on token'],
              ['Executive', 'Amber'], ['President', 'Rose'], ['Vice President', 'Violet'], ['Director', 'Blue'], ['Manager', 'Dark slate'], ['Staff', 'No ring']
            ]
          },
          'The {{org chart}} is a tree. The top of it is the {{c-suite}}: CEO, COO, CFO, CTO and CMO. Every other leader has a {{span of control|team to supervise}} and a {{reporting line}} up the chart.',
          { h: 'Why it matters' },
          'Requirements such as "adjacent to manager" or "same building as boss" follow reporting lines, so seat leaders early. See [[requirements]].'
        ]
      }
    ]
  },
  {
    id: 'execution', icon: '🚚', name: 'Execution',
    pages: [
      {
        id: 'execution', title: 'The Execute Phase',
        flavor: 'Press the big button. Nothing can possibly go wrong (see Fragile Goods).',
        tldr: 'After Execute, Movers carry every object to its desk and then employees arrive and react. You watch.',
        eli5: 'The moving crew carries everyone\'s stuff to the new desks while you sit back and cheer them on.',
        body: () => [
          { h: 'Stages' },
          {
            ol: [
              'A confirmation shows your meters and expected payout. Planning ends here.',
              '**Moving:** Movers appear, fetch objects from the truck, walk to desks and set them down.',
              '**Feedback:** employees arrive, take their seats and react.',
              'A celebration summary appears, followed by your results.'
            ]
          },
          'A status bar at the bottom shows both stages. Open its task log to follow each delivery. The clock no longer matters once you press Execute.',
          { h: 'Cargo' },
          'Every employee brings boxes. Heavier jobs add plants, computers and furniture. {{ff&e}} takes time to place: that is its {{deployment}} time.',
          { table: [['Object', 'Deploy time'], ...Object.values(OBJECT_TYPES).map((o) => [`${o.emoji} ${o.name}`, `${o.secs}s`])] },
          'A job\'s cargo level is shown in its briefing as Light, Moderate, Heavy or Brutal.'
        ]
      },
      {
        id: 'movers', title: 'Movers & Entrances',
        flavor: 'Hard hats, harder schedules, and an unwavering belief that the couch will fit.',
        tldr: 'Movers come in at the loading dock (or the main entrance), ride lifts to upper floors, walk only on pathways, fetch each object from the truck, place it and return.',
        eli5: 'Movers are the helpers. They pick up a box, take the elevator if the desk is upstairs, put it on the right desk, then go back to the truck for more.',
        body: () => [
          { h: 'Where Movers start' },
          {
            table: [
              ['Entrance', 'Used when'],
              ['Loading Dock', 'Ground floor, in some buildings (mostly multi-storey ones). A walled {{loading dock}} room with the company truck in the middle. Without one, Movers use the main entrance.'],
              ['Cargo Elevator', 'Movers carrying an object ride it up. Most often built into the loading dock room.'],
              ['Service Elevator', 'Movers ride it back down, empty-handed. A {{service elevator}} (or {{freight elevator}}).'],
              ['Public Elevator', 'Employees use it to reach upper floors.'],
              ['Stairs', 'Everyone climbs them instead when the No Elevators modifier is on.']
            ]
          },
          { h: 'Elevators' },
          'Each building runs its own cars on a timed schedule: they travel between floors, open their doors, and take whoever is waiting. A pawn counts as 1 unit and each object it carries adds its weight (plants 0.5, boxes and computers 1, furniture 2). Movers wait their turn at the pad.',
          { table: [['Car', 'Capacity', 'Per floor'], ...Object.values(ELEVATORS).sort((a, b) => b.cap - a.cap).map((e) => [e.name, String(e.cap), `${e.floorSecs}s`])] },
          { h: 'How they work' },
          {
            ul: [
              'Movers stay on primary and secondary pathways. They may enter only the room they are delivering to, or the one they start in.',
              'Pawns keep to the right-hand side of a pathway and keep their distance from each other, bunching loosely when they wait.',
              'A crew works each floor at once. Up to six Movers per floor, never more than there are objects, with Robo-Loader and vehicles adding more.',
              'Each object means a trip to the truck. That pickup takes 15 seconds, and a Rainstorm makes it 25% longer.',
              'Employees arrive in a random order, not in desk order. If you planned in the evening or at night, day breaks before they arrive.',
              'Two Movers never work the same desk at once.',
              '{{throughput}} improves with the Speed upgrade and hires. See [[upgrades]] and [[hires]].'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'money', icon: '💰', name: 'Money',
    pages: [
      {
        id: 'payouts', title: 'Rewards & Payouts',
        flavor: 'Show me the money. Preferably itemized.',
        tldr: 'You earn a flat fee per employee, scaled by difficulty and modifiers, plus two bonuses worth a quarter each.',
        eli5: 'You get coins for every person you move. Be quick and make people happy, and you get extra coins.',
        body: () => [
          { table: [
            ['Line', 'How it works'],
            ['Completion', `${money(CFG.rewardPerEmployee)} per employee.`],
            ['Difficulty', 'The job\'s {{difficulty multiplier}}, from x0.8 on Chill to x3 on Expert.'],
            ['Modifiers', `+${Math.round(MODIFIER_PAY * 100)}% of the completion fee for each active modifier. See [[modifiers]].`],
            ['Company', 'Extra pay from the Capacity upgrade and your uniforms. See [[upgrades]].'],
            ['First clear', 'Campaign missions pay half again the first time you finish them.']
          ] },
          { h: 'Bonuses' },
          {
            ul: [
              '**Fast Planning:** press Execute while at least a quarter of the {{time limit}} remains. The Headcount upgrade and The Hero stretch this window. Untimed jobs have no Fast Planning bonus.',
              '**Satisfaction:** finish with Satisfaction at or above the goal. See [[ratings]].',
              'Each bonus is a quarter of the subtotal. Careful Carl makes them a little larger.'
            ]
          },
          { h: 'Adjustments' },
          {
            ul: [
              '**Enable All:** switching on every modifier at once doubles the entire payout.',
              '**Breakage:** with Fragile Goods, every smashed object is deducted from the payout.'
            ]
          },
          { note: 'The briefing before a job lists all of these, itemized, so there are no surprises.' }
        ]
      },
      {
        id: 'ratings', title: 'Satisfaction & Star Ratings',
        flavor: 'Five stars: a perfect move. One star: a "learning experience".',
        tldr: 'Satisfaction is the share of employees whose preference is met. Stars fall as it falls, down to a minimum of one.',
        eli5: 'Each happy kid is a point. More happy kids means more stars.',
        body: () => [
          'Satisfaction = preferences met divided by total employees. It is a {{kpi}} the whole game revolves around. Rating = 5 minus four times the unmet share, never below one star. A failed job scores zero.',
          { h: 'Goals' },
          'Each job has a Satisfaction goal for the bonus. Campaign goals begin at 50% and rise 4% per mission.',
          { table: [['Contract', 'Goal'], ...RANDOM_TIERS.map((t) => [`${t.icon} ${t.name}`, `${Math.round(t.satGoal * 100)}%`])] },
          'Angry Boss raises the goal by 10%. The Diligence upgrade lowers it.',
          { h: 'Company Rating' },
          'Your Company Rating is the average of every completed job\'s stars.'
        ]
      },
      {
        id: 'upgrades', title: 'Upgrades',
        flavor: 'Invest in your crew. Or buy a nicer clipboard. Both are probably tax-deductible.',
        tldr: 'Five permanent upgrades, each leveling from 1 to 10 for a rising price.',
        eli5: 'Spend your coins on power-ups that make every future job easier.',
        body: () => [
          `Level 1 gives nothing. Each level adds an equal step up to level ${MAX_UPGRADE_LEVEL}. A level costs the upgrade\'s base price times the level you are on.`,
          { table: [['Upgrade', 'What it does', 'Base price', `Level ${MAX_UPGRADE_LEVEL}`],
            ...UPGRADES.map((u) => [`${u.icon} ${u.name}`, u.desc, money(u.base), u.now(MAX_UPGRADE_LEVEL - 1)])] }
        ]
      },
      {
        id: 'hires', title: 'Specialty Hires',
        flavor: 'Resumes that actually read like superhero origin stories.',
        tldr: 'Eight special crew members, each unlocked by finishing a campaign mission. Their perks apply automatically.',
        eli5: 'Special helpers join your team and give you superpowers.',
        body: () => [
          'Hire number N unlocks when you complete campaign mission N. See [[campaign]].',
          { table: [['Hire', 'Perk'], ...HIRES.map((x) => [`${x[0]} ${x[1]}`, x[2]])] }
        ]
      },
      {
        id: 'unlocks', title: 'Unlocks & Branding',
        flavor: 'Because every empire needs a logo and a slightly too-nice van.',
        tldr: 'Each campaign mission unlocks one item per category: hire, client, modifier, uniform and vehicle.',
        eli5: 'Finish a level, get a prize in every box.',
        body: [
          {
            ul: [
              '**Hires, clients, modifiers:** see [[hires]], [[clients]] and [[modifiers]].',
              '**Uniforms:** each one after the first adds +1% to job payouts.',
              '**Vehicles:** every second vehicle adds one more Mover per floor.',
              '**Company:** you can rename it and pick a logo shape and font from Branding.'
            ]
          },
          'A "New Unlocks" badge appears on the menu after you earn something. The Unlocks screen shows what is locked and which mission opens it.'
        ]
      }
    ]
  },
  {
    id: 'jobs', icon: '📑', name: 'Jobs',
    pages: [
      {
        id: 'campaign', title: 'Campaign Missions',
        flavor: 'Eight missions. Eight chances to learn that "it is just a quick move" is never true.',
        tldr: 'Curated missions that rise in difficulty. Each is locked until the one before it is done.',
        eli5: 'The story levels. Beat one to open the next.',
        body: () => [
          'Campaign missions are fixed: same people, same floors every time. They never carry modifiers.',
          { table: [['Mission', 'Client type', 'Crew', 'Time', 'Reward'],
            ...CAMPAIGN.map((j) => [`${j.icon} ${j.name}`, industryOf(j).name, String(j.employees), wikiMins(j.timeLimit), `x${j.rewardMult}`])] },
          'The first time you complete a mission, you unlock one item in every category and earn a first-clear bonus. See [[unlocks]] and [[payouts]].'
        ]
      },
      {
        id: 'random', title: 'Random Jobs',
        flavor: 'The same job, but with different people, a different building and a different excuse.',
        tldr: 'Endless contracts in five sizes. Harder tiers are bigger, faster and pay more.',
        eli5: 'Pick small, medium or huge. The game makes up a new office every time.',
        body: () => [
          { table: [['Contract', 'Crew', 'Time limit', 'Reward'],
            ...RANDOM_TIERS.map((t) => [`${t.icon} ${t.name}`, `${t.people[0]}-${t.people[1]}`, t.slack ? `${t.slack}x the average time to place everyone` : 'Untimed', `x${t.rewardMult}`])] },
          { h: 'Good to know' },
          {
            ul: [
              'Press the reroll button in a briefing to roll a different job of the same size.',
              'Random jobs may roll modifiers from the ones you have unlocked. See [[modifiers]].',
              'Pausing keeps one random job and one campaign job. See [[saves]].',
              'Bigger jobs stretch over several floors and buildings, as a {{campus}}.'
            ]
          }
        ]
      },
      {
        id: 'modifiers', title: 'Job Modifiers',
        flavor: 'Each is a {{rider}} on your contract. Terms and conditions do apply.',
        tldr: 'Optional hazards on Random Jobs. Each pays +10%, and each has a counter in upgrades or hires.',
        eli5: 'Modifiers are extra rules that make the game harder in exchange for more coins.',
        body: () => [
          'Modifiers unlock one at a time through the campaign. In a random briefing you can switch on Enable All for double the payout. Campaign missions never use them.',
          { table: [['Modifier', 'Effect', 'Counter'], ...MODIFIERS.map((m) => [`${m.icon} ${m.name}`, m.desc, RIDER_COUNTERS[m.id] === 'TBD' ? 'None yet' : RIDER_COUNTERS[m.id]])] }
        ]
      },
      {
        id: 'clients', title: 'Clients & Industry Rooms',
        flavor: 'Do not ask what Faceplant.io actually does. Nobody knows. Not even Faceplant.io.',
        tldr: 'Each client type brings its own specialty rooms and staff who must work in them.',
        eli5: 'A hospital needs exam rooms, and a bank needs a vault. The game puts those rooms in.',
        body: () => [
          { table: [['Client type', 'Rooms'], ...Object.values(INDUSTRIES).map((c) => [`${c.icon} ${c.name}`, Object.entries(c.rooms).map(([t, n]) => `${SPECIAL_ROOMS[t].name}${n > 1 ? ` x${n}` : ''}`).join(', ')])] },
          'Staff for an industry room carry the matching [[requirements|requirement]]. Everyone else is kept out.',
          { h: 'Rooms' },
          { table: [['Room', 'Seats'], ...Object.values(SPECIAL_ROOMS).filter((r) => r.seats).map((r) => [r.name, String(r.seats)])] },
          'Each client has a parody name for flavor, and a short description to match. A {{clean room}} is one of the fancier ones.'
        ]
      }
    ]
  },
  {
    id: 'ref', icon: '📚', name: 'Reference',
    pages: [
      {
        id: 'saves', title: 'Saves, Pausing & Settings',
        flavor: 'Your company\'s memories, stored safely in a browser tab. What could go wrong?',
        tldr: 'Three save slots live in your browser. Pause any job and resume it exactly as you left it.',
        eli5: 'The game remembers where you stopped. Close it, come back later and keep going.',
        body: [
          { h: 'Saves' },
          'Progress is stored on this device in this browser. Clearing the browser\'s site data erases it.',
          { h: 'Pausing' },
          'The Main Menu button pauses a job, with seats and clock intact. One paused job of each type (Campaign and Random) is kept. Abort Job ends it for good.',
          { h: 'Settings' },
          { ul: ['Dark Mode', 'Roster on Right', 'Particle Effects', 'Sound Effects and Volume', 'Replay Tutorials', 'Switch Account'] }
        ]
      },
      {
        id: 'tips', title: 'Tips & Tricks',
        flavor: 'Hard-won wisdom from people who have moved a lot of desks.',
        tldr: 'Seat the picky ones first, keep teams together, and press Execute early.',
        eli5: 'Help the kids who need special chairs first. Then everyone else.',
        body: [
          {
            ul: [
              'Seat anyone with a [[requirements|requirement]] before anything else.',
              'Seat managers early. Their reports may need to sit near them.',
              'Use the org chart to keep teams in the same room for team-loving departments.',
              'Check [[departments]] to guess who will want quiet and who will want company.',
              'Use Analyze to spot empty rooms and lopsided departments.',
              'Fast Planning is only a bonus. Do not trade a happy floor for a few spare seconds.',
              'Read the briefing\'s modifiers and plan upgrades to counter them. See [[modifiers]].',
              'Never put the person who hums in the {{quiet room}}.'
            ]
          }
        ]
      },
      {
        id: 'glossary', title: 'Glossary',
        flavor: 'Words you may hear in a conference room, defined for people who skipped the meeting.',
        tldr: 'Every underlined term in this wiki, alphabetized.',
        eli5: 'A dictionary of big words, with small explanations.',
        body: () => [
          { table: [['Term', 'Definition'], ...Object.keys(WIKI_GLOSSARY).sort().map((k) => [({ 'ff&e': 'FF&E', kpi: 'KPI', 'c-suite': 'C-suite' })[k] || k[0].toUpperCase() + k.slice(1), WIKI_GLOSSARY[k]])] }
        ]
      }
    ]
  }
];
