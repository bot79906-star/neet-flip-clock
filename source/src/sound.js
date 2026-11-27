// Tiny synthesised sounds (no audio files). Browsers only allow audio after a click or key
// press on the page, so until then these stay silent instead of failing.
(() => {
  'use strict';
  let ctx = null;
  const ready = () => ctx && ctx.state === 'running';

  function unlock() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* no audio */ }
  }
  ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, unlock, { passive: true }));

  // a soft three-note chime: rising for "go", falling for "rest"
  function chime(kind) {
    if (!ready()) return;
    const notes = kind === 'rest' ? [880, 659.25, 523.25] : [523.25, 659.25, 880];
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = t0 + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 1.2);
    });
  }

  // the mechanical "tk" of a flap landing
  function click() {
    if (!ready()) return;
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.22;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }

  self.Sound = { chime, click };
})();
