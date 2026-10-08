/** Menus, save/company flow, modals, tutorials and settings. Screens are rebuilt on every show(). */
const SHAPES = ['🔺', '🔵', '🟩', '⭐', '🔶', '🟪'];
const FONTS = [
  ['Modern', 'var(--font-stack)'], ['Code', 'monospace'], ['Classic', 'Georgia, serif'],
  ['Casual', "'Comic Sans MS', cursive"], ['Bold', 'Impact, sans-serif'], ['Type', "'Courier New', monospace"]
];
const UNIFORMS = ['👕', '🦺', '👔', '🥋', '👚', '🥼', '🧥', '👘'];
const VEHICLES = ['🚚', '🚐', '🚙', '🚛', '🏎️', '🚜', '🚲', '🛴'];

const roomList = (rooms) => Object.entries(rooms).map(([t, n]) => `${SPECIAL_ROOMS[t].name}${n > 1 ? ` x${n}` : ''}`).join(', ');
const UNLOCK_CATEGORIES = [
  { id: 'hires', icon: '👷', name: 'Specialty Hires', color: '#3b82f6', intro: ['Unlocked here, hired per job.', 'Choose any of them on a job\u2019s briefing. Each costs a share of that job\u2019s reward, is paid from the payout, and is back for the next job.'], items: HIRES },
  { id: 'clients', icon: '🏢', name: 'Client Types', color: '#8b5cf6',
    items: Object.values(INDUSTRIES).map((c) => [c.icon, c.name, `Random contracts can come from this client (${roomList(c.rooms)}).`]) },
  { id: 'modifiers', icon: '🎲', name: 'Job Modifiers', color: '#f59e0b', intro: ['Optional modifiers on Random Jobs.', 'Each modifier affects total payout by +10% each.'],
    items: MODIFIERS.map((m) => [m.icon, m.name, [m.desc, `Countered by: ${RIDER_COUNTERS[m.id]}.`]]) },
  { id: 'uniforms', icon: '👕', name: 'Uniforms', color: '#22c55e', items: UNIFORMS.map((i, n) => [i, `Uniform ${n + 1}`, n ? 'Brand reputation: +1% job payout.' : 'Starter uniform.']) },
  { id: 'vehicles', icon: '🚚', name: 'Vehicles', color: '#f97316', items: VEHICLES.map((i, n) => [i, `Vehicle ${n + 1}`, n === 0 ? 'Starter vehicle.' : n % 2 ? '+1 Mover per floor.' : 'Fleet expansion: the next vehicle adds a Mover.']) }
];

// ---------- DOM helper ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const stars = (n) => (n == null ? '--' : Math.round(n) > 0 ? '⭐'.repeat(Math.round(n)) : '0 ⭐');
const money = (n) => `$${Math.round(n).toLocaleString()}`;

// ---------- Settings ----------
const Settings = (() => {
  const KEY = 'moveflow.settings';
  const data = { dark: false, sfx: true, particles: true, volume: 0.5, lefty: false };
  try { Object.assign(data, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* defaults */ }

  function apply() {
    document.documentElement.classList.toggle('dark', data.dark);
    document.body.classList.toggle('lefty', data.lefty);
    FX.cfg.muted = !data.sfx;
    FX.cfg.particles = data.particles;
    FX.cfg.masterVolume = data.volume;
    const mute = document.getElementById('mute-btn');
    if (mute) { mute.classList.toggle('off', !data.sfx); mute.setAttribute('aria-pressed', String(!data.sfx)); mute.title = data.sfx ? 'Sound on' : 'Sound off'; }
  }
  function set(k, v) {
    data[k] = v;
    localStorage.setItem(KEY, JSON.stringify(data));
    apply();
  }
  return { data, apply, set };
})();

// ---------- Tooltips: appear instantly on hover or click (native titles wait too long) ----------
const Tip = (() => {
  let box = null;
  let pinned = null;
  const hide = () => { box?.remove(); box = null; pinned = null; };
  function show(el, text) {
    box?.remove();
    box = h('div', { class: 'tip' }, text);
    document.body.append(box);
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left + r.width / 2 - box.offsetWidth / 2, window.innerWidth - box.offsetWidth - 8));
    const above = r.top - box.offsetHeight - 8;
    box.style.left = `${x}px`;
    box.style.top = `${above > 8 ? above : r.bottom + 8}px`;
  }
  function attach(el, text) {
    el.addEventListener('mouseenter', () => { if (!pinned) show(el, text); });
    el.addEventListener('mouseleave', () => { if (!pinned) hide(); });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pinned === el) { hide(); return; }
      show(el, text);
      pinned = el;
    });
  }
  document.addEventListener('click', hide);
  return { attach, hide };
})();

