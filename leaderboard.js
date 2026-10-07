/** Private Leaderboards: the player's company ranked against a fixed, fictional field of rival movers. Nothing leaves this device. */
const Leaderboard = (() => {
  const RIVALS = [
    'Box Office Movers', 'Desk Jockeys Inc.', 'Sofa So Good', 'Lift & Shift', 'Two Men and a Truckload', 'Cubicle Crushers', 'Move It or Lose It',
    'Pack Mules LLC', 'Crate Expectations', 'Dolly Parton Relocation', 'Stack & Roll', 'Hand Trucks United', 'The Furniture Whisperers',
    'Bubble Wrap Brigade', 'Rolling Stonemovers', 'Ctrl+Alt+Relocate', 'Haul of Fame', 'Piano Drop Partners', 'Mover & Shaker Co.',
    'Elevator Pitch Logistics', 'Tape Gun Associates', 'Boxed Out', 'Shift Happens', 'Lug Nut Logistics', 'Cardboard Kings',
    'Plant Parents Moving', 'Chair Apparent', 'Open Plan Pioneers', 'Pallet Town Movers', 'Hump Day Haulers', 'Truckin\u2019 Along',
    'Roll Models Relocation', 'Fork & Lift', 'Lateral Moves LLC', 'Back Pain & Associates', 'Wheelie Good Movers', 'Stairway to Heaven Haulage',
    'Fragile: Handle With Care', 'Sticky Note Logistics'
  ];

  // Fixed field: same rivals and numbers on every visit. Stats fall off geometrically so the bottom is reachable and the top is not.
  const buildField = () => {
    let s = 20260101;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const n = RIVALS.length;
    const rivals = RIVALS.map((name, i) => {
      const done = Math.max(2, Math.round(2400 * Math.pow(0.84, i) * (0.88 + rnd() * 0.24)));
      const failed = Math.round(done * rnd() * 0.08);
      const rating = Math.min(4.9, Math.max(2.4, 4.9 - (i / n) * 1.8 * rnd() - rnd() * 0.5));
      return { name, shape: SHAPES[i % SHAPES.length], font: FONTS[i % FONTS.length][1], done, total: done + failed, rating, earned: Math.round(done * (700 + rnd() * 3800)) };
    });
    return [{ name: 'TeeJays', shape: '👑', font: 'var(--font-stack)', done: 12345, total: 12345, rating: 5, earned: 2718281828, top: true }, ...rivals];
  };
  let fieldCache = null;
  const field = () => (fieldCache ||= buildField());

  const METRICS = [['done', 'Job Completions'], ['earned', 'Total Earned']];
  const num = (n) => n.toLocaleString();

  function playerEntry() {
    const d = Save.active;
    const history = d.jobHistory;
    return {
      name: d.name, shape: d.shape, font: d.font, you: true,
      done: history.filter((j) => !j.failed).length, total: history.length, rating: Save.companyRating(d),
      earned: history.reduce((t, j) => t + (j.earned || 0), 0)
    };
  }

  function open() {
    let metric = 'done';
    const me = playerEntry();
    const ranked = () => [...field(), me].sort((a, b) => b[metric] - a[metric] || (a.you ? 1 : 0) - (b.you ? 1 : 0) || a.name.localeCompare(b.name));

    const list = h('div', { class: 'lb-list' });
    const foot = h('div', { class: 'lb-foot' });
    const tabs = h('div', { class: 'lb-tabs', role: 'tablist' });
    let meRow = null;

    const row = (e, rank, extra = '') => {
      const medal = ['🥇', '🥈', '🥉'][rank - 1];
      return h('div', { class: `lb-row${e.you ? ' you' : ''}${e.top ? ' top' : ''}${extra}` },
        h('span', { class: 'lb-rank' }, medal || `#${rank}`),
        h('span', { class: 'lb-co' }, h('span', { class: 'lb-logo' }, e.shape),
          h('span', { class: 'lb-name', style: `font-family:${e.font}` }, e.name), e.you ? h('span', { class: 'lb-you' }, 'YOU') : null),
        h('span', { class: 'lb-rate' }, stars(e.rating), ` (${num(e.total)})`),
        h('span', { class: `lb-val${metric === 'done' ? ' sorted' : ''}` }, num(e.done)),
        h('span', { class: `lb-val${metric === 'earned' ? ' sorted' : ''}` }, money(e.earned)));
    };

    function render() {
      const order = ranked();
      const myRank = order.indexOf(me) + 1;
      list.replaceChildren(...order.map((e, i) => { const r = row(e, i + 1); if (e.you) meRow = r; return r; }));
      tabs.replaceChildren(h('span', { class: 'lb-sortlabel' }, 'Sort by'), ...METRICS.map(([k, label]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(k === metric), class: `squircle lb-tab${k === metric ? ' on' : ''}`,
        onclick: () => { metric = k; render(); list.scrollTop = 0; }
      }, label)));
      foot.replaceChildren(row(me, myRank), h('button', {
        type: 'button', class: 'squircle lb-find', 'aria-label': 'Find my company in the ranking', title: 'Find my company in the ranking',
        onclick: () => {
          meRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
          meRow.classList.remove('flash');
          void meRow.offsetWidth;
          meRow.classList.add('flash');
        }
      }, '🔍'));
    }

    const head = h('div', { class: 'lb-row lb-head' },
      h('span', { class: 'lb-rank' }, 'Rank'), h('span', { class: 'lb-co' }, 'Company'), h('span', { class: 'lb-rate' }, 'Rating'),
      h('span', { class: 'lb-val' }, 'Jobs Done'), h('span', { class: 'lb-val' }, 'Total Earned'));

    Modal.show({
      title: '🏆 Leaderboard',
      cls: 'board',
      content: h('div', { class: 'lb-layout' },
        h('p', { class: 'lb-sub' }, 'Private to this device: you versus a field of fictional rivals.'), tabs, head, list, foot)
    });
    render();
  }

  return { open };
})();
