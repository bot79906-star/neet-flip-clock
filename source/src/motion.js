// Motion engine.
//
// Real damped-spring physics, sampled 120 times a second and played as plain keyframes.
// Because every frame is spelled out, the browser can run the whole animation on the
// compositor thread, so it stays perfectly smooth even when the page underneath is
// busy (YouTube, for example). Only transform and opacity are ever animated.
(() => {
  'use strict';

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // step response of a spring going from 0 to 1 (a little overshoot is what makes it feel alive)
  function curve({ stiffness = 170, damping = 20, mass = 1 } = {}) {
    const w0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    let pos;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      pos = (t) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    } else {
      pos = (t) => 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    }
    let settle = 0;
    for (let t = 0; t < 4; t += 1 / 240) if (Math.abs(pos(t) - 1) > 0.0015) settle = t;
    const duration = Math.min(settle + 1 / 60, 1.6);
    const n = Math.max(24, Math.ceil(duration * 120));
    const values = [];
    for (let i = 0; i <= n; i++) values.push(i === n ? 1 : pos((i / n) * duration));
    return { duration: duration * 1000, values };
  }

  // play a spring on `el`. frame(p) returns the css for progress p (p can pass 1 a little)
  function play(el, frame, { stiffness, damping, mass, delay = 0, fill = 'backwards' } = {}) {
    const c = curve({ stiffness, damping, mass });
    const last = c.values.length - 1;
    const keyframes = c.values.map((p, i) => Object.assign({ offset: i / last, easing: 'linear' }, frame(p)));
    return el.animate(keyframes, { duration: c.duration, delay, fill });
  }

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // the same soft fade-and-rise used all over the place
  function rise(el, { delay = 0, dy = 10, dx = 0, stiffness = 150, damping = 21 } = {}) {
    return play(el, (p) => ({
      opacity: clamp01(p * 1.3),
      transform: 'translate3d(' + ((1 - p) * dx).toFixed(2) + 'px,' + ((1 - p) * dy).toFixed(2) + 'px,0)',
    }), { delay, stiffness, damping });
  }

  self.Motion = { reduced, curve, play, rise, clamp01 };
})();