// ---------- Modals ----------
const Modal = (() => {
  function show({ title, content, wide = false, cls = '', corner = null, scroll = false, onClose }) {
    const close = () => { overlay.remove(); Tip.hide(); onClose?.(); };
    const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
      h('div', { class: `modal${wide ? ' wide' : ''}${cls ? ` ${cls}` : ''}` },
        h('button', { class: 'modal-close', 'aria-label': 'Close', onclick: close }, '✕'),
        corner,
        title ? h('h3', {}, title) : null,
        h('div', { class: `modal-content${scroll ? ' always-scroll' : ''}` }, content)));
    document.getElementById('modal-root').append(overlay);
    return close;
  }

  function confirm({ title, message, confirmText = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      let close;
      const done = (v) => { resolve(v); close(); };
      close = show({
        title, onClose: () => resolve(false),
        content: h('div', {},
          h('p', {}, message),
          h('div', { class: 'row' },
            h('button', { class: 'squircle', onclick: () => done(false) }, 'Cancel'),
            h('button', { class: `squircle ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, confirmText)))
      });
    });
  }

  function notice(title, message) {
    let close;
    close = show({ title, content: h('div', {}, h('p', {}, message), h('button', { class: 'squircle primary', onclick: () => close() }, 'OK')) });
  }
  return { show, confirm, notice };
})();

// ---------- Tutorial popups ----------
// Steps: { target: CSS selector (optional), text }
const Tutorial = (() => {
  let layer = null;
  let steps = [];
  let idx = 0;
  let onDone = null;
  let spot, bubble, text, next;

  function end() {
    layer?.remove();
    layer = null;
    const cb = onDone;
    onDone = null;
    cb?.();
  }

  function place(r) {
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    let x = (W - bw) / 2;
    let y = (H - bh) / 2;
    if (r) {
      const cx = clamp(r.left + r.width / 2 - bw / 2, 8, W - bw - 8);
      if (r.bottom + bh + 20 < H) { x = cx; y = r.bottom + 16; }
      else if (r.top - bh - 20 > 0) { x = cx; y = r.top - bh - 16; }
      else if (r.left - bw - 20 > 0) { x = r.left - bw - 16; y = clamp(r.top + r.height / 2 - bh / 2, 8, H - bh - 8); }
      else if (r.right + bw + 20 < W) { x = r.right + 16; y = clamp(r.top + r.height / 2 - bh / 2, 8, H - bh - 8); }
    }
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }

  function render() {
    const s = steps[idx];
    if (!s) { end(); return; }
    const t = s.target ? document.querySelector(s.target) : null;
    const r = t ? t.getBoundingClientRect() : null;
    layer.classList.toggle('dim', !r);
    spot.style.display = r ? 'block' : 'none';
    if (r) {
      const pad = 8;
      Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    }
    text.textContent = s.text;
    next.textContent = idx === steps.length - 1 ? 'GOT IT' : 'NEXT';
    place(r);
  }

  function run(list, done) {
    if (layer) end();
    steps = list;
    idx = 0;
    onDone = done || null;
    spot = h('div', { class: 'tut-spot' });
    text = h('p', {});
    next = h('button', { class: 'squircle action', onclick: () => { idx++; render(); } }, 'NEXT');
    bubble = h('div', { class: 'tut-bubble' }, text, next);
    const skip = steps.length > 1 ? h('button', { class: 'squircle tut-skip', onclick: end }, 'Skip All Tutorials') : null;
    layer = h('div', { id: 'tutorial' }, spot, bubble, skip);
    document.body.append(layer);
    render();
  }
  return { run, get active() { return !!layer; } };
})();

// ---------- Screen manager ----------
const UI = (() => {
  let draft = null; // company being created
  let current = null;

  function refresh() {
    if (document.body.classList.contains('playing')) { updateHud(); return; }
    if (current && current !== 'results') show(current);
  }

  function frame(title, bg, info) {
    const body = h('div', { class: 'frame-body' });
    const root = h('section', { class: `screen top bg-${bg}` },
      h('header', { class: 'frame-top' },
        h('button', { class: 'round', 'aria-label': 'Home', onclick: () => show('menu') }, '🏠'),
        h('h2', {}, title),
        info
          ? h('button', { class: 'round', 'aria-label': 'Info', onclick: () => Tutorial.run([{ target: '.frame-top h2', text: info }]) }, 'ℹ️')
          : h('span', { class: 'round-spacer' })),
      body);
    return { root, body };
  }

  const card = (props, ...kids) => h('div', { 'data-fx': 'click', role: 'button', tabindex: 0, ...props, class: `squircle card ${props.class || ''}` }, ...kids);

  const newBadge = () => h('span', { class: 'new-badge' }, 'New Unlocks!');

  // ----- Start / saves / creation -----
  function start() {
    return h('section', { class: 'screen start' },
      h('h1', { class: 'title-hero glossy' }, 'Move Flow'),
      h('div', { class: 'start-actions' },
        h('button', { class: 'squircle yellow big', type: 'button', onclick: howItWorks }, 'How It Works'),
        h('button', { class: 'squircle primary big', type: 'button', onclick: () => show('saves') }, 'Start')),
      h('div', { class: 'start-credit' }, 'Created by TJS7'));
  }

  function howItWorks() {
    const step = (icon, n, title, text) => h('div', { class: 'squircle how-step' },
      h('div', { class: 'how-icon', 'aria-hidden': 'true' }, icon), h('div', { class: 'how-num' }, n), h('h4', {}, title), h('p', {}, text));
    Modal.show({
      title: 'How It Works',
      wide: true,
      content: h('div', {},
        h('div', { class: 'how-cols' },
          step('📋', '1', 'Plan', 'Read each employee\u2019s requirements and preferences, then drag them onto desks across the floor plan before time runs out.'),
          step('✅', '2', 'Execute', 'Press Execute when everyone is seated. Movers deliver every object, then employees arrive and react. Meeting requirements and pleasing preferences earns stars, and finishing planning fast or beating the Satisfaction goal earns bonus rewards.'),
          step('💰', '3', 'Get Paid', 'Collect your reward, then spend your bank on upgrades and unlock new hires, clients and modifiers. Hire specialists for a job to counter the hazards modifiers add.')),
        h('div', { class: 'how-foot' },
          h('button', { class: 'squircle action how-link', type: 'button', onclick: () => Wiki.open() }, 'Learn More')))
    });
  }

  function slotCard(d, i) {
    const stats = h('div', { class: 'slot-stats' },
      h('span', {}, 'Jobs Completed: ', h('b', {}, d ? d.jobHistory.filter((j) => !j.failed).length : 0)),
      h('span', {}, 'Company Rating: ', h('b', {}, d ? stars(Save.companyRating(d)) : '--')),
      h('span', {}, 'Bank: ', h('b', {}, money(d ? d.bank : 0))));
    return card({ class: 'slot', onclick: () => openSlot(i) },
      h('div', { class: 'slot-num' }, `Slot ${i + 1}`),
      d ? h('button', {
        class: 'trash', 'aria-label': 'Delete company', 'data-fx': 'none',
        onclick: async (e) => {
          e.stopPropagation();
          if (await Modal.confirm({ title: 'Delete Company?', message: 'This permanently deletes the save file.', confirmText: 'Delete', danger: true })) { Save.remove(i); show('saves'); }
        }
      }, '🗑️') : null,
      d ? h('div', { class: 'slot-logo' }, d.shape) : null,
      h('div', { class: d ? 'slot-name' : 'empty', style: d ? `font-family:${d.font}` : '' }, d ? d.name : 'Empty'),
      stats);
  }

  function saves() {
    return h('section', { class: 'screen bg-blue' },
      h('h2', { class: 'screen-title' }, 'Select Company'),
      h('div', { class: 'slots' }, Save.slots().map((d, i) => slotCard(d, i))),
      h('button', { class: 'squircle', onclick: () => show('start') }, 'Back'));
  }

  function openSlot(i) {
    Save.select(i);
    if (Save.slots()[i]) { show('menu'); return; }
    draft = { slot: i, name: '', shape: SHAPES[0], font: FONTS[0][1] };
    show('register');
  }

  function register() {
    const input = h('input', { type: 'text', maxlength: 26, placeholder: 'Company Name', autocomplete: 'off', value: draft.name });
    const err = h('div', { class: 'error' });
    const next = () => {
      const name = input.value.trim();
      if (!name) { err.textContent = 'Please enter a company name.'; FX.play('error'); return; }
      draft.name = name;
      show('logo');
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') next(); });
    setTimeout(() => input.focus(), 50);
    return h('section', { class: 'screen bg-yellow' },
      h('h2', { class: 'screen-title' }, 'Company Registration'),
      h('p', { class: 'muted' }, 'Enter your new moving company name:'),
      input, err,
      h('div', { class: 'row' },
        h('button', { class: 'squircle', onclick: () => { Save.select(-1); show('saves'); } }, 'Cancel'),
        h('button', { class: 'squircle primary', onclick: next }, 'Next')));
  }

  function logo() {
    const pShape = h('div', { class: 'preview-shape' }, draft.shape);
    const pName = h('div', { class: 'preview-name', style: `font-family:${draft.font}` }, draft.name);
    const shapeBtns = SHAPES.map((s) => h('button', {
      class: `select-btn${s === draft.shape ? ' active' : ''}`,
      onclick: (e) => { draft.shape = s; pShape.textContent = s; mark(shapeBtns, e.currentTarget); }
    }, s));
    const fontBtns = FONTS.map(([label, f]) => h('button', {
      class: `select-btn font${f === draft.font ? ' active' : ''}`, style: `font-family:${f}`,
      onclick: (e) => { draft.font = f; pName.style.fontFamily = f; mark(fontBtns, e.currentTarget); }
    }, label));
    const mark = (list, el) => { list.forEach((b) => b.classList.toggle('active', b === el)); };
    return h('section', { class: 'screen bg-purple' },
      h('h2', { class: 'screen-title' }, 'Brand Design'),
      h('div', { class: 'logo-layout' },
        h('div', { class: 'squircle preview' }, h('small', {}, 'PREVIEW'), pShape, pName),
        h('div', { class: 'logo-pick' },
          h('div', { class: 'label' }, 'Shape'), h('div', { class: 'select-grid' }, shapeBtns),
          h('div', { class: 'label' }, 'Typography'), h('div', { class: 'select-grid' }, fontBtns))),
      h('div', { class: 'row' },
        h('button', { class: 'squircle', onclick: () => show('register') }, 'Back'),
        h('button', {
          class: 'squircle primary',
          onclick: () => { Save.create(draft.slot, draft); Save.select(draft.slot); show('brandingSetup'); }
        }, 'Save Logo')));
  }

  function brandingSetup() {
    const d = Save.active;
    const u = h('div', { class: 'big-icon' }, d.uniform);
    const v = h('div', { class: 'big-icon' }, d.vehicle);
    return h('section', { class: 'screen bg-yellow' },
      h('h2', { class: 'screen-title' }, 'Company Branding'),
      h('p', { class: 'muted' }, 'Choose your starting uniform and vehicle.'),
      h('div', { class: 'row' },
        card({ class: 'tile', onclick: () => pickBranding('uniform', () => { u.textContent = Save.active.uniform; }) }, u, 'Uniforms'),
        card({ class: 'tile', onclick: () => pickBranding('vehicle', () => { v.textContent = Save.active.vehicle; }) }, v, 'Vehicles')),
      h('button', { class: 'squircle primary', onclick: () => { show('menu'); } }, 'Continue'));
  }

  function pickBranding(kind, after) {
    const d = Save.active;
    const list = kind === 'uniform' ? UNIFORMS : VEHICLES;
    const catId = kind === 'uniform' ? 'uniforms' : 'vehicles';
    let close;
    const grid = h('div', { class: 'brand-grid' }, list.map((icon, i) => {
      const locked = !Save.isUnlocked(catId, i);
      return h('button', {
        class: `brand-option${d[kind] === icon ? ' picked' : ''}${locked ? ' locked' : ''}`, 'data-fx': locked ? 'error' : 'click',
        onclick: () => {
          if (locked) return;
          d[kind] = icon;
          Save.persist();
          close();
          after?.();
        }
      }, locked ? '🔒' : icon);
    }));
    close = Modal.show({ title: kind === 'uniform' ? 'Select Uniform' : 'Select Vehicle', content: grid });
  }

  // ----- Main menu -----
  function menu() {
    const d = Save.active;
    if (!d) return saves();
    const un = UNLOCK_CATEGORIES.reduce((n, c) => n + c.items.filter((_, i) => Save.isUnlocked(c.id, i)).length, 0);
    const tile = (id, icon, label, sub, fn, cls = '') => card({ id, class: `tile ${cls}`, onclick: fn }, h('div', { class: 'tile-icon' }, icon), h('b', {}, label), h('small', {}, sub));
    const root = h('section', { class: 'screen bg-green' },
      h('div', { class: 'menu' },
        h('h1', { class: 'title-hero menu-title' }, 'Move Flow'),
        h('div', { id: 'btn-company', class: 'company' },
          h('div', { class: 'company-side' },
            h('div', { class: 'stat' }, h('small', {}, 'RATING'), h('div', {}, stars(Save.companyRating(d)), ` (${d.jobHistory.length})`)),
            h('div', { class: 'stat' }, h('small', {}, 'BANK'), h('div', { id: 'menu-bank' }, money(d.bank)))),
          h('div', { class: 'company-id' },
            h('div', { class: 'slot-logo' }, d.shape),
            h('h2', { style: `font-family:${d.font}` }, d.name)),
          h('div', { class: 'company-side right' },
            h('div', { class: 'stat' }, h('small', {}, 'UNIFORM'), h('div', {}, d.uniform)),
            h('div', { class: 'stat' }, h('small', {}, 'VEHICLE'), h('div', {}, d.vehicle)))),
        h('div', { class: 'menu-row three' },
          tile('btn-campaign', '🗺️', 'Play Campaign', Save.pausedJob('campaign') ? `\u23F8 Paused: ${Save.pausedJob('campaign').job.name}` : `${d.completed.length}/${CAMPAIGN.length} Missions`, openCampaign),
          tile('btn-random', '🎲', 'Random Job', Save.pausedJob('random') ? `\u23F8 Paused: ${Save.pausedJob('random').job.name}` : 'Earn more money!', openRandom),
          tile('btn-history', '📋', 'Job History', `${d.jobHistory.filter((j) => !j.failed).length} Jobs Completed`, () => show('history'))),
        h('div', { class: 'menu-row three' },
          tile('btn-upgrades', '🏢', 'Upgrades', UPGRADES.map((u) => `${u.icon}\u2002${d.upgrades[u.key]}`).join('\u2002\u2002'), () => show('upgrades')),
          (() => {
            const t = tile('btn-unlocks', '🔓', 'Unlocks', `${un}/40 Granted`, () => show('unlocks'));
            if (d.unlocksMenuNew) t.append(newBadge());
            return t;
          })(),
          tile('btn-branding', '🎨', 'Branding', 'Uniforms, vehicles, name', () => show('branding')))),
      h('div', { class: 'row menu-foot' },
        h('button', { id: 'btn-leaderboards', class: 'squircle', onclick: () => Leaderboard.open() }, '🏆 Leaderboard'),
        h('button', { id: 'btn-settings', class: 'squircle', onclick: () => show('settings') }, '⚙️ Settings')));
    return root;
  }

  function menuTutorial() {
    if (Save.seenTutorial('menu')) return;
    Tutorial.run([
      { target: '#btn-company', text: 'This is your company: rating, bank balance, and branding at a glance.' },
      { target: '#btn-campaign', text: 'Tackle curated missions that increase in difficulty.' },
      { target: '#btn-random', text: 'Select randomized missions for endless replayability.' },
      { target: '#btn-history', text: 'Review past missions and budget performance.' },
      { target: '#btn-upgrades', text: 'Upgrade your crew with money earned from jobs.' },
      { target: '#btn-unlocks', text: 'View unlocked hires, clients, and branding options.' },
      { target: '#btn-branding', text: 'Change your uniform, vehicle, and company name.' },
      { target: '#btn-leaderboards', text: 'See how your company ranks against rival movers, by jobs done or total earned.' },
      { target: '#btn-settings', text: 'Adjust audio, effects, layout, and appearance.' }
    ], () => Save.markTutorial('menu'));
  }

  // ----- Jobs -----
  const kindLabel = (kind) => (kind === 'campaign' ? 'Campaign' : 'Random');

  function failureSummary(job) {
    return { failed: true, rating: 0, reward: 0, met: 0, total: 0, employees: job.employees };
  }

  // Continue or abort the paused job of this kind; resolves 'continue' | 'abort' | 'cancel'.
  function pausedPrompt(kind) {
    const snap = Save.pausedJob(kind);
    return new Promise((resolve) => {
      let close;
      const done = (v) => { resolve(v); close(); };
      close = Modal.show({
        title: `Paused ${kindLabel(kind)} Job`,
        onClose: () => resolve('cancel'),
        content: h('div', {},
          h('p', {}, h('b', {}, snap.job.name), ` is paused with ${snap.seats.length} of ${snap.job.employees} employees seated${snap.job.timeLimit ? ` and ${formatClock(snap.timeLeft)} left` : ''}.`),
          h('p', { class: 'warn' }, 'Aborting counts as a failed job: it is recorded as a failure in Job History and lowers your Company Rating.'),
          h('div', { class: 'row' },
            h('button', { class: 'squircle danger', onclick: () => done('abort') }, 'Abort Job'),
            h('button', { class: 'squircle primary', onclick: () => done('continue') }, 'Continue')))
      });
    });
  }

  // Returns true when the caller should go on to show its job list.
  async function handlePaused(kind) {
    const snap = Save.pausedJob(kind);
    if (!snap) return true;
    const choice = await pausedPrompt(kind);
    if (choice === 'continue') { startJob(snap.job, snap); return false; }
    if (choice !== 'abort') return false;
    Save.recordJob(snap.job, failureSummary(snap.job));
    Save.clearPaused(kind);
    show('menu');
    return true;
  }

  async function openCampaign() {
    if (!(await handlePaused('campaign'))) return;
    const d = Save.active;
    let close;
    const rows = CAMPAIGN.map((job, i) => {
      const done = d.completed.includes(job.id);
      const locked = i > 0 && !d.completed.includes(CAMPAIGN[i - 1].id);
      const plan = planCampus(job, job.employees);
      return h('button', {
        class: `list-row${done ? ' done' : ''}${locked ? ' locked' : ''}`, 'data-fx': locked ? 'error' : 'click',
        onclick: () => { if (locked) return; close(); briefing(job); }
      }, h('span', { class: 'row-icon' }, locked ? '🔒' : job.icon),
        h('span', { class: 'row-text' }, h('b', {}, job.name), h('small', {}, job.desc),
          h('small', {}, `${job.employees} employees \u00b7 ${plan.sites.length === 1 ? '1 building' : `${plan.sites.length} buildings`}, ${plan.floors.length} ${plan.floors.length === 1 ? 'floor' : 'floors'}${job.modIds.length ? ` \u00b7 ${job.modIds.length} modifier${job.modIds.length === 1 ? '' : 's'}` : ''}`)),
        done ? h('span', {}, '✅') : null);
    });
    close = Modal.show({ title: 'Campaign Missions', content: h('div', { class: 'list' }, rows) });
  }

  async function openRandom() {
    if (!(await handlePaused('random'))) return;
    let close;
    const campusOf = (n) => { const p = planCampus({}, n); return { b: p.sites.length, f: p.floors.length }; };
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const hours = (sec) => (sec >= 3600 ? plural(Math.round(sec / 3600), 'hour') : plural(Math.max(1, Math.round(sec / 60)), 'minute'));
    const rows = RANDOM_TIERS.map((t) => {
      const hi = campusOf(t.people[1]);
      const time = t.slack ? `Up to ${hours(tierTimeLimit(t, t.people[1]))}` : 'None';
      return h('button', {
        class: 'list-row', onclick: () => { close(); briefing(makeRandomJob(t)); }
      }, h('span', { class: 'row-icon' }, t.icon),
        h('span', { class: 'row-text' }, h('b', {}, t.name),
          h('small', {}, `${t.people[0]}-${t.people[1]} Employees`),
          h('small', {}, `Up to ${plural(hi.b, 'building')} across ${plural(hi.f, 'floor')}`),
          h('small', {}, `Time Limit: ${time}`)),
        h('span', { class: 'row-mult', title: 'Reward multiplier' }, h('small', {}, 'Reward'), h('b', {}, `\u00d7${t.rewardMult}`)));
    });
    close = Modal.show({
      title: 'Random Job',
      scroll: true,
      content: h('div', { class: 'list' }, h('p', { class: 'muted' }, 'Explore different floor plans and job opportunities across an infinite number of possibilities.'), rows)
    });
  }

  // `info` reopens the briefing for the running job: modifiers are read-only and the button just closes it.
  // Random Jobs get their modifiers rolled per reroll; the player can only switch them all on for double pay.
  function briefing(first, { info = false } = {}) {
    let close;
    let base = first;
    let job = base;
    let assigned = [];
    let allOn = false;
    let hires = info ? [...(base.hires || [])] : [];
    const tier = RANDOM_TIERS.find((t) => `r-${t.tier}` === base.id);
    const unlockedIds = () => MODIFIERS.filter((_, i) => Save.isUnlocked('modifiers', i)).map((m) => m.id);
    const rollMods = () => {
      const pool = shuffle(unlockedIds());
      const roll = Math.random();
      return pool.slice(0, roll < 0.4 ? 0 : roll < 0.8 ? 1 : 2);
    };
    if (!base.campaign && !info) assigned = rollMods();
    const holder = h('div');
    const stat = (label, val) => h('div', { class: 'stat-widget' }, h('small', {}, label), h('b', {}, val));
    const activeMods = () => (job.mods || []).map((id) => MODIFIERS.find((x) => x.id === id)).filter(Boolean);
    const confirmAll = () => new Promise((resolve) => {
      let shut;
      const done = (v) => { resolve(v); shut(); };
      shut = Modal.show({
        title: 'Enable All Modifiers?',
        onClose: () => resolve(false),
        content: h('div', {},
          h('p', {}, 'Every modifier you have unlocked will apply to this job:'),
          h('ul', { class: 'brief-steps' }, unlockedIds().map((id) => { const m = MODIFIERS.find((x) => x.id === id); return h('li', {}, `${m.icon} ${m.name}: ${m.desc}`); })),
          h('p', { class: 'good' }, 'In return, the total payout is doubled (and each modifier still adds +10%).'),
          h('div', { class: 'row' },
            h('button', { class: 'squircle', onclick: () => done(false) }, 'Cancel'),
            h('button', { class: 'squircle primary', onclick: () => done(true) }, 'Enable All')))
      });
    });
    const modifiersBox = () => {
      const mods = activeMods();
      const none = !unlockedIds().length;
      const chips = mods.map((m) => {
        const chip = h('span', { class: 'rider on static', tabindex: 0 }, `${m.icon} ${m.name}`);
        Tip.attach(chip, `${m.desc} Countered by: ${RIDER_COUNTERS[m.id]}.`);
        return chip;
      });
      return h('div', { class: 'riders' },
        h('div', { class: 'riders-head' },
          h('div', { class: 'label' }, 'Job Modifiers'),
          info || none || base.campaign ? null : (allOn
            ? h('button', { class: 'squircle mini', onclick: () => { allOn = false; render(); } }, 'Disable All')
            : h('button', { class: 'squircle danger mini', onclick: async () => { if (await confirmAll()) { allOn = true; render(); } } }, 'Enable All'))),
        mods.length ? h('div', { class: 'rider-row' }, chips) : h('small', { class: 'muted' }, none ? 'No modifiers unlocked yet.' : 'None on this job.'));
    };
    const sub = (text) => h('h4', { class: 'brief-h' }, text);
    // Specialty Hires: bought per job from those unlocked, never the same one twice, paid from the payout when the job completes.
    const hiresBox = () => {
      const head = h('div', { class: 'riders-head' }, h('div', { class: 'label' }, 'Specialty Hires'));
      if (info) {
        return h('div', { class: 'riders' }, head, h('div', { class: 'rider-row' }, (job.hires || []).filter((i) => HIRES[i]).map((i) => {
          const chip = h('span', { class: 'rider on static', tabindex: 0 }, `${HIRES[i][0]} ${HIRES[i][1]}`);
          Tip.attach(chip, HIRES[i][2]);
          return chip;
        })));
      }
      const subtotal = jobRewards({ ...job, hires: [] }).subtotal;
      const options = HIRES.map((x, i) => ({ x, i })).filter(({ i }) => Save.isUnlocked('hires', i));
      return h('div', { class: 'riders' }, head,
        options.length
          ? h('div', { class: 'hire-grid' }, options.map(({ x, i }) => {
            const on = hires.includes(i);
            return h('button', {
              type: 'button', class: `hire-card${on ? ' on' : ''}`, 'aria-pressed': String(on),
              onclick: () => { hires = on ? hires.filter((k) => k !== i) : [...hires, i].sort((a, b) => a - b); render(); }
            }, h('span', { class: 'hire-top' }, h('span', { class: 'hire-icon' }, x[0]), h('b', {}, x[1]), h('span', { class: 'hire-cost' }, on ? 'Hired' : money(hireCost(i, subtotal)))),
            h('small', {}, x[2]));
          }))
          : h('small', { class: 'muted' }, 'No Specialty Hires unlocked yet. Complete Campaign missions to unlock them.'),
        options.length ? h('small', { class: 'muted' }, 'Hired for this job only and paid from the payout when it is completed. Each one is available again next job.') : null);
    };
    const line = (key, val) => h('p', { class: 'brief-line' }, h('span', { class: 'brief-key' }, key), val);
    const planBtn = (name, count, title) => h('span', { class: 'nav-btn static', title }, h('span', { class: 'nav-name' }, name), h('small', { class: 'nav-count' }, count));
    const client = () => {
      const c = job.client || clientFor(job.industry, 0);
      return [sub('Client'), h('p', { class: 'brief-name' }, c.name), h('p', { class: 'muted brief-blurb' }, c.blurb)];
    };
    const campus = () => {
      const plan = planCampus(job, job.employees);
      const type = industryOf(job);
      const specials = jobSpecials(job);
      const multi = plan.sites.length > 1;
      const crew = (fls) => fls.reduce((t, fl) => t + fl.seats, 0);
      return [
        sub('Campus'),
        line('Industry Type', `${type.icon} ${type.name}`),
        h('h5', { class: 'brief-sh' }, 'Facilities'),
        h('div', { class: 'brief-nav' },
          h('div', { class: 'nav-row' }, h('span', { class: 'nav-label' }, 'Building'),
            plan.sites.map((s, b) => planBtn(buildingLetter(b), crew(plan.floors.filter((fl) => fl.b === b)), s.name))),
          h('div', { class: 'nav-row' }, h('span', { class: 'nav-label' }, 'Floor'),
            plan.sites.flatMap((s, b) => [
              multi ? h('span', { class: 'nav-label tag' }, buildingLetter(b)) : null,
              ...plan.floors.filter((fl) => fl.b === b).map((fl) => planBtn(`${fl.f + 1}F`, fl.seats, `${s.name} \u00b7 ${fl.name}`))
            ]))),
        line('Special Rooms', Object.keys(specials).length ? roomList(specials) : 'None')
      ];
    };
    const rewards = () => {
      const r = jobRewards(job);
      const goal = Math.round(Perks.satGoal(job) * 100);
      const signed = (n) => (n < 0 ? `-${money(-n)}` : `+${money(n)}`);
      const row = (name, hint, amount, cls = '') => h('div', { class: `brief-reward ${cls}` }, h('span', {}, h('b', {}, name), h('small', {}, hint)), h('b', { class: amount.startsWith('-') ? 'loss' : 'good' }, amount));
      return h('div', { class: 'brief-rewards' },
        sub('Rewards'),
        row('Completion', `Fixed: ${money(CFG.rewardPerEmployee)} per employee`, money(r.completion)),
        row(`Difficulty ×${r.mult}`, 'Contract difficulty multiplier', signed(r.difficulty)),
        r.mods.map((m) => row(`${m.icon} ${m.name}`, `Job Modifier: +${Math.round(MODIFIER_PAY * 100)}% of Completion`, signed(m.amount))),
        r.company ? row('Company Bonus', 'Capacity upgrade and uniforms', signed(r.company)) : null,
        job.timeLimit ? row('Bonus: Fast Planning', `Press Execute within ${Math.round(r.fastShare * 100)}% of the Time Limit`, signed(r.fastBonus)) : null,
        row('Bonus: Satisfaction', `Reach ${goal}% Satisfaction`, signed(r.satBonus)),
        r.factor > 1 ? row('All Modifiers ×2', 'Total payout doubled', signed(r.total() - r.total() / r.factor)) : null,
        r.hires.map((x) => row(`${x.icon} ${x.name}`, 'Specialty Hire: paid from the payout', signed(-x.amount))),
        row('Total', 'Maximum, if every bonus is earned', money(r.total()), 'total'));
    };
    const instructions = () => {
      const r = jobRewards(job);
      const goal = Math.round(Perks.satGoal(job) * 100);
      return h('div', {}, sub('Instructions'), h('ul', { class: 'brief-steps' }, [
        'Drag each employee onto a desk, or tap a seated desk to see their details and unassign them.',
        'Seat everyone with a requirement, then press Execute.',
        `Reach ${goal}% Satisfaction for a Bonus Reward.`,
        job.timeLimit ? `Press Execute within ${Math.round(r.fastShare * 100)}% of the Time Limit for a Bonus Reward.` : null,
        'Assigning and unassigning desks is free: only the final seating counts.'
      ].filter(Boolean).map((text) => h('li', {}, text))));
    };
    const render = () => {
      job = info ? base : { ...applyMods(base, base.campaign ? base.modIds : allOn ? unlockedIds() : assigned, hires), hires: [...hires], allMods: allOn };
      holder.replaceChildren(...[
        job.desc ? h('p', {}, job.desc) : null,
        ...client(),
        ...campus(),
        h('div', { class: 'stat-row' },
          stat('Employees', job.employees), stat('Spare Desks', spareDesks(job)),
          stat('Time Limit', job.timeLimit ? formatClock(job.timeLimit) : '∞'),
          stat('Cargo', cargoLabel(job.cargoLoad ?? 0.25)),
          stat('Time of Day', `${timeOf(job).icon} ${timeOf(job).name}`)),
        base.campaign ? (activeMods().length ? modifiersBox() : null) : info && !activeMods().length ? null : modifiersBox(),
        info && !(job.hires || []).length ? null : hiresBox(),
        rewards(),
        instructions(),
        h('div', { class: 'row sticky-row' }, info
          ? h('button', { class: 'squircle action', onclick: () => close() }, 'Close')
          : h('button', { class: 'squircle action', onclick: () => { close(); startJob(job); } }, 'Start Job'))
      ].filter(Boolean));
    };
    const reroll = (e) => {
      base = makeRandomJob(tier);
      assigned = rollMods();
      allOn = false;
      e.currentTarget.classList.remove('spin');
      void e.currentTarget.offsetWidth;
      e.currentTarget.classList.add('spin');
      render();
      holder.parentElement.scrollTop = 0;
    };
    const corner = !base.campaign && !info && tier
      ? h('button', { class: 'modal-reroll', 'aria-label': 'Reroll job', title: 'Reroll this job', onclick: reroll }, '↻')
      : null;
    render();
    close = Modal.show({ title: base.name, content: holder, corner, scroll: true });
  }

  // Floor plan generation blocks the page for seconds on big jobs, so paint the spinner first and generate on the next tick.
  function startJob(job, snapshot) {
    const loading = document.getElementById('loading');
    document.getElementById('loading-text').textContent = job.employees >= 100 ? 'Building floor plans… big jobs take a few seconds' : 'Building floor plans…';
    loading.hidden = false;
    requestAnimationFrame(() => setTimeout(() => {
      try { launchJob(job, snapshot); } finally { loading.hidden = true; }
    }, 30));
  }

  function launchJob(job, snapshot) {
    document.getElementById('screens').replaceChildren();
    const kind = job.campaign ? 'campaign' : 'random';
    Game.start(job, {
      onFinish: (summary) => {
        const bankBefore = Save.active.bank;
        const doneBefore = Save.active.completed.length;
        // First clear of a campaign mission pays half again.
        if (job.campaign && !summary.failed && !Save.active.completed.includes(job.id)) {
          summary.firstClear = Math.round(summary.reward * FIRST_CLEAR_BONUS);
          summary.reward += summary.firstClear;
        }
        Save.clearPaused(kind, state.job.uid);
        Save.recordJob(job, summary);
        Game.stop();
        show('results', { job, summary, bankBefore, unlocked: Save.active.completed.length > doneBefore });
      },
      onFail: (summary) => {
        Save.clearPaused(kind, state.job.uid);
        Save.recordJob(job, summary);
        Game.stop();
        show('menu');
      },
      onPause: () => {
        Save.setPaused(kind, Game.snapshot());
        Game.stop();
        show('menu');
      }
    }, snapshot);
    if (!snapshot && !Save.seenTutorial('game')) {
      Tutorial.run([
        { target: '#side', text: 'Select a department to see its org chart below, then drag an employee\'s initials onto a desk. Tap the initials for their details.' },
        { target: '#stage', text: 'Drag the map to pan; scroll, pinch, or use +/- to zoom. Tap a seated desk to see that employee\u2019s details, or use their Unassign button to send them back.' },
        { target: '#hud', text: 'Watch the Time Limit, Employees and Satisfaction bars. Finish planning fast and beat the Satisfaction goal for bonus rewards.' },
        { target: '#finish-btn', text: 'Seat every office-required employee, then press Execute. Movers deliver the cargo, then employees move in and react.' }
      ], () => Save.markTutorial('game'));
    }
  }

  // Bars for the effect at each level: owned levels green, the next level blue, the rest muted.
  function upgradeGraph(u, lvl) {
    const W = 640, H = 112, padX = 10, top = 22, bottom = 18;
    const plot = H - top - bottom;
    const slot = (W - padX * 2) / MAX_UPGRADE_LEVEL;
    const barW = slot * 0.66;
    const fmt = (v) => `${+v.toFixed(1)}%`;
    let svg = `<line class="up-axis" x1="${padX}" x2="${W - padX}" y1="${top + plot}" y2="${top + plot}"/>`;
    for (let i = 1; i <= MAX_UPGRADE_LEVEL; i++) {
      const val = upgradeAt(u.max, i - 1);
      const bh = Math.max(2, (val / u.max) * plot);
      const x = padX + slot * (i - 1) + (slot - barW) / 2;
      const state = i <= lvl ? 'own' : i === lvl + 1 ? 'next' : 'later';
      svg += `<rect class="up-bar ${state}${i === lvl ? ' now' : ''}" x="${x}" y="${top + plot - bh}" width="${barW}" height="${bh}" rx="4"/>`;
      svg += `<text class="up-lv${i === lvl ? ' now' : ''}" x="${x + barW / 2}" y="${H - 6}">${i}</text>`;
      if (i === lvl || i === MAX_UPGRADE_LEVEL) svg += `<text class="up-val${i === lvl ? ' now' : ''}" x="${x + barW / 2}" y="${top + plot - bh - 5}">${i === 1 ? '0%' : `+${fmt(val)}`}</text>`;
    }
    const wrap = h('div', { class: 'squircle up-graph' },
      h('div', { class: 'up-head' }, h('span', { class: 'label' }, `${u.name} reward path`), h('span', { class: 'up-now' }, lvl > 1 ? u.now(lvl - 1) : 'No bonus yet')));
    const box = h('div', { class: 'up-svg' });
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${u.name} effect by level">${svg}</svg>`;
    wrap.append(box);
    return wrap;
  }

  // ----- Upgrades -----
  function upgrades() {
    const d = Save.active;
    const { root, body } = frame('Upgrades', 'yellow', `Reinvest your money into permanent crew upgrades. Each level costs more, up to level ${MAX_UPGRADE_LEVEL}.`);
    body.append(h('div', { class: 'bank-line' }, `Bank: ${money(d.bank)}`),
      h('div', { class: 'upgrade-list' }, UPGRADES.map((u) => {
        const lvl = d.upgrades[u.key];
        const maxed = lvl >= MAX_UPGRADE_LEVEL;
        const cost = upgradeCost(u, lvl);
        const c = card({
          class: 'upgrade',
          onclick: () => {
            if (maxed) return;
            if (cost > d.bank) { FX.play('error'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); return; }
            confirmUpgrade(u, lvl, cost);
          }
        }, h('div', { class: 'tile-icon' }, u.icon), h('b', {}, u.name), h('small', {}, maxed ? `Level ${lvl} (MAX)` : `Level ${lvl}`),
        h('small', {}, lvl > 1 ? u.now(lvl - 1) : u.mod),
        maxed ? h('div', { class: 'price' }, 'MAX') : h('div', { class: `price${cost > d.bank ? ' short' : ''}` }, money(cost)));
        return h('div', { class: 'upgrade-row' }, c, upgradeGraph(u, lvl));
      })));
    return root;
  }

  function confirmUpgrade(u, lvl, cost) {
    let close;
    close = Modal.show({
      title: `Upgrade ${u.name}`,
      content: h('div', {},
        h('p', {}, `Level ${lvl} → ${lvl + 1}`), h('p', {}, u.desc), h('p', {}, h('b', {}, 'Each level: '), u.mod),
        h('p', {}, h('b', {}, 'After this level: '), u.now(lvl)),
        h('p', {}, h('b', {}, 'Cost: '), money(cost)),
        h('div', { class: 'row' },
          h('button', { class: 'squircle', onclick: () => close() }, 'Cancel'),
          h('button', {
            class: 'squircle primary',
            onclick: () => {
              const d = Save.active;
              if (cost > d.bank) { close(); return; }
              d.bank -= cost;
              d.upgrades[u.key] = lvl + 1;
              Save.persist();
              FX.play('win');
              close();
              show('upgrades');
            }
          }, 'Purchase')))
    });
  }

  // ----- Unlocks -----
  function unlocks() {
    const d = Save.active;
    d.unlocksMenuNew = false;
    Save.persist();
    const { root, body } = frame('Unlocks', 'purple', 'Complete each Campaign job to unlock one item in every category.');
    body.append(h('div', { class: 'list' }, UNLOCK_CATEGORIES.map((c) => {
      const open = c.items.filter((_, i) => Save.isUnlocked(c.id, i)).length;
      const badge = d.newUnlocks[c.id] ? newBadge() : null;
      return card({
        class: 'unlock-card', onclick: () => {
          if (badge) { badge.remove(); d.newUnlocks[c.id] = false; Save.persist(); }
          Modal.show({
            title: c.name,
            content: h('div', { class: 'list' }, [...(c.intro ? [].concat(c.intro).map((line) => h('p', { class: 'muted' }, line)) : []), ...c.items.map(([icon, name, desc], i) => {
              const ok = Save.isUnlocked(c.id, i);
              const starter = (c.id === 'uniforms' || c.id === 'vehicles') && i === 0;
              const lockId = `lock-${c.id}-${i}`;
              const why = starter ? 'Starter item: every company begins with it.'
                : ok ? `Unlocked by completing "${CAMPAIGN[i].name}" in the Campaign.` : `Complete "${CAMPAIGN[i].name}" in the Campaign to unlock this.`;
              return h('div', { class: `list-row static has-lock${ok ? '' : ' locked'}` },
                h('span', { class: 'row-icon' }, icon),
                h('span', { class: 'row-text' }, h('b', {}, name), [].concat(desc).map((line) => h('small', {}, line))),
                h('button', {
                  type: 'button', id: lockId, class: `lock-badge ${ok ? 'open' : 'shut'}`, 'aria-label': ok ? 'Unlocked' : 'Locked',
                  onclick: (e) => { e.currentTarget.scrollIntoView({ block: 'nearest' }); Tutorial.run([{ target: `#${lockId}`, text: why }]); }
                }, ok ? '🔓' : '🔒'));
            })])
          });
        }
      }, h('b', {}, `${c.icon} ${c.name}`), h('small', {}, `${open} / 8 (${open * 12.5}%)`),
      h('div', { class: 'bar' }, h('div', { style: `width:${open * 12.5}%;background:${c.color}` })), badge);
    })));
    return root;
  }

  // ----- Branding -----
  function branding() {
    const d = Save.active;
    const { root, body } = frame('Branding', 'yellow', 'Customize your company uniforms, vehicles, and name.');
    body.append(h('div', { class: 'row' },
      card({ class: 'tile', onclick: () => pickBranding('uniform', () => show('branding')) }, h('div', { class: 'big-icon' }, d.uniform), 'Uniforms'),
      card({ class: 'tile', onclick: () => pickBranding('vehicle', () => show('branding')) }, h('div', { class: 'big-icon' }, d.vehicle), 'Vehicles'),
      card({ class: 'tile', onclick: renameCompany }, h('div', { class: 'big-icon' }, '✏️'), 'Change Company Name')));
    return root;
  }

  function renameCompany() {
    const input = h('input', { type: 'text', maxlength: 26, value: Save.active.name });
    let close;
    const save = () => {
      const name = input.value.trim();
      if (!name) return;
      Save.active.name = name;
      Save.persist();
      close();
      show('branding');
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    close = Modal.show({
      title: 'Change Company Name',
      content: h('div', {}, input, h('div', { class: 'row' },
        h('button', { class: 'squircle', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'squircle primary', onclick: save }, 'Save')))
    });
    setTimeout(() => input.focus(), 50);
  }

  // ----- History -----
  function history() {
    const d = Save.active;
    const { root, body } = frame('Job History', 'orange', 'Review your past missions and ratings.');
    if (!d.jobHistory.length) body.append(h('div', { class: 'squircle' }, 'No completed jobs yet.'));
    else {
      body.append(h('div', { class: 'list' }, d.jobHistory.slice().reverse().map((j) => card({
        class: `history-card${j.failed ? ' failed' : ''}`,
        onclick: () => Modal.show({
          title: j.name,
          content: h('div', {}, h('p', {}, j.date), h('p', {}, `Rating: ${stars(j.rating)} (${j.rating.toFixed(1)})`),
            h('p', {}, `Employees: ${j.employees}`), h('p', {}, `Earned: +${money(j.earned)}`))
        })
      }, h('div', { class: 'between' }, h('b', {}, j.failed ? `${j.name} (Failed)` : j.name), h('small', {}, j.date)),
      h('div', { class: 'between' }, h('span', {}, 'Rating'), h('span', {}, stars(j.rating))),
      h('div', { class: 'between' }, h('span', {}, 'Earned'), h('b', { class: 'good' }, `+${money(j.earned)}`))))));
    }
    return root;
  }

  // ----- Settings -----
  function settings() {
    const { root, body } = frame('Settings', 'indigo', 'Adjust audio, effects, layout and appearance. Settings are saved on this device.');
    const toggle = (label, key) => {
      const sw = h('button', {
        class: `toggle${Settings.data[key] ? ' on' : ''}`, role: 'switch', 'aria-checked': String(Settings.data[key]), 'aria-label': label,
        onclick: () => { Settings.set(key, !Settings.data[key]); sw.classList.toggle('on', Settings.data[key]); sw.setAttribute('aria-checked', String(Settings.data[key])); }
      });
      return h('div', { class: 'between setting' }, h('span', {}, label), sw);
    };
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: Settings.data.volume });
    vol.addEventListener('input', () => Settings.set('volume', parseFloat(vol.value)));
    vol.addEventListener('change', () => FX.play('click'));
    body.append(h('div', { class: 'settings-cols' },
      h('div', { class: 'squircle stack' }, h('div', { class: 'label' }, 'DISPLAY'),
        toggle('Dark Mode', 'dark'), toggle('Roster on Right', 'lefty'), toggle('Particle Effects', 'particles')),
      h('div', { class: 'squircle stack' }, h('div', { class: 'label' }, 'AUDIO'),
        toggle('Sound Effects', 'sfx'),
        h('div', { class: 'between setting' }, h('span', {}, 'Volume'), vol)),
      h('div', { class: 'squircle stack misc' }, h('div', { class: 'label' }, 'MISCELLANEOUS'),
        h('button', { class: 'squircle', onclick: () => { Save.resetTutorials(); Modal.notice('Tutorials reset', 'Tutorials will show again.'); } }, 'Replay Tutorials'),
        h('button', { class: 'squircle danger', onclick: () => { Save.select(-1); show('saves'); } }, 'Switch Account'))));
    return root;
  }

  // ----- Job results (animated) -----
  function results({ summary, bankBefore, unlocked }) {
    const d = Save.active;
    const skip = { next: false, all: false };
    const sleep = async (ms) => {
      const end = performance.now() + ms;
      while (performance.now() < end && !skip.next && !skip.all) await new Promise((r) => setTimeout(r, 30));
    };
    const tween = (node, from, to, ms, fmt) => new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        if (!node.isConnected) { resolve(); return; }
        if (skip.next || skip.all) { node.textContent = fmt(to); resolve(); return; }
        const p = Math.min((performance.now() - t0) / ms, 1);
        node.textContent = fmt(Math.round(from + (to - from) * p));
        if (p < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });

    const starEls = Array.from({ length: Math.max(1, Math.round(summary.rating)) }, () => h('span', { class: 'jc-star' }, '⭐'));
    const crStars = h('span', {}, stars(Save.companyRating(d)));
    const crCount = h('span', { class: 'jc-count' }, `(${d.jobHistory.length})`);
    const rewardEl = h('span', {}, '+$0');
    const bankEl = h('span', {}, money(bankBefore));
    const mkRow = (label, ...val) => h('div', { class: 'jc-row' }, h('span', { class: 'jc-label' }, label), h('span', { class: 'jc-val' }, ...val));
    const rows = {
      prefs: mkRow('Preferences Met', `${summary.met} / ${summary.total}`),
      base: mkRow('Completion Reward', money(summary.base)),
      extras: summary.extras ? mkRow('Difficulty & Modifiers', h('span', { class: summary.extras < 0 ? 'loss' : 'good' }, `${summary.extras < 0 ? '-' : '+'}${money(Math.abs(summary.extras))}`)) : null,
      fast: summary.timed ? mkRow('Fast Planning Bonus', summary.fast ? h('span', { class: 'good' }, `+${money(summary.fastBonus)}`) : 'Missed') : null,
      sat: mkRow('Satisfaction Bonus', summary.satHit ? h('span', { class: 'good' }, `+${money(summary.satBonus)}`) : 'Missed'),
      doubled: summary.doubled ? mkRow('All Modifiers ×2', h('span', { class: 'good' }, `+${money(summary.doubled)}`)) : null,
      damage: summary.broken ? mkRow(`Breakages (${summary.broken})`, h('span', { class: 'loss' }, `-${money(summary.damage)}`)) : null,
      hires: summary.hireCost ? mkRow(`Specialty Hires (${summary.hires.length})`, h('span', { class: 'loss' }, `-${money(summary.hireCost)}`)) : null,
      unlock: unlocked ? mkRow('New Unlocks', h('span', { class: 'good' }, 'Granted!')) : null,
      bonus: summary.firstClear ? mkRow('First-Clear Bonus', h('span', { class: 'good' }, `+${money(summary.firstClear)}`)) : null,
      reward: mkRow('Job Reward', rewardEl),
      bank: mkRow('Company Bank', bankEl)
    };
    const cont = h('button', { class: 'squircle primary', style: 'visibility:hidden', onclick: () => show('menu') }, 'Return to Main Menu');
    const root = h('section', { class: 'screen bg-green results' },
      h('h2', { class: 'screen-title' }, 'JOB COMPLETE'),
      h('div', { class: 'row' },
        h('div', { class: 'squircle jc-card' }, h('span', { class: 'jc-label' }, 'Job Rating'), h('div', { class: 'jc-stars' }, starEls)),
        h('div', { class: 'squircle jc-card' }, h('span', { class: 'jc-label' }, 'Company Rating'), h('div', {}, crStars, ' ', crCount))),
      h('div', { class: 'squircle jc-budget' }, Object.values(rows).filter(Boolean)),
      cont);

    let timer = null;
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      timer = setTimeout(() => { skip.all = true; timer = null; }, 400);
    });
    root.addEventListener('pointerup', () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      if (!skip.all) skip.next = true;
    });

    const run = async () => {
      const steps = [
        async () => { for (const s of starEls) { if (skip.next || skip.all) break; s.classList.add('visible'); FX.play('pop'); await sleep(170); } },
        async () => { crStars.classList.add('jc-pulse'); crCount.classList.add('jc-pulse'); FX.play('click'); await sleep(450); },
        async () => { rows.prefs.classList.add('visible'); rows.base.classList.add('visible'); rows.extras?.classList.add('visible'); await sleep(350); },
        async () => { rows.fast?.classList.add('visible'); rows.sat.classList.add('visible'); rows.doubled?.classList.add('visible'); rows.damage?.classList.add('visible'); rows.hires?.classList.add('visible'); await sleep(350); },
        async () => { if (rows.unlock) { rows.unlock.classList.add('visible'); FX.play('win'); } rows.bonus?.classList.add('visible'); await sleep(350); },
        async () => { rows.reward.classList.add('visible'); await tween(rewardEl, 0, summary.reward, 800, (n) => `+${money(n)}`); },
        async () => { rows.bank.classList.add('visible'); await tween(bankEl, bankBefore, bankBefore + summary.reward, 800, money); }
      ];
      for (const step of steps) {
        if (!root.isConnected) return;
        if (skip.all) break;
        skip.next = false;
        await step();
      }
      if (!root.isConnected) return;
      starEls.forEach((s) => s.classList.add('visible'));
      Object.values(rows).forEach((r) => r && r.classList.add('visible'));
      rewardEl.textContent = `+${money(summary.reward)}`;
      bankEl.textContent = money(bankBefore + summary.reward);
      cont.style.visibility = 'visible';
    };
    setTimeout(run, 350);
    return root;
  }

  const SCREENS = { start, saves, register, logo, brandingSetup, menu, upgrades, unlocks, branding, history, settings, results };

  function show(name, arg) {
    document.querySelectorAll('#tutorial').forEach((t) => t.remove());
    document.getElementById('modal-root').replaceChildren();
    document.body.classList.remove('playing');
    const needsCompany = !['start', 'saves', 'register', 'logo'].includes(name);
    if (needsCompany && !Save.active) name = 'saves';
    if (name === 'register' || name === 'logo') { if (!draft) name = 'saves'; }
    const screen = SCREENS[name](arg);
    current = name;
    document.getElementById('screens').replaceChildren(screen);
    if (name === 'menu') setTimeout(menuTutorial, 300);
  }

  return { show, refresh, info: (job) => briefing(job, { info: true }) };
})();

// Execute confirmation: Planning-stage meters and the payout they lead to. Resolves true to execute.
function confirmExecute(r) {
  return new Promise((resolve) => {
    let close;
    const done = (v) => { resolve(v); close(); };
    const meters = h('div', { class: 'exec-meters' }, [...document.getElementById('hud-meters').children].map((m) => {
      const c = m.cloneNode(true);
      c.classList.remove('bump-cost', 'bump-up', 'bump-down');
      c.querySelectorAll('.meter-delta').forEach((d) => d.remove());
      c.removeAttribute('id');
      c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      return c;
    }));
    const unseated = state.employees.filter((e) => !seatOf(e.id)).length;
    close = Modal.show({
      title: 'Execute the Move?',
      wide: true,
      onClose: () => resolve(false),
      content: h('div', {},
        h('p', {}, 'Planning ends here. Movers will deliver every object, then employees arrive and react to their seats.'),
        meters,
        h('div', { class: 'exec-payout' },
          h('span', {}, 'Job Payout'), h('b', {}, money(r.reward)),
          h('small', {}, `Completion ${money(r.base)}`
            + (r.timed ? ` · Fast Planning ${r.fast ? `+${money(r.fastBonus)}` : 'missed'}` : '')
            + ` · Satisfaction ${r.satHit ? `+${money(r.satBonus)}` : 'missed'}`
            + (r.hireCost ? ` · Specialty Hires -${money(r.hireCost)}` : ''))),
        unseated ? h('p', { class: 'warn' }, `${unseated} employee${unseated === 1 ? ' is' : 's are'} unassigned: they will not be moved and count as unsatisfied.`) : null,
        state.job.mods?.includes('fragile') ? h('p', { class: 'warn' }, 'Fragile Goods: any object that breaks is replaced and its cost is deducted from this payout.') : null,
        h('div', { class: 'row' },
          h('button', { class: 'squircle', onclick: () => done(false) }, 'Return to Planning'),
          h('button', { class: 'squircle primary', onclick: () => done(true) }, 'Execute')))
    });
  });
}

// Abort records a failed job (0 stars); Return to Main Menu pauses it. Each kind of job can hold one pause slot.
document.getElementById('abort-btn').addEventListener('click', async () => {
  if (!state.job || state.finished) return;
  const confirmed = await Modal.confirm({
    title: 'Abort Job?',
    message: 'Aborting counts as a failed job: it will be recorded as a failure (0 stars) in Job History and lower your Company Rating. This cannot be undone.',
    confirmText: 'Abort Job',
    danger: true
  });
  if (confirmed) Game.hooks.onFail?.({ failed: true, rating: 0, reward: 0, met: 0, total: 0, employees: state.employees.length });
});

document.getElementById('info-btn').addEventListener('click', () => { if (state.job) UI.info({ ...state.job }); });

document.getElementById('pause-btn').addEventListener('click', async () => {
  if (!state.job || state.finished) return;
  if (state.phase !== 'planning') {
    Modal.notice('Move In Progress', 'A job can only be paused during Planning. Let the move finish, or abort the job.');
    return;
  }
  const kind = state.job.campaign ? 'campaign' : 'random';
  const held = Save.pausedJob(kind);
  if (held && held.job.uid !== state.job.uid) {
    Modal.notice('Another Job Is Paused', `You already have a paused ${kind} job (${held.job.name}). Resume or abort it from the main menu before pausing this one.`);
    return;
  }
  const confirmed = await Modal.confirm({
    title: 'Return to Main Menu?',
    message: 'This will pause your current job. You can pick it up again later from the Play Campaign or Random Job menu, exactly where you left off. Only one paused job of each type is kept.',
    confirmText: 'Pause & Return'
  });
  if (confirmed) Game.hooks.onPause?.();
});

Settings.apply();

function cheat(fn) {
  return () => {
    if (!Save.active) return;
    fn(Save.active);
    Save.persist();
    UI.refresh();
  };
}
Dev.action('Add $1000', cheat((d) => { d.bank += 1000; }));
Dev.action('Add $10,000', cheat((d) => { d.bank += 10000; }));
Dev.action('All Unlocks', cheat((d) => { d.completed = CAMPAIGN.map((j) => j.id); Save.flagNewUnlocks(d); }));
Dev.action('All Upgrades', cheat((d) => { UPGRADES.forEach((u) => { d.upgrades[u.key] = 10; }); }));

UI.show('start');
