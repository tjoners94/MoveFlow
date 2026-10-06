/** Company save slots (localStorage). Three slots; `Save.active` is the selected company. */
const Save = (() => {
  const KEY = 'moveflow.saves';
  const UPGRADE_KEYS = ['headcount', 'speed', 'capacity', 'safety', 'diligence'];
  let slots = [null, null, null];
  let activeIdx = -1;

  function normalize(d) {
    d.name = String(d.name || 'Company');
    d.shape = d.shape || '🔺';
    d.font = d.font || 'var(--font-stack)';
    d.uniform = d.uniform || '👕';
    d.vehicle = d.vehicle || '🚚';
    d.bank = Number.isFinite(d.bank) ? d.bank : 0;
    d.jobHistory = Array.isArray(d.jobHistory) ? d.jobHistory : [];
    d.completed = Array.isArray(d.completed) ? d.completed : [];
    d.newUnlocks = d.newUnlocks && typeof d.newUnlocks === 'object' ? d.newUnlocks : {};
    d.unlocksMenuNew = !!d.unlocksMenuNew;
    d.tutorialsSeen = d.tutorialsSeen && typeof d.tutorialsSeen === 'object' ? d.tutorialsSeen : {};
    d.upgrades = d.upgrades && typeof d.upgrades === 'object' ? d.upgrades : {};
    d.paused = { campaign: d.paused?.campaign || null, random: d.paused?.random || null };
    UPGRADE_KEYS.forEach((k) => { if (!Number.isFinite(d.upgrades[k])) d.upgrades[k] = 1; });
    return d;
  }

  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(raw)) slots = [0, 1, 2].map((i) => (raw[i] ? normalize(raw[i]) : null));
  } catch { /* corrupt save: start empty */ }

  const persist = () => localStorage.setItem(KEY, JSON.stringify(slots));
  const flagNew = (d) => {
    ['hires', 'clients', 'modifiers', 'uniforms', 'vehicles'].forEach((k) => { d.newUnlocks[k] = true; });
    d.unlocksMenuNew = true;
  };

  return {
    slots: () => slots,
    get active() { return slots[activeIdx] || null; },
    select(i) { activeIdx = i; },
    create(i, { name, shape, font }) {
      slots[i] = normalize({ name, shape, font });
      persist();
      return slots[i];
    },
    remove(i) {
      slots[i] = null;
      if (activeIdx === i) activeIdx = -1;
      persist();
    },
    persist,
    recordJob(job, s) {
      const d = slots[activeIdx];
      if (!d) return;
      d.bank += s.reward;
      d.jobHistory.push({
        id: job.id, name: job.name, date: new Date().toLocaleDateString(),
        rating: s.rating, earned: s.reward, employees: s.employees, failed: !!s.failed
      });
      if (!s.failed && job.campaign && !d.completed.includes(job.id)) { d.completed.push(job.id); flagNew(d); }
      persist();
    },
    flagNewUnlocks: flagNew,
    // One paused job per kind ('campaign' | 'random'); a snapshot is plain JSON written by snapshotJob().
    pausedJob(kind) { return slots[activeIdx]?.paused[kind] || null; },
    setPaused(kind, snapshot) {
      const d = slots[activeIdx];
      if (d) { d.paused[kind] = snapshot; persist(); }
    },
    clearPaused(kind, uid) {
      const d = slots[activeIdx];
      if (d && d.paused[kind] && (uid === undefined || d.paused[kind].job.uid === uid)) { d.paused[kind] = null; persist(); }
    },
    companyRating(d) {
      if (!d || !d.jobHistory.length) return null;
      return d.jobHistory.reduce((t, j) => t + j.rating, 0) / d.jobHistory.length;
    },
    // Item i of every unlock category is granted by completing campaign mission i (starter branding is free).
    isUnlocked(catId, i, d = slots[activeIdx]) {
      if (!d) return false;
      if (i === 0 && (catId === 'uniforms' || catId === 'vehicles')) return true;
      return !!CAMPAIGN[i] && d.completed.includes(CAMPAIGN[i].id);
    },
    seenTutorial(key) { return !!slots[activeIdx]?.tutorialsSeen[key]; },
    markTutorial(key) {
      const d = slots[activeIdx];
      if (d) { d.tutorialsSeen[key] = true; persist(); }
    },
    resetTutorials() {
      const d = slots[activeIdx];
      if (d) { d.tutorialsSeen = {}; persist(); }
    },
    // Level above 1 for an upgrade (0 when no company is selected).
    perkLevel(key) { return Math.min(MAX_UPGRADE_LEVEL - 1, Math.max(0, (slots[activeIdx]?.upgrades[key] || 1) - 1)); }
  };
})();
