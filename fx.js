/**
 * Audio + click-feedback support.
 *   FX.play('drop')                         play a named sound
 *   FX.registerSound('x', {src:'a.mp3'})    or synth: {freq, to, dur, type, gain}
 *   FX.burst(x, y, color) / FX.ripple(x, y) visual effects at screen coords
 * Buttons and [data-fx] elements get a sound + ripple automatically; data-fx="none" opts out,
 * data-fx="<name>" picks the sound.
 */
const FX = (() => {
  const cfg = Dev.params('Audio / FX', {
    masterVolume: { value: 0.5, min: 0, max: 1, step: 0.05, label: 'Master volume' },
    muted: { value: false, type: 'boolean', label: 'Mute' },
    ripples: { value: true, type: 'boolean', label: 'Click ripples' },
    particles: { value: true, type: 'boolean', label: 'Particle bursts' },
    particleCount: { value: 10, min: 0, max: 40, step: 1, label: 'Particles per burst' },
    particleSpeed: { value: 40, min: 10, max: 150, step: 5, label: 'Particle distance (px)' }
  });

  const sounds = {
    click: { freq: 660, to: 520, dur: 0.07, type: 'triangle', gain: 0.5 },
    pickup: { freq: 440, to: 640, dur: 0.09, type: 'sine', gain: 0.5 },
    drop: { freq: 300, to: 180, dur: 0.12, type: 'square', gain: 0.35 },
    pop: { freq: 520, to: 260, dur: 0.1, type: 'sine', gain: 0.5 },
    error: { freq: 160, to: 110, dur: 0.2, type: 'sawtooth', gain: 0.35 },
    win: { freq: 523, to: 1046, dur: 0.35, type: 'triangle', gain: 0.5 }
  };

  let ctx = null;
  const files = new Map();

  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function play(name) {
    if (cfg.muted || cfg.masterVolume <= 0) return;
    const def = sounds[name];
    if (!def) return;

    if (def.src) {
      let base = files.get(name);
      if (!base) { base = new Audio(def.src); files.set(name, base); }
      const a = base.cloneNode();
      a.volume = cfg.masterVolume * (def.gain ?? 1);
      a.play().catch(() => {});
      return;
    }

    const ac = audio();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = def.type || 'sine';
    osc.frequency.setValueAtTime(def.freq, t);
    if (def.to) osc.frequency.exponentialRampToValueAtTime(def.to, t + def.dur);
    const peak = cfg.masterVolume * (def.gain ?? 0.5);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + def.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + def.dur + 0.02);
  }

  function registerSound(name, def) {
    sounds[name] = def;
    files.delete(name);
  }

  function ripple(x, y, color = 'rgba(59,130,246,.55)') {
    if (!cfg.ripples) return;
    const el = document.createElement('div');
    el.className = 'fx-ripple';
    el.style.cssText = `left:${x}px;top:${y}px;border-color:${color}`;
    document.body.appendChild(el);
    el.animate(
      [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }],
      { duration: 420, easing: 'ease-out' }
    ).onfinish = () => el.remove();
  }

  function burst(x, y, color = '#3b82f6') {
    if (!cfg.particles) return;
    for (let i = 0; i < cfg.particleCount; i++) {
      const p = document.createElement('div');
      p.className = 'fx-particle';
      p.style.cssText = `left:${x}px;top:${y}px;background:${color}`;
      document.body.appendChild(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = cfg.particleSpeed * (0.5 + Math.random() * 0.8);
      p.animate(
        [{ transform: 'translate(-50%,-50%)', opacity: 1 },
         { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px))`, opacity: 0 }],
        { duration: 450 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.3,1)' }
      ).onfinish = () => p.remove();
    }
  }

  function handleClick(e) {
    const el = e.target.closest?.('button, [data-fx]');
    if (!el || el.disabled) return;
    const name = el.dataset.fx || 'click';
    if (name === 'none') return;
    play(name);
    ripple(e.clientX, e.clientY);
  }

  // pointerdown also unlocks the AudioContext on first touch.
  document.addEventListener('pointerdown', handleClick);

  return { cfg, play, registerSound, ripple, burst };
})();
