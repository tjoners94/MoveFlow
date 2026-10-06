/**
 * Cheats panel. Toggle with ` (backtick) or the CHEATS button.
 *   const cfg = Dev.params('Group', { key: { value, ... } });  returns the plain defaults (tuning values live in code).
 *   Dev.action('Label', fn) adds a cheat button.
 */
const Dev = (() => {
  const actions = [];
  let panel = null;
  let body = null;

  function params(group, spec) {
    return Object.fromEntries(Object.entries(spec).map(([key, def]) => [key, def.value]));
  }

  function action(label, fn) {
    actions.push({ label, fn });
    if (panel) build();
  }

  function build() {
    body.replaceChildren();
    const bar = document.createElement('div');
    bar.className = 'dev-actions';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      b.addEventListener('click', a.fn);
      bar.appendChild(b);
    }
    body.appendChild(bar);
  }

  function mount() {
    const toggle = document.createElement('button');
    toggle.id = 'dev-toggle';
    toggle.type = 'button';
    toggle.dataset.fx = 'none';
    toggle.textContent = 'CHEATS';

    panel = document.createElement('aside');
    panel.id = 'dev-panel';
    panel.hidden = true;
    panel.innerHTML = '<header><b>Cheats</b><span><button type="button" data-fx="none" id="dev-close">x</button></span></header><div id="dev-body"></div>';
    document.body.append(toggle, panel);
    body = panel.querySelector('#dev-body');

    const flip = () => { panel.hidden = !panel.hidden; };
    toggle.addEventListener('click', flip);
    panel.querySelector('#dev-close').addEventListener('click', flip);
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) flip();
    });
    build();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  return { params, action };
})();
