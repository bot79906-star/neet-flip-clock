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

// Shows the reminder card on top of whatever page this runs in.
//
// The card is popup.html in an iframe. The iframe IS the card: its rounded corners and
// shadow come from here and popup.html paints an opaque background, so it looks the same
// on every site and never leaves a box around it. All motion is transform and opacity,
// played as spring keyframes on the compositor, so a busy page cannot make it stutter.
(() => {
  'use strict';

  const HOST_ID = 'neet-reminder-host';
  const WIDTH = 360;
  const RADIUS = 22;
  const TRAVEL = 40; // px the card slides in from the right

  function show() {
    const old = document.getElementById(HOST_ID);
    if (old) old.remove();

    const reduced = Motion.reduced();

    // in full-screen video the card has to live inside the fullscreen element
    const fs = document.fullscreenElement;
    const parent = fs && !/^(VIDEO|IFRAME|IMG|CANVAS|EMBED|OBJECT)$/.test(fs.tagName) ? fs : document.documentElement;

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('popover', 'manual'); // top layer, above everything else

    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent =
      ':host{all:initial;display:block;position:fixed;top:16px;right:16px;bottom:auto;left:auto;' +
      'width:' + WIDTH + 'px;max-width:calc(100vw - 32px);height:176px;margin:0;padding:0;border:0;' +
      'background:transparent;overflow:visible;opacity:0;z-index:2147483647;color-scheme:dark;transform-origin:100% 0}' +
      'iframe{display:block;width:100%;height:100%;border:0;border-radius:' + RADIUS + 'px;background:#161617;color-scheme:dark;' +
      'box-shadow:0 0 0 1px rgba(0,0,0,.35),0 22px 44px -14px rgba(0,0,0,.6),0 6px 14px -4px rgba(0,0,0,.35)}' +
      // an invisible layer over the whole card: the page itself handles hover, click and swipe
      '.grip{position:absolute;inset:0;border-radius:' + RADIUS + 'px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}' +
      '.grip.down{cursor:grabbing}.grip.over-close{cursor:pointer}';

    const frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html');
    frame.setAttribute('title', 'NEET UG 2028 reminder');
    const grip = document.createElement('div');
    grip.className = 'grip';
    root.append(style, frame, grip);
    parent.appendChild(host);
    try { host.showPopover(); } catch (e) { /* older Chrome: fixed + z-index still works */ }

    let done = false, entered = false, leaving = false, dragging = false;
    let enterAnim = null;
    let dragX = 0, dragO = 1;
    let readyTimer, showTimer, hardStop;

    function cleanup() {
      if (done) return;
      done = true;
      clearTimeout(readyTimer);
      clearTimeout(showTimer);
      clearTimeout(hardStop);
      window.removeEventListener('message', onMessage);
      host.remove();
    }

    // end the arrival at once and leave the card at rest
    function settle() {
      if (enterAnim) { try { enterAnim.cancel(); } catch (e) { /* ignore */ } enterAnim = null; }
      host.style.opacity = '1';
      host.style.willChange = '';
    }

    // arrival: slides in from the right on a spring while it fades up
    function enter() {
      if (entered || done) return;
      entered = true;
      clearTimeout(showTimer);
      if (reduced) { host.style.opacity = '1'; return; }
      host.style.willChange = 'transform, opacity';
      enterAnim = Motion.play(host, (p) => ({
        transform: 'translate3d(' + ((1 - p) * TRAVEL).toFixed(2) + 'px,0,0)',
        opacity: Motion.clamp01(p * 1.8),
      }), { stiffness: 170, damping: 19, fill: 'both' });
      enterAnim.finished.then(settle, () => {});
    }

    // normal exit: a short, quiet slide away
    function leave() {
      if (leaving || dragging || done) return;
      leaving = true;
      settle();
      if (reduced) { cleanup(); return; }
      host.style.willChange = 'transform, opacity';
      const a = host.animate(
        [{ transform: 'translate3d(0,0,0)', opacity: 1 },
         { transform: 'translate3d(' + Math.round(TRAVEL * 0.7) + 'px,0,0)', opacity: 0 }],
        { duration: 300, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
      a.onfinish = cleanup;
    }

    /* swipe to dismiss: the card follows the pointer and rubber-bands to the left.
       Pointer positions are read here, in the page, where nothing moves under the pointer. */
    const say = (cmd) => {
      try { frame.contentWindow.postMessage(Object.assign({ neetCmd: true }, cmd), '*'); } catch (e) { /* ignore */ }
    };
    let gesture = null;

    function dragStart() {
      if (leaving || done) return;
      dragging = true;
      settle();
      host.style.willChange = 'transform, opacity';
    }

    function dragMove(dx) {
      if (!dragging) return;
      dragX = dx > 0 ? dx : dx * 0.2;
      dragO = Math.max(0, 1 - Math.max(0, dx) / 320);
      host.style.transform = 'translate3d(' + dragX + 'px,0,0)';
      host.style.opacity = String(dragO);
    }

    function release(dx, v) {
      if (!dragging) return;
      dragging = false;

      // dragged far enough, or flicked (fast, and not just a twitch)
      if (dx > 90 || (dx > 28 && v > 0.45)) {
        leaving = true;
        if (reduced) { cleanup(); return; }
        const a = host.animate(
          [{ transform: 'translate3d(' + dragX + 'px,0,0)', opacity: dragO },
           { transform: 'translate3d(' + (Math.max(dragX, 0) + 260) + 'px,0,0)', opacity: 0 }],
          { duration: 240, easing: 'cubic-bezier(0.3, 0, 0.9, 0.6)', fill: 'forwards' });
        a.onfinish = cleanup;
        return;
      }

      // let go early: springs back
      if (reduced) { host.style.transform = ''; host.style.opacity = '1'; return; }
      const x0 = dragX, o0 = dragO;
      const back = Motion.play(host, (p) => ({
        transform: 'translate3d(' + (x0 * (1 - p)).toFixed(2) + 'px,0,0)',
        opacity: o0 + (1 - o0) * Motion.clamp01(p),
      }), { stiffness: 260, damping: 24, fill: 'both' });
      back.finished.then(() => { host.style.transform = ''; host.style.opacity = '1'; host.style.willChange = ''; back.cancel(); }, () => {});
    }

    // the close button's hit area, in page coordinates (the button itself is drawn by the card)
    function inCloseZone(e) {
      const b = grip.getBoundingClientRect();
      return e.clientX >= b.right - 54 && e.clientX <= b.right - 6 && e.clientY >= b.top + 8 && e.clientY <= b.top + 56;
    }
    let overClose = false;
    function setOverClose(on) {
      if (on === overClose) return;
      overClose = on;
      grip.classList.toggle('over-close', on);
      say({ close: on });
    }

    let closePress = false;

    grip.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say({ hover: true }); });
    grip.addEventListener('pointerleave', () => {
      if (gesture || closePress) return;
      setOverClose(false);
      say({ hover: false });
    });

    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || leaving || done) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      if (inCloseZone(e)) { closePress = true; return; }
      gesture = { id: e.pointerId, x0: e.clientX, dx: 0, samples: [{ x: e.clientX, t: e.timeStamp }] };
      grip.classList.add('down');
      say({ drag: true });
      dragStart();
    });

    grip.addEventListener('pointermove', (e) => {
      if (!gesture) { setOverClose(inCloseZone(e)); return; }
      if (e.pointerId !== gesture.id) return;
      gesture.dx = e.clientX - gesture.x0;
      gesture.samples.push({ x: e.clientX, t: e.timeStamp });
      while (gesture.samples.length > 2 && e.timeStamp - gesture.samples[0].t > 100) gesture.samples.shift();
      dragMove(gesture.dx);
    });

    function endGesture(e) {
      if (closePress) {
        closePress = false;
        if (e.type === 'pointerup' && inCloseZone(e)) leave();
        else setOverClose(inCloseZone(e));
        return;
      }
      if (!gesture || e.pointerId !== gesture.id) return;
      const g = gesture;
      gesture = null;
      grip.classList.remove('down');
      say({ drag: false });
      // speed over the last ~100 ms (px per ms); a pause before letting go means no flick
      const first = g.samples[0];
      const last = g.samples[g.samples.length - 1];
      const stale = e.timeStamp - last.t > 80;
      const v = stale || last.t === first.t ? 0 : (last.x - first.x) / (last.t - first.t);
      release(g.dx, v);
    }
    grip.addEventListener('pointerup', endGesture);
    grip.addEventListener('pointercancel', endGesture);

    function onMessage(e) {
      if (e.source !== frame.contentWindow || !e.data || e.data.neet !== true) return;
      const m = e.data;
      switch (m.type) {
        case 'ready':
          clearTimeout(readyTimer);
          showTimer = setTimeout(enter, 2500); // safety net if 'show' never comes
          break;
        case 'size': if (m.height > 0) host.style.height = m.height + 'px'; break;
        case 'show': enter(); break;
        case 'leave': case 'close': leave(); break;
      }
    }
    window.addEventListener('message', onMessage);

    // if the card never loads here (a page that blocks it), ask the background to show it as a window instead
    readyTimer = setTimeout(() => {
      cleanup();
      try { chrome.runtime.sendMessage({ type: 'notify-fallback' }); } catch (e) { /* ignore */ }
    }, 8000);

    hardStop = setTimeout(cleanup, 40000);
  }

  self.neetShowReminder = show;
})();


self.neetShowReminder();
