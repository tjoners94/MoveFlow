/** In-game wiki: a modal with a folder tree, nested pages, cross-links and glossary tooltips. Content lives in wikidata.js. */
const Wiki = (() => {
  const pages = new Map();
  WIKI.forEach((f) => f.pages.forEach((p) => pages.set(p.id, { ...p, folder: f })));
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  let nav, scroller, crumbs, backBtn, current = null;
  const trail = [];

  // Turns markup into nodes: [[page#heading|label]] links, {{term|shown}} tooltips, **bold**.
  function inline(text) {
    const out = [];
    const re = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]|\{\{([^}|]+)(?:\|([^}]+))?\}\}|\*\*([^*]+)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      if (m[1]) {
        const [, id, anchor, alias] = m;
        const target = pages.get(id);
        const label = alias || target?.title || id;
        out.push(target
          ? h('a', { class: 'wiki-link', href: '#', onclick: (e) => { e.preventDefault(); go(id, anchor); } }, label)
          : label);
      } else if (m[4]) {
        const def = WIKI_GLOSSARY[m[4].toLowerCase()];
        const shown = m[5] || m[4];
        if (def) {
          const term = h('span', { class: 'wiki-term', tabindex: 0 }, shown);
          Tip.attach(term, `${cap(m[4])}: ${def}`);
          out.push(term);
        } else out.push(shown);
      } else out.push(h('b', {}, m[6]));
      last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function block(b) {
    if (typeof b === 'string') return h('p', {}, inline(b));
    if (b.h) return h('h3', { id: `wk-${slug(b.h)}` }, b.h);
    if (b.ul) return h('ul', {}, b.ul.map((t) => h('li', {}, inline(t))));
    if (b.ol) return h('ol', {}, b.ol.map((t) => h('li', {}, inline(t))));
    if (b.note) return h('p', { class: 'wiki-note' }, inline(b.note));
    if (b.table) {
      const [head, ...rows] = b.table;
      return h('div', { class: 'wiki-table-wrap' }, h('table', { class: 'wiki-table' },
        h('thead', {}, h('tr', {}, head.map((c) => h('th', {}, inline(c))))),
        h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, inline(c))))))));
    }
    return null;
  }

  function show(id, anchor) {
    const p = pages.get(id);
    if (!p) return;
    current = id;
    const body = typeof p.body === 'function' ? p.body() : p.body;
    scroller.replaceChildren(h('article', { class: 'wiki-article' },
      h('h2', {}, p.title),
      h('p', { class: 'wiki-flavor' }, inline(p.flavor)),
      h('div', { class: 'wiki-sum' },
        h('div', { class: 'wiki-box' }, h('b', {}, 'TL;DR'), h('p', {}, inline(p.tldr))),
        h('div', { class: 'wiki-box' }, h('b', {}, 'ELI5'), h('p', {}, inline(p.eli5)))),
      body.map(block)));
    scroller.scrollTop = 0;
    if (anchor) scroller.querySelector(`#wk-${slug(anchor)}`)?.scrollIntoView({ block: 'start' });
    crumbs.replaceChildren(h('span', {}, `${p.folder.icon} ${p.folder.name}`), ' \u203A ', h('b', {}, p.title));
    backBtn.disabled = !trail.length;
    nav.querySelectorAll('.wiki-nav-page').forEach((el) => el.classList.toggle('active', el.dataset.page === id));
    const group = nav.querySelector(`details[data-folder="${p.folder.id}"]`);
    if (group) group.open = true;
  }

  function go(id, anchor) {
    if (current && current !== id) trail.push(current);
    show(id, anchor);
  }

  function open(id = 'welcome') {
    trail.length = 0;
    nav = h('nav', { class: 'wiki-nav', 'aria-label': 'Wiki pages' }, WIKI.map((f) => h('details', { 'data-folder': f.id },
      h('summary', {}, `${f.icon} ${f.name}`),
      f.pages.map((p) => h('button', { type: 'button', class: 'wiki-nav-page', 'data-page': p.id, onclick: () => go(p.id) }, p.title)))));
    backBtn = h('button', { type: 'button', class: 'squircle wiki-back', onclick: () => { if (trail.length) show(trail.pop()); } }, '\u2190 Back');
    crumbs = h('div', { class: 'wiki-crumbs' });
    scroller = h('div', { class: 'wiki-scroll' });
    Modal.show({
      title: 'Move Flow Wiki',
      cls: 'wiki',
      content: h('div', { class: 'wiki-layout' }, nav, h('div', { class: 'wiki-main' }, h('div', { class: 'wiki-bar' }, backBtn, crumbs), scroller))
    });
    show(id);
  }

  return { open };
})();
