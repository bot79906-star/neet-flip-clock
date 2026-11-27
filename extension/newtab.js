// Shared by the new tab page, the reminder card and the background worker.
(() => {
  'use strict';

  // NTA hasn't announced the NEET UG 2028 date yet. NEET is normally held on the
  // first Sunday of May, which in 2028 is 7 May. Change it from the new tab page.
  const DEFAULT_TARGET = '2028-05-01';
  const DEFAULT_REMINDER_MINUTES = 60; // every 1 hour
  const POPUP_SECONDS = 12;            // how long the card stays on screen

  const pad = (n) => String(n).padStart(2, '0');

  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d;
  }

  function toISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addMonths(d, n) {
    const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    first.setDate(Math.min(d.getDate(), lastDay));
    return first;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // whole calendar months, then the leftover days
  function remaining(now, target) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (target <= today) return { months: 0, days: 0, total: 0 };

    let months = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
    let anchor = addMonths(today, months);
    if (anchor > target) {
      months -= 1;
      anchor = addMonths(today, months);
    }
    return {
      months,
      days: Math.round((target - anchor) / 864e5),
      total: Math.round((target - today) / 864e5),
    };
  }

  function describe(r) {
    const m = r.months === 1 ? '1 month' : r.months + ' months';
    const d = r.days === 1 ? '1 day' : r.days + ' days';
    return m + ', ' + d;
  }

  async function getTarget() {
    const { targetDate } = await chrome.storage.local.get({ targetDate: null });
    const saved = parseISO(targetDate);
    return saved ? { date: saved, custom: true } : { date: parseISO(DEFAULT_TARGET), custom: false };
  }

  self.NEET = { DEFAULT_TARGET, DEFAULT_REMINDER_MINUTES, POPUP_SECONDS, pad, parseISO, toISO, sameDay, remaining, describe, getTarget };
})();

// Motivation lines, shared by the new tab, the reminder card and notifications.
// Tokens: {left} days left, {gone} days gone, {total} plan days, {weeks} weeks left, {hrs} hours of today left.
// One shared deck: a line shown in one place is not drawn again anywhere for a long while.
(() => {
  'use strict';

  const TIME = [
    '{left} days left. Spend today like it matters.',
    '{gone} days are gone. They are not coming back.',
    '{gone} days behind you, {left} ahead. Make the next one count.',
    '{weeks} weeks left. Every week is a chapter.',
    '{hrs} hours of today are still yours.',
    'The clock does not wait for you to feel ready.',
    'Today will never come again. Use all of it.',
    'Every sunrise is one less day to prepare. Be ready for the last one.',
    '{left} days is enough for someone who stops wasting them.',
    'Exam day is not far. Your habits will decide the result.',
    'Time passes whether you study or not. Choose to study.',
    'One day of the {total} is being spent right now.',
    'By this time next week, you will have done the work or the excuses.',
    'Count the days. Then make each one count.',
    'The days are few and the goal is big. Move.',
    '{hrs} hours remain today. What will they hold?',
  ];

  const WILL = [
    'Do it tired. Do it bored. Do it anyway.',
    'Small hours every day beat big plans.',
    'Future you is counting on this hour.',
    'Motivation fades. Discipline stays.',
    'You do not need more time. You need more focus.',
    'Start before you feel ready.',
    'The hard part is the first ten minutes. Pass them.',
    'Be the student your exam deserves.',
    'Comfort is the quiet enemy of rank.',
    'Every chapter you finish is a mark you will not lose.',
    'Your competition is studying right now.',
    'Stay with one topic until it surrenders.',
    'Consistency is boring. It is also how people win.',
    'No phone. No noise. One chapter.',
    'Doctors are made in the hours nobody sees.',
    'Do not negotiate with the alarm. Get up and begin.',
    'Hard now, easy later. Easy now, hard later.',
    'Revise what you know. Learn what you do not. Repeat.',
    'A distracted hour is an hour you do not get back.',
    'Win the morning and the day follows.',
    'Pressure builds diamonds. Keep going.',
    'Show up on the days you do not want to. That is the whole secret.',
    'Mistakes in practice are marks saved in the exam.',
    'Be proud of the work, not the plan.',
    'The white coat is earned one page at a time.',
    'You chose this. Honour that choice today.',
    'Quit scrolling. Open the book.',
    'Your future patients are waiting for you to be ready.',
    'One more question. Then one more.',
    'Sleep on time, wake on time, study on time.',
  ];

  const FOCUS = [
    'One task only. Everything else can wait.',
    'Stay in it. The session is short, the reward is long.',
    'Eyes on the page. Nothing else exists right now.',
    'Do not touch the phone. Finish the block.',
    'You are building the version of you that clears this exam.',
    'Deep work now. Rest is coming.',
    'Stay with the hard part. That is where the marks are.',
  ];

  const REST = [
    'Rest properly: water, stretch, look far away.',
    'Rest is part of the plan. Do not scroll it away.',
    'Breathe. Walk a little. Then back in.',
    'Relax your eyes. Look at something 20 feet away.',
    'Take a short break. Do not open social media.',
  ];

  const DAYPART = {
    morning: ['Good morning. Win the first hour and the day is yours.', 'The morning is the quietest classroom. Use it.', 'While the world wakes up, you are already ahead.'],
    afternoon: ['The afternoon dip is where winners keep going.', 'Half the day is gone. Make the other half count.', 'Stand up, drink water, sit down, continue.'],
    evening: ['Evening is for revision. Lock in what you learned today.', 'Close the day with one more focused hour.', 'Review today. What will you do better tomorrow?'],
    night: ['Rest well. Tomorrow needs a fresh mind.', 'Plan tomorrow in five minutes, then sleep.', 'Sleep is part of studying. Protect it.'],
  };

  const SPECIAL = {
    over: 'The plan has ended. Set the next target.',
    exam: 'Exam day. Trust the work you put in.',
    before: 'Your plan has not begun. Prepare for it.',
  };

  const recent = [];
  const fill = (t, c) => t
    .replace('{left}', c.left).replace('{gone}', c.gone).replace('{total}', c.total)
    .replace('{weeks}', c.weeks).replace('{hrs}', c.hrs);

  // kind: 'any' | 'time' | 'will'
  function next(ctx, kind) {
    ctx = Object.assign({ left: 0, gone: 0, total: 0, weeks: 0, hrs: 0, mode: 'idle', daypart: 'morning' }, ctx);
    kind = kind || 'any';
    if (ctx.over) return SPECIAL.over;
    if (ctx.examDay) return SPECIAL.exam;
    if (ctx.notStarted) return SPECIAL.before;

    let pool;
    if (kind === 'time') pool = TIME;
    else if (kind === 'will') pool = WILL;
    else pool = TIME.concat(WILL, DAYPART[ctx.daypart] || []);
    if (ctx.mode === 'focus' && kind !== 'time') pool = pool.concat(FOCUS, FOCUS);
    if (ctx.mode === 'rest' && kind !== 'time') pool = REST.concat(REST, pool);

    const fresh = pool.map((t) => fill(t, ctx)).filter((t) => !recent.includes(t));
    const list = fresh.length ? fresh : pool.map((t) => fill(t, ctx));
    const pick = list[Math.floor(Math.random() * list.length)];
    recent.push(pick);
    if (recent.length > 24) recent.shift();
    return pick;
  }

  function daypart(d) {
    const h = (d || new Date()).getHours();
    return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  }

  self.NEET.lines = { next, daypart, count: TIME.length + WILL.length + FOCUS.length + REST.length + 12 };
})();

// Focus timer + study log, shared by the new tab page and the background worker.
//
// The timer never "ticks" in storage. It stores only WHEN the current phase ends (endAt) and
// when the current focus stretch began (segStart). Any page, or the background worker, can
// work out the exact state at any moment, and closing the tab never loses a second.
(() => {
  'use strict';
  const N = self.NEET;

  const DEFAULT_START = '2026-04-01'; // 2-year plan: 1 Apr 2026 to 1 May 2028 is 761 days

  const CFG = {
    focus: 25, short: 5, long: 15, every: 4,   // minutes, minutes, minutes, sessions per cycle
    auto: false,                                // start the next phase by itself
    goal: 6,                                    // daily study goal, hours
    reminderMinutes: 60,                        // the reminder card, every n minutes
    sound: true, flipSound: false, showSeconds: false,
    fx: 'full',                                 // effects: full | light | off
  };

  const clampN = (v, lo, hi, d) => { v = Math.round(+v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  function sane(c) {
    return Object.assign({}, c, {
      fx: ['full', 'light', 'off'].includes(c.fx) ? c.fx : 'full',
      focus: clampN(c.focus, 1, 99, 25), short: clampN(c.short, 1, 60, 5), long: clampN(c.long, 1, 90, 15),
      every: clampN(c.every, 2, 8, 4), goal: clampN(c.goal, 1, 16, 6), reminderMinutes: clampN(c.reminderMinutes, 5, 240, 60),
    });
  }
  const getCfg = async () => sane(await chrome.storage.local.get(CFG));

  const phaseMs = (p, c) => (p === 'focus' ? c.focus : p === 'short' ? c.short : c.long) * 60000;
  const SUBJECTS = { phy: ['Physics', '#64d2ff'], chem: ['Chemistry', '#ffd60a'], bot: ['Botany', '#30d158'], zoo: ['Zoology', '#ff6b81'] };
  const fresh = (c) => ({ subject: 'phy', phase: 'focus', status: 'idle', endAt: 0, remaining: phaseMs('focus', c), segStart: 0, done: 0 });

  // every browser install has its own id: logs are kept per install and merged, never overwritten
  async function getIid() {
    const { iid } = await chrome.storage.local.get({ iid: null });
    if (iid) return iid;
    const fresh = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    await chrome.storage.local.set({ iid: fresh });
    return fresh;
  }

  // own: { day: rec }, remote: { iid: { day: rec } }  ->  { day: rec }
  // focus time, sessions and subjects add up across browsers; device-on time is the same machine, so it takes the largest
  function mergeLogs(own, remote) {
    const out = {};
    const days = new Set(Object.keys(own || {}));
    Object.values(remote || {}).forEach((r) => Object.keys(r || {}).forEach((d) => days.add(d)));
    days.forEach((day) => {
      const recs = [(own || {})[day]].concat(Object.values(remote || {}).map((r) => r && r[day])).filter(Boolean);
      const o = {};
      recs.forEach((rec) => Object.keys(rec).forEach((k) => { o[k] = k === 'desk' ? Math.max(o.desk || 0, rec.desk) : (o[k] || 0) + rec[k]; }));
      out[day] = o;
    });
    return out;
  }

  /* ---------- the study log: { 'YYYY-MM-DD': { focus: seconds, sessions: n, desk: seconds } } ---------- */
  async function addLog(patch, iso) {
    iso = iso || N.toISO(new Date());
    const { studyLog } = await chrome.storage.local.get({ studyLog: {} });
    const e = studyLog[iso] || { focus: 0, sessions: 0, desk: 0 };
    for (const k in patch) e[k] = (e[k] || 0) + patch[k];
    studyLog[iso] = e;
    const cut = N.toISO(new Date(Date.now() - 400 * 864e5));
    for (const k of Object.keys(studyLog)) if (k < cut) delete studyLog[k];
    await chrome.storage.local.set({ studyLog });
  }

  /* ---------- actions. One at a time per context; each reads, changes, writes ---------- */
  let queue = Promise.resolve();
  function act(type, arg) {
    const p = queue.then(() => run(type, arg));
    queue = p.catch(() => {});
    return p;
  }

  async function run(type, arg) {
    const cfg = await getCfg();
    const iid = await getIid();
    const { timer } = await chrome.storage.local.get({ timer: null });
    const s = timer || fresh(cfg);
    if (!SUBJECTS[s.subject]) s.subject = 'phy';
    const now = Date.now();
    let finished = null;

    const accrue = async (until) => {
      if (s.phase === 'focus' && s.status === 'running' && s.segStart) {
        const secs = (Math.min(until, now) - s.segStart) / 1000;
        if (secs > 0.2) await addLog({ focus: Math.round(secs), ['s_' + s.subject]: Math.round(secs) });
      }
      s.segStart = 0;
    };
    const begin = () => { s.o = iid; s.status = 'running'; s.endAt = now + s.remaining; s.segStart = s.phase === 'focus' ? now : 0; };
    const goTo = (phase) => { s.phase = phase; s.remaining = phaseMs(phase, cfg); s.status = 'idle'; s.endAt = 0; s.segStart = 0; };

    if (type === 'toggle') {
      if (s.status === 'running') {
        await accrue(now);
        s.remaining = Math.max(1000, s.endAt - now);
        s.status = 'paused';
      } else begin();
    } else if (type === 'complete') {
      if (s.status !== 'running' || s.endAt > now + 800) return { state: s, finished: null };
      // the browser that started the session finishes it; the other one only steps in if that one never does
      if (s.o && s.o !== iid && now < s.endAt + 25000) return { state: s, finished: null };
      await accrue(s.endAt);
      finished = s.phase;
      if (s.phase === 'focus') {
        await addLog({ sessions: 1 });
        s.done += 1;
        if (s.done >= cfg.every) { s.done = 0; goTo('long'); } else goTo('short');
      } else goTo('focus');
      if (cfg.auto) begin();
    } else if (type === 'skip') {
      await accrue(now);
      goTo(s.phase === 'focus' ? 'short' : 'focus');
    } else if (type === 'reset') {
      await accrue(now);
      goTo(s.phase);
    } else if (type === 'restart') {   // the whole cycle, from the first session
      await accrue(now);
      Object.assign(s, fresh(cfg));
    } else if (type === 'subject') {   // a running session is split: time so far stays with the old subject
      if (SUBJECTS[arg] && arg !== s.subject) { const was = s.status === 'running' && s.phase === 'focus'; await accrue(now); s.subject = arg; if (was) s.segStart = now; }
    } else if (type === 'refresh') {   // lengths changed in settings
      if (s.status === 'idle') s.remaining = phaseMs(s.phase, cfg);
    }

    s.u = now;
    await chrome.storage.local.set({ timer: s });
    return { state: s, finished };
  }

  // what the clock should show right now
  function view(s, cfg, now) {
    now = now || Date.now();
    const total = phaseMs(s.phase, cfg);
    const left = s.status === 'running' ? Math.max(0, s.endAt - now) : s.remaining;
    return { left, total, frac: Math.min(1, Math.max(0, 1 - left / total)) };
  }

  // focus seconds for a day, including the stretch that is running right now
  function focusToday(log, s, now) {
    now = now || Date.now();
    const base = ((log[N.toISO(new Date(now))] || {}).focus) || 0;
    const live = s && s.status === 'running' && s.phase === 'focus' && s.segStart ? Math.max(0, (now - s.segStart) / 1000) : 0;
    return base + live;
  }

  function fmtHM(sec) {
    const m = Math.floor(sec / 60);
    return m >= 60 ? Math.floor(m / 60) + 'h ' + N.pad(m % 60) + 'm' : m + 'm';
  }

  // "412 days ago" / "in 53 days" / "today"
  function relative(date, now) {
    const t = new Date((now || new Date()).getFullYear(), (now || new Date()).getMonth(), (now || new Date()).getDate());
    const d = Math.round((date - t) / 864e5);
    if (d === 0) return 'today';
    const n = Math.abs(d);
    const txt = n === 1 ? '1 day' : n + ' days';
    return d > 0 ? 'in ' + txt : txt + ' ago';
  }

  N.timer = { getIid, mergeLogs, SUBJECTS, CFG, DEFAULT_START, sane, getCfg, phaseMs, fresh, addLog, act, view, focusToday, fmtHM, relative };
})();

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

// The flip card used by the new tab page and the reminder card.
//
// reveal(): the top half rises into place on a spring (real digits, never placeholders).
// set():    the physical flip. The top half falls with gravity and darkens, the bottom half
//           lands with a tiny rebound and the card gives a hair of a thud. Light follows the angle.
// All of it is transform and opacity, so it runs on the compositor.
(() => {
  'use strict';

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FALL = 230;   // ms, top half falls
  const LAND = 300;   // ms, bottom half lands

  class FlipCard {
    constructor(parent, initial) {
      this.el = document.createElement('div');
      this.el.className = 'flip';
      this.el.innerHTML =
        '<div class="half upper"><span></span><i class="shade"></i></div>' +
        '<div class="half lower"><span></span><i class="shade"></i></div>' +
        '<div class="flap front"><span></span><i class="shade"></i><i class="gloss"></i></div>' +
        '<div class="flap back"><span></span><i class="shade"></i><i class="gloss"></i></div>';

      const q = (s) => this.el.querySelector(s);
      this.parts = {
        upper: { box: q('.upper'), text: q('.upper span'), shade: q('.upper .shade') },
        lower: { box: q('.lower'), text: q('.lower span'), shade: q('.lower .shade') },
        front: { box: q('.front'), text: q('.front span'), shade: q('.front .shade'), gloss: q('.front .gloss') },
        back:  { box: q('.back'),  text: q('.back span'),  shade: q('.back .shade'), gloss: q('.back .gloss') },
      };
      this.value = initial;
      this.anims = [];
      this.token = 0;
      this.paint(initial);
      parent.appendChild(this.el);
    }

    paint(v) {
      for (const k in this.parts) this.parts[k].text.textContent = v;
    }

    // arrival: the card lifts into place while its top half swings up on a spring
    reveal(delay = 0) {
      if (reduced() || !this.el.isConnected) return;
      const up = this.parts.upper;
      // arrival never overshoots (no card pushed past its place, no flap poking out): p is capped at 1
      Motion.play(this.el, (p) => ({
        opacity: Motion.clamp01(p * 2.4),
        transform: 'translate3d(0,' + ((1 - Math.min(1, p)) * 20).toFixed(2) + 'px,0)',
      }), { stiffness: 190, damping: 25, delay });
      Motion.play(up.box, (p) => ({ transform: 'rotateX(' + (-(1 - Math.min(1, p)) * 88).toFixed(2) + 'deg)' }),
        { stiffness: 150, damping: 24, delay: delay + 40 });
      Motion.play(up.shade, (p) => ({ opacity: Motion.clamp01(0.75 * (1 - p)).toFixed(3) }),
        { stiffness: 150, damping: 22, delay: delay + 40 });
    }

    // end any running flip and leave the card at rest
    stop() {
      this.token++;
      this.anims.forEach((a) => a.cancel());
      this.anims = [];
      this.el.classList.remove('flipping');
    }

    // speed: 1 is the full flip; the seconds use a quicker one so the card is at rest most of every second
    set(next, { animate = true, speed = 1 } = {}) {
      if (next === this.value) return;
      const prev = this.value;
      this.value = next;
      this.stop();

      if (!animate || reduced() || document.hidden || !this.el.isConnected) {
        this.paint(next);
        return;
      }

      const p = this.parts;
      p.upper.text.textContent = next;   // waits underneath
      p.front.text.textContent = prev;   // falls away
      p.back.text.textContent = next;    // lands
      p.lower.text.textContent = prev;
      this.el.classList.add('flipping');

      const fallMs = Math.round(FALL * speed), landMs = Math.round(LAND * speed);
      const run = (el, keyframes, options) => {
        const a = el.animate(keyframes, Object.assign({ fill: 'both' }, options));
        this.anims.push(a);
        return a;
      };

      // 1. the top half falls forward: slow start, gains speed (gravity). It stays inside the card's outline.
      const fall = { duration: fallMs, easing: 'cubic-bezier(0.55, 0, 0.92, 0.6)' };
      run(p.front.box, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], fall);
      run(p.front.gloss, [{ opacity: 0 }, { opacity: 0.22, offset: 0.55 }, { opacity: 0 }], fall);
      run(p.front.shade, [{ opacity: 0 }, { opacity: 0.72 }], fall);
      run(p.lower.shade, [{ opacity: 0 }, { opacity: 0.5 }], fall);
      run(p.upper.shade, [{ opacity: 0.38 }, { opacity: 0 }], { duration: fallMs + 40, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' });

      // 2. the bottom half swings down and lands flat. It never goes past flat, so it never pokes out of the card.
      const land = { duration: landMs, delay: fallMs, easing: 'cubic-bezier(0.18, 0.8, 0.3, 1)' };
      const last = run(p.back.box, [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], land);
      run(p.back.gloss, [{ opacity: 0.3 }, { opacity: 0 }], land);
      run(p.back.shade, [{ opacity: 0.72 }, { opacity: 0 }], land);

      const t = this.token;
      if (self.FlipCard.onLand) setTimeout(() => { if (t === this.token) self.FlipCard.onLand(); }, fallMs + landMs * 0.4);
      last.onfinish = () => {
        if (t !== this.token) return;
        this.paint(next);
        this.stop();
      };
    }
  }

  self.FlipCard = FlipCard;
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

(() => {
  'use strict';

  const { pad, parseISO, toISO, remaining, sameDay } = NEET;
  const T = NEET.timer;
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const reduce = () => Motion.reduced();
  const DAY = 864e5;

  /* ---- settings: paint at once from a local copy, then reconcile with chrome.storage ---- */
  const CACHE_KEY = 'neet.cache';
  const DEFAULTS = Object.assign({ targetDate: null, keepAwake: true, reminders: true, startDate: null, refs: [] }, T.CFG);
  const settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')); } catch (e) { /* ignore */ }
  if (!settings.targetDate) {
    try { // version 1 kept the date under another key
      const old = localStorage.getItem('neetTargetDate');
      if (old && parseISO(old)) settings.targetDate = old;
    } catch (e) { /* ignore */ }
  }

  function cache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  function persist(patch) {
    Object.assign(settings, patch);
    cache();
    return chrome.storage.local.set(patch);
  }
  const cfg = () => T.sane(settings);

  const resolveTarget = (iso) => {
    const d = parseISO(iso);
    return d ? { date: d, custom: true } : { date: parseISO(NEET.DEFAULT_TARGET), custom: false };
  };
  let target = resolveTarget(settings.targetDate);

  /* ---- timer state and study log: also cached, so the very first frame is already right ---- */
  const readCache = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  let ts = readCache('neet.timer', null) || T.fresh(cfg());
  let log = readCache('neet.log', {});
  const saveCache = () => {
    try { localStorage.setItem('neet.timer', JSON.stringify(ts)); localStorage.setItem('neet.log', JSON.stringify(log)); } catch (e) { /* ignore */ }
  };

  /* ---- clock + countdown ---- */
  const clockEl = $('clock');
  const todayEl = $('today');
  const targetText = $('target-text');
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const targetFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  // always 12-hour, whatever the system locale says
  function values(now) {
    const h = now.getHours();
    return {
      hours: pad(h % 12 || 12),
      minutes: pad(now.getMinutes()),
      seconds: pad(now.getSeconds()),
      ampm: h < 12 ? 'AM' : 'PM',
      r: remaining(now, target.date),
    };
  }

  // built synchronously on the real values: no placeholders, ever
  const first = values(new Date());
  const hoursCard = new FlipCard(clockEl, first.hours);
  const minutesCard = new FlipCard(clockEl, first.minutes);
  const secondsCard = new FlipCard(clockEl, first.seconds);
  secondsCard.el.style.display = 'none';
  const monthsCard = new FlipCard($('months'), pad(first.r.months));
  const daysCard = new FlipCard($('days'), pad(first.r.days));

  const f0 = T.view(ts, cfg());
  const f0s = Math.ceil(f0.left / 1000);
  const fMinCard = new FlipCard($('f-min'), pad(Math.floor(f0s / 60)));
  const fSecCard = new FlipCard($('f-sec'), pad(f0s % 60));

  const ampm = document.createElement('span');
  ampm.className = 'tag';
  hoursCard.el.appendChild(ampm);

  function paintText(now, v) {
    const day = dayFmt.format(now);
    if (todayEl.textContent !== day) todayEl.textContent = day;
    if (ampm.textContent !== v.ampm) ampm.textContent = v.ampm;
    clockEl.setAttribute('aria-label', 'Current time ' + v.hours + ':' + v.minutes + ' ' + v.ampm);

    let note;
    if (v.r.total > 0) {
      note = v.r.total + ' days to go · ' + targetFmt.format(target.date) + (target.custom ? '' : ' (expected date)');
    } else if (sameDay(now, target.date)) {
      note = 'Exam day · ' + targetFmt.format(target.date);
    } else {
      note = 'This date has passed. Set a new one.';
    }
    if (targetText.textContent !== note) targetText.textContent = note;
  }

  let current = 'count';
  const ORDER = ['count', 'focus', 'journey'];

  function tick({ snap = false } = {}) {
    const now = new Date();
    const v = values(now);
    const opts = { animate: !snap };
    hoursCard.set(v.hours, opts);
    minutesCard.set(v.minutes, opts);
    if (settings.showSeconds) secondsCard.set(v.seconds, { animate: !snap, speed: 0.62 });
    monthsCard.set(pad(v.r.months), opts);
    daysCard.set(pad(v.r.days), opts);
    paintText(now, v);
    syncSeconds();

    // timer: finish a phase that ran out while nobody else did it (the background worker normally does)
    if (ts.status === 'running' && Date.now() > ts.endAt + 1500 && !completing) {
      completing = true;
      T.act('complete').then((r) => r && applyState(r.state, r.finished)).finally(() => { completing = false; });
    }
    paintFocus({ snap: snap || current !== 'focus' });
    paintEngine();
    paintRail();
    if (ts.status === 'running' && now.getSeconds() % 15 === 0 && /^(Focus\. One|Rest properly)/.test(msgEl.textContent)) { setText(msgEl, timerLine()); setText($('d-msg'), msgEl.textContent); }
    if (!snap && v.minutes !== lastMinute && lastMinute !== null) ripple(ts.status === 'running' ? (ts.phase === 'focus' ? 'hot' : 'rest') : '');
    lastMinute = v.minutes;
    if (now.getSeconds() === 0 || snap) { if (current === 'journey') paintJourney(); if (current === 'focus') paintWeek(); }
  }
  let completing = false;
  let lastMinute = null;

  // tick exactly on the second, so the minute flips on the minute
  function scheduleTick() {
    setTimeout(() => { tick(); scheduleTick(); }, 1000 - (Date.now() % 1000) + 8);
  }

  paintText(new Date(), first);
  scheduleTick();

  /* ---- the seconds hairline: one smooth pass a minute, locked to the real clock ---- */
  const secFill = $('secbar').firstElementChild;
  let secAnim = null;

  function startSeconds() {
    if (reduce()) return;
    secAnim = secFill.animate([
      { transform: 'translate3d(-100%,0,0)', opacity: 0, offset: 0 },
      { transform: 'translate3d(-98.3%,0,0)', opacity: 1, offset: 0.017 },
      { transform: 'translate3d(-1.7%,0,0)', opacity: 1, offset: 0.983 },
      { transform: 'translate3d(0,0,0)', opacity: 0, offset: 1 },
    ], { duration: 60000, iterations: Infinity, easing: 'linear' });
    syncSeconds();
  }

  function syncSeconds() {
    if (!secAnim) return;
    const n = new Date();
    const want = n.getSeconds() * 1000 + n.getMilliseconds();
    if (Math.abs((secAnim.currentTime % 60000) - want) > 250) secAnim.currentTime = want;
  }

  function applySeconds() {
    const on = !!settings.showSeconds;
    $('secbar').parentElement.classList.toggle('sec', on);
    secondsCard.el.style.display = on ? '' : 'none';
    if (on) secondsCard.set(pad(new Date().getSeconds()), { animate: false });
  }

  /* ---- focus timer ---- */
  const PHASE_NAME = { focus: 'Focus', short: 'Short break', long: 'Long break' };

  function paintFocus({ snap = false } = {}) {
    const c = cfg();
    const vw = T.view(ts, c);
    const secs = Math.ceil(vw.left / 1000);
    const opts = { animate: !snap };
    fMinCard.set(pad(Math.floor(secs / 60)), opts);
    fSecCard.set(pad(secs % 60), { animate: !snap, speed: 0.62 });

    const running = ts.status === 'running';
    const rest = ts.phase !== 'focus';
    document.body.classList.toggle('engine-hot', running && !rest);
    document.body.classList.toggle('mode-focus', running && !rest);
    document.body.classList.toggle('engine-rest', running && rest);
    document.body.classList.toggle('mode-rest', running && rest);

    const name = PHASE_NAME[ts.phase];
    const label = $('f-phase');
    const text = ts.status === 'paused' ? name + ' paused' : name;
    if (label.textContent !== text) label.textContent = text;

    const go = $('f-go');
    const goText = running ? 'Pause' : ts.status === 'paused' ? 'Resume' : rest ? 'Start break' : 'Start focus';
    if (go.textContent !== goText) go.textContent = goText;
    go.classList.toggle('live', running);

    const dots = $('f-dots');
    if (dots.children.length !== c.every) {
      dots.textContent = '';
      for (let i = 0; i < c.every; i++) dots.appendChild(document.createElement('i'));
    }
    [...dots.children].forEach((d, i) => {
      d.className = i < ts.done ? 'done' : i === ts.done && !rest ? 'now' : '';
    });

    const mm = pad(Math.floor(secs / 60)) + ':' + pad(secs % 60);
    $('f-cards').setAttribute('aria-label', 'Focus timer ' + mm);
    document.title = running || ts.status === 'paused' ? mm + ' · ' + name : 'New Tab';

    const skip = rest ? 'Skip break' : 'Skip';
    if ($('f-skip').textContent !== skip) $('f-skip').textContent = skip;
    document.querySelectorAll('.sub').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === ts.subject)));
    paintDeep(snap);
  }

  function paintWeek() {
    const c = cfg();
    const box = $('week');
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(new Date(Date.now() - i * DAY));
    const secs = days.map((d, i) => (i === 6 ? T.focusToday(log, ts) : ((log[toISO(d)] || {}).focus || 0)));
    const max = Math.max(c.goal * 3600, ...secs);
    if (box.children.length !== 7) {
      box.textContent = '';
      days.forEach(() => { const el = document.createElement('div'); el.className = 'd'; el.innerHTML = '<i></i><span></span>'; box.appendChild(el); });
    }
    days.forEach((d, i) => {
      const el = box.children[i];
      el.classList.toggle('today', i === 6);
      el.classList.toggle('hit', secs[i] >= c.goal * 3600);
      el.firstChild.style.transform = 'scaleY(' + Math.max(0.12, secs[i] / max).toFixed(3) + ')';
      const e = log[toISO(d)] || {};
      const live = i === 6 && ts.status === 'running' && ts.phase === 'focus' && ts.segStart ? (Date.now() - ts.segStart) / 1000 : 0;
      let at = 0; const stops = [];
      Object.keys(T.SUBJECTS).forEach((k) => {
        const v = (e['s_' + k] || 0) + (k === ts.subject ? live : 0);
        if (v > 0 && secs[i] > 0) { const to = at + (v / secs[i]) * 100; stops.push(T.SUBJECTS[k][1] + ' ' + at.toFixed(1) + '% ' + Math.min(100, to).toFixed(1) + '%'); at = to; }
      });
      el.firstChild.style.background = stops.length ? 'linear-gradient(to top, ' + stops.join(', ') + (at < 99 ? ', rgba(255,255,255,0.25) ' + at.toFixed(1) + '% 100%' : '') + ')' : '';
      el.lastChild.textContent = d.toLocaleDateString(undefined, { weekday: 'narrow' });
      el.title = d.toLocaleDateString(undefined, { weekday: 'long' }) + ': ' + T.fmtHM(secs[i]) + Object.keys(T.SUBJECTS).filter((k) => e['s_' + k]).map((k) => ', ' + T.SUBJECTS[k][0] + ' ' + T.fmtHM(e['s_' + k])).join('');
    });
  }

  function applyState(next, finished) {
    const prev = ts;
    ts = next;
    saveCache();
    paintFocus({ snap: true });
    paintEngine();
    if (current === 'focus') paintWeek();
    if (prev.status !== next.status || prev.phase !== next.phase) { msgI = 0; nextMsg(); }
    if (finished || (prev.status === 'running' && prev.phase !== next.phase && Date.now() >= prev.endAt - 1500)) phaseEnded(prev.phase);
  }

  let lastEnd = 0;
  function phaseEnded(was) {
    if (Date.now() - lastEnd < 3000) return;  // the worker and this page can both report the same end
    lastEnd = Date.now();
    ripple(was === 'focus' ? 'rest' : 'hot');
    const c = cfg();
    if (settings.sound) Sound.chime(was === 'focus' ? 'rest' : 'go');
    toast(was === 'focus'
      ? 'Focus session done. ' + (ts.phase === 'long' ? 'Take a ' + c.long + ' minute break.' : 'Take a ' + c.short + ' minute break.')
      : 'Break over. Ready for the next focus session?');
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    if (!reduce()) Motion.play(el, (p) => ({ opacity: Motion.clamp01(p * 2), transform: 'translate3d(-50%,' + ((1 - p) * 24).toFixed(2) + 'px,0)' }), { stiffness: 190, damping: 18, fill: 'backwards' });
    setTimeout(() => {
      if (reduce()) { el.remove(); return; }
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: 'forwards' }).onfinish = () => el.remove();
    }, 5200);
  }

  $('f-go').addEventListener('click', () => T.act('toggle').then((r) => applyState(r.state, r.finished)));
  $('f-skip').addEventListener('click', () => T.act('skip').then((r) => applyState(r.state)));
  $('f-reset').addEventListener('click', () => {
    const full = ts.status === 'idle' && ts.remaining === T.phaseMs(ts.phase, cfg());
    T.act(full && (ts.done > 0 || ts.phase !== 'focus') ? 'restart' : 'reset').then((r) => applyState(r.state));
  });

  document.querySelectorAll('.sub').forEach((b) => b.addEventListener('click', () => T.act('subject', b.dataset.s).then((r) => applyState(r.state))));

  /* ---- deep focus: one big timer, nothing else ---- */
  const deep = $('deep');
  const dMin = new FlipCard($('d-min'), '25'), dSec = new FlipCard($('d-sec'), '00');
  let deepOn = false;

  function paintDeep(snap) {
    if (!deepOn) return;
    const c = cfg(), vw = T.view(ts, c), secs = Math.ceil(vw.left / 1000);
    dMin.set(pad(Math.floor(secs / 60)), { animate: !snap });
    dSec.set(pad(secs % 60), { animate: !snap, speed: 0.62 });
    const rest = ts.phase !== 'focus';
    deep.dataset.mode = rest ? 'rest' : 'focus';
    deep.classList.toggle('live', ts.status === 'running');
    setText($('d-phase'), PHASE_NAME[ts.phase] + (rest ? '' : ', ' + T.SUBJECTS[ts.subject][0]) + (ts.status === 'paused' ? ' (paused)' : ''));
    setText($('d-go'), ts.status === 'running' ? 'Pause' : ts.status === 'paused' ? 'Resume' : rest ? 'Start break' : 'Start focus');
    setText($('d-skip'), rest ? 'Skip break' : 'Skip');
    $('d-fill').style.transform = 'scaleX(' + vw.frac.toFixed(4) + ')';
    setText($('d-msg'), msgEl.textContent);
  }

  function openDeep() {
    if (deepOn) return;
    deepOn = true;
    document.body.classList.add('deep-on');
    deep.hidden = false;
    paintDeep(true);
    if (!reduce()) {
      Motion.play(deep, (p) => ({ opacity: Motion.clamp01(p * 1.8), transform: 'scale(' + (0.97 + 0.03 * Math.min(1, p)).toFixed(4) + ')' }), { stiffness: 140, damping: 22 });
      dMin.reveal(150); dSec.reveal(240);
    }
    if (!document.fullscreenElement) html.requestFullscreen().catch(() => {});
    $('d-go').focus();
  }

  function closeDeep() {
    if (!deepOn) return;
    deepOn = false;
    document.body.classList.remove('deep-on');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (reduce()) { deep.hidden = true; return; }
    deep.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = () => { if (!deepOn) deep.hidden = true; };
  }

  $('f-deep').addEventListener('click', openDeep);
  $('d-exit').addEventListener('click', closeDeep);
  $('d-go').addEventListener('click', () => $('f-go').click());
  $('d-skip').addEventListener('click', () => $('f-skip').click());
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && deepOn) closeDeep(); });

  /* ---- the engine: how long this device has been on today. The background worker counts it and pauses while the device sleeps ---- */
  let ownLog = {}, rlog = {}, deskBeat = 0;
  const remix = () => { log = T.mergeLogs(ownLog, rlog); };   // this browser's history plus the other browser's

  function paintEngine() {
    const now = Date.now();
    const live = deskBeat && now - deskBeat < 100000 ? (now - deskBeat) / 1000 : 0;
    setText($('eng-desk'), T.fmtHM((((log[toISO(new Date(now))] || {}).desk) || 0) + live));
    const p = plan();
    setText($('eng-week'), p.started && !p.over ? Math.floor(p.elapsed / 7) + 1 + ' of ' + Math.ceil(p.total / 7) : '-');
  }

  /* ---- the plan: start, end, and every day in between ---- */
  const startDate = () => parseISO(settings.startDate) || parseISO(T.DEFAULT_START);
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  function plan() {
    const n = new Date();
    const today = midnight(n);
    const start = startDate();
    const end = target.date;
    const total = Math.max(1, Math.round((end - start) / DAY));
    const frac = clamp01((n - start) / (end - start || 1));
    const elapsed = Math.round((today - start) / DAY);
    return { n, today, start, end, total, frac, elapsed, left: Math.max(0, Math.round((end - today) / DAY)), started: today >= start, over: today > end };
  }

  /* ---- reference dates, shown as chips and as markers on the rail ---- */
  function refRows() {
    return [{ label: 'NEET UG 2028', date: target.date, fixed: true }]
      .concat((settings.refs || []).map((r) => ({ id: r.id, label: r.label, date: parseISO(r.date) })).filter((r) => r.date))
      .sort((a, b) => a.date - b.date);
  }

  const chipsEl = $('chips');

  function renderChips() {
    const rows = refRows();
    const today = new Date();
    const sig = rows.map((r) => r.label + r.date.getTime()).join('|') + toISO(today);
    if (chipsEl.dataset.sig === sig) return;
    chipsEl.dataset.sig = sig;
    chipsEl.textContent = '';
    rows.forEach((r) => {
      const c = document.createElement('span');
      c.className = 'chip' + (r.fixed ? ' fixed' : '');
      const lab = document.createElement('span'); lab.textContent = r.label;
      const rel = document.createElement('span'); rel.className = 'rel'; rel.textContent = T.relative(r.date, today);
      const t0 = midnight(today);
      const span = r.date < t0 ? remaining(r.date, t0) : remaining(t0, r.date);
      c.title = shortFmt.format(r.date) + (span.total ? ', ' + NEET.describe(span) : '');
      c.append(lab, rel);
      if (!r.fixed) {
        const rm = document.createElement('button');
        rm.className = 'rm'; rm.type = 'button'; rm.textContent = '×'; rm.setAttribute('aria-label', 'Remove ' + r.label);
        rm.addEventListener('click', () => persist({ refs: (settings.refs || []).filter((x) => x.id !== r.id) }).then(refsChanged));
        c.append(rm);
      }
      chipsEl.appendChild(c);
    });
    const add = document.createElement('button');
    add.className = 'chip add'; add.type = 'button'; add.textContent = '+ Add a date';
    add.addEventListener('click', () => { chipsEl.hidden = true; $('ref-form').hidden = false; $('ref-label').focus(); });
    chipsEl.appendChild(add);
  }

  function closeRefForm() { $('ref-form').hidden = true; chipsEl.hidden = false; }

  $('ref-add').addEventListener('click', () => {
    const date = $('ref-date').value;
    if (!parseISO(date)) { $('ref-date').focus(); return; }
    const label = $('ref-label').value.trim() || 'Reference date';
    const refs = (settings.refs || []).concat([{ id: Date.now().toString(36), label, date }]).slice(-40);
    $('ref-label').value = '';
    $('ref-date').value = '';
    persist({ refs }).then(() => { closeRefForm(); refsChanged(); });
  });
  $('ref-cancel').addEventListener('click', closeRefForm);
  $('ref-label').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ref-add').click(); if (e.key === 'Escape') closeRefForm(); });

  function refsChanged() { chipsEl.dataset.sig = ''; renderChips(); buildTrack(); matrixData(); matrixDraw(); }

  /* ---- the time rail: always on screen, always moving ---- */
  const trackEl = $('track'), headEl = $('t-head'), fillEl = $('t-fill'), flagEl = $('t-flag');
  let trackW = 0, railFrac = 0, railIntro = false;
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };

  const MON = new Intl.DateTimeFormat(undefined, { month: 'short' });
  const yy = (d) => '\u2019' + String(d.getFullYear()).slice(2);
  let scaleDay = '';

  // Every tick is placed with the same arithmetic as the marker: (date - start) / (end - start).
  function buildTrack() {
    trackW = trackEl.clientWidth;
    const p = plan();
    const span = p.end - p.start;
    const scale = $('scale');
    scale.textContent = '';
    scaleDay = '';
    const pos = (d) => (((d - p.start) / span) * 100).toFixed(3) + '%';
    if (span > 0) {
      const perMonth = trackW * (30.44 * DAY) / span;
      const room = (d) => ((p.end - d) / span) * trackW > 66;   // keep clear of the end label
      const add = (d, cls, label) => {
        const el = document.createElement('i');
        el.className = 'sc ' + cls;
        el.style.left = pos(d);
        el.dataset.t = String(d.getTime());
        if (label) { const b = document.createElement('b'); b.textContent = label; el.appendChild(b); }
        scale.appendChild(el);
      };
      const first = p.start.getDate() === 1;
      add(p.start, 'beg q', first ? MON.format(p.start) + ' ' + yy(p.start) : MON.format(p.start) + ' ' + p.start.getDate());
      for (let i = first ? 1 : 1; i < 80; i++) {
        const m = new Date(p.start.getFullYear(), p.start.getMonth() + i, 1);
        if (m >= p.end) break;
        if (m <= p.start) continue;
        const quarter = m.getMonth() % 3 === 0, jan = m.getMonth() === 0;
        const show = (perMonth >= 40 || quarter) && room(m);
        add(m, (jan ? 'yr ' : '') + (quarter ? 'q' : ''), show ? MON.format(m) + (jan ? ' ' + yy(m) : '') : '');
      }
      add(p.end, 'end', MON.format(p.end) + ' ' + p.end.getDate() + ' ' + yy(p.end));
      $('t-minor').style.setProperty('--wk', (trackW * 7 * DAY / span).toFixed(3) + 'px');   // one fine line per week
    }
    const refs = $('t-refs');
    refs.textContent = '';
    refRows().forEach((r) => {
      if (span <= 0 || r.date < p.start || r.date > p.end) return;
      const d = document.createElement('i');
      if (r.fixed) d.className = 'end';
      d.style.left = pos(r.date);
      d.dataset.l = r.label + ', ' + shortFmt.format(r.date);
      refs.appendChild(d);
    });
    paintRail();
  }

  // ticks behind us are brighter than ticks ahead; the month we are in is white
  function paintScale(p) {
    const key = toISO(p.n);
    if (key === scaleDay) return;
    scaleDay = key;
    let cur = null;
    [...$('scale').children].forEach((el) => {
      const past = +el.dataset.t <= p.n.getTime();
      el.classList.toggle('past', past);
      el.classList.remove('cur');
      if (past && el.firstChild && !el.classList.contains('end')) cur = el;
    });
    if (cur) cur.classList.add('cur');
  }

  function paintRail() {
    const p = plan();
    railFrac = p.frac;
    if (!trackW) trackW = trackEl.clientWidth;
    if (railIntro) {   // while the arrival plays, it owns the transforms
      fillEl.style.transform = 'scaleX(' + p.frac.toFixed(6) + ')';
      headEl.style.transform = 'translate3d(' + (trackW * p.frac).toFixed(2) + 'px,0,0)';
    }
    const dayN = p.over ? p.total : p.started ? Math.min(p.total, p.elapsed + 1) : 0;
    setText(flagEl, p.started ? 'Day ' + dayN : 'Starts ' + T.relative(p.start, p.today));
    flagEl.className = 't-flag' + (p.frac > 0.9 ? ' r' : p.frac < 0.06 ? ' l' : '');
    trackEl.setAttribute('aria-label', p.started ? 'Day ' + dayN + ' of ' + p.total + ', ' + p.left + ' days left' : 'The plan has not started');
    setText($('r-left'), String(p.left));
    setText($('r-left-l'), p.left === 1 ? 'day left' : 'days left');
    setText($('gl-n'), String(Math.max(0, p.elapsed)));
    setText($('gr-n'), String(p.left));
    paintScale(p);

    const dayFrac = clamp01((p.n - p.today) / DAY);
    const leftMin = Math.max(0, Math.ceil((1 - dayFrac) * 24 * 60));
    setText($('r-hleft'), Math.floor(leftMin / 60) + 'h ' + pad(leftMin % 60) + 'm');
  }

  // numbers the lines can use
  function lineCtx() {
    const p = plan(), dayFrac = clamp01((p.n - p.today) / DAY);
    return {
      left: p.left, gone: Math.max(0, p.elapsed), total: p.total, weeks: Math.ceil(p.left / 7), hrs: Math.floor((1 - dayFrac) * 24),
      mode: ts.status === 'running' ? (ts.phase === 'focus' ? 'focus' : 'rest') : 'idle',
      daypart: NEET.lines.daypart(p.n), over: p.over, examDay: sameDay(p.n, p.end), notStarted: !p.started,
    };
  }

  function timerLine() {
    const mm = Math.max(1, Math.ceil(Math.ceil(T.view(ts, cfg()).left / 1000) / 60)) + ' min';
    return ts.phase === 'focus' ? 'Focus. One task only. ' + mm + ' left in this session.' : 'Rest properly. The next session starts in ' + mm + '.';
  }

  // swap a line with a short exit and a springy entrance
  function swap(el, text, instant) {
    if (el.textContent === text) return;
    if (instant || reduce() || document.hidden) { el.textContent = text; return; }
    const out = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0,-10px,0)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = () => { el.textContent = text; out.cancel(); Motion.rise(el, { dy: 14, stiffness: 170, damping: 20 }); };
  }

  let msgI = 0;
  const msgEl = $('r-msg');
  function nextMsg(instant) {
    const text = msgI === 0 && ts.status === 'running' ? timerLine() : NEET.lines.next(lineCtx());
    msgI++;
    swap(msgEl, text, instant);
  }
  setInterval(nextMsg, 12000);

  // the same deck feeds the side columns, the countdown and deep focus, each on its own rhythm
  [['gl-q', 'time', 26000, 0], ['gr-q', 'will', 31000, 6000], ['cd-line', 'any', 23000, 3000], ['d-quote', 'will', 29000, 9000]].forEach(([id, kind, every, offset]) => {
    const el = $(id);
    const go = (instant) => swap(el, NEET.lines.next(lineCtx(), kind), instant);
    go(true);
    setTimeout(() => setInterval(go, every), offset);
  });

  /* ---- a ripple leaves the clock every minute: time has moved ---- */
  function ripple(kind) {
    if (reduce() || document.hidden || settings.fx !== 'full') return;
    const el = document.createElement('div');
    el.className = 'ripple' + (kind ? ' ' + kind : '');
    $('clock').parentElement.prepend(el);
    const a = el.animate([
      { transform: 'scale(0.35)', opacity: 0.7 },
      { transform: 'scale(1.5)', opacity: 0 },
    ], { duration: kind ? 2200 : 1700, easing: 'cubic-bezier(0.16, 0.7, 0.3, 1)' });
    a.onfinish = () => el.remove();
  }

  /* ---- journey: every day of the plan, one square each ---- */
  const mx = { cv: $('matrix'), g: null, cols: 0, cw: 0, off: 0, cells: 0, ti: 0, dpr: 1, w: 0, h: 0, iso: [], focus: [], refDay: new Set(), shownAt: 0, raf: 0, hover: -1 };

  function matrixLayout() {
    const p = plan();
    mx.cells = p.total + 1;
    mx.off = p.start.getDay();
    mx.cols = Math.ceil((mx.cells + mx.off) / 7);
    const W = $('matrix-wrap').clientWidth || 700;
    mx.cw = Math.min(15, W / mx.cols);
    mx.w = mx.cw * mx.cols;
    mx.h = mx.cw * 7;
    mx.dpr = Math.min(2, window.devicePixelRatio || 1);
    mx.cv.width = Math.round(mx.w * mx.dpr);
    mx.cv.height = Math.round(mx.h * mx.dpr);
    mx.cv.style.width = mx.w + 'px';
    mx.cv.style.height = mx.h + 'px';
    mx.g = mx.cv.getContext('2d');
    mx.iso = [];
    for (let i = 0; i < mx.cells; i++) mx.iso.push(toISO(new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() + i)));
    matrixData();
  }

  function matrixData() {
    const p = plan();
    mx.ti = Math.round((p.today - p.start) / DAY);
    mx.focus = mx.iso.map((k, i) => (i === mx.ti ? T.focusToday(log, ts) : (((log[k] || {}).focus) || 0)));
    mx.refDay = new Set();
    refRows().forEach((r) => { const i = Math.round((r.date - p.start) / DAY); if (i >= 0 && i < mx.cells) mx.refDay.add(i); });
  }

  function cell(i) { const j = i + mx.off; return { x: Math.floor(j / 7) * mx.cw, y: (j % 7) * mx.cw }; }

  function matrixDraw(t) {
    const g = mx.g;
    if (!g || !mx.cells) return;
    const goal = cfg().goal * 3600;
    const gap = Math.max(1.4, mx.cw * 0.2), s = mx.cw - gap, rad = Math.min(3, s * 0.3);
    const since = t == null ? 1e9 : t - mx.shownAt;
    const r = reduce() ? 1 : clamp01(since / 1500);
    const lit = Math.max(0, mx.ti) * (1 - Math.pow(1 - r, 3));
    const pulse = 0.5 + 0.5 * Math.sin(((t || 0) % 1400) / 1400 * Math.PI * 2);

    g.setTransform(mx.dpr, 0, 0, mx.dpr, 0, 0);
    g.clearRect(0, 0, mx.w, mx.h);
    const box = (x, y) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, s, s, rad); else g.rect(x, y, s, s); g.fill(); };

    for (let i = 0; i < mx.cells; i++) {
      const { x, y } = cell(i);
      if (i < mx.ti) {
        if (i > lit) { g.fillStyle = 'rgba(255,255,255,0.08)'; box(x, y); continue; }
        const f = mx.focus[i] / goal;
        const edge = Math.max(0, 1 - (lit - i) / 7);   // the wave's bright leading edge
        if (f >= 1) g.fillStyle = '#ffd68a';
        else if (f > 0) g.fillStyle = 'rgba(255,159,10,' + (0.5 + 0.45 * f).toFixed(2) + ')';
        else g.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.55 * edge).toFixed(2) + ')';
        if (edge > 0.2 && r < 1) { g.shadowColor = 'rgba(255,200,120,0.9)'; g.shadowBlur = 8 * edge; }
        box(x, y);
        g.shadowBlur = 0;
      } else if (i === mx.ti) {
        g.shadowColor = 'rgba(255,159,10,1)';
        g.shadowBlur = 8 + 14 * pulse;
        g.fillStyle = 'rgba(255,' + Math.round(190 + 60 * pulse) + ',' + Math.round(90 + 120 * pulse) + ',1)';
        box(x - 1, y - 1);
        g.shadowBlur = 0;
      } else if (i === mx.cells - 1) {
        g.shadowColor = 'rgba(48,209,88,0.9)'; g.shadowBlur = 8;
        g.fillStyle = '#30d158';
        box(x, y);
        g.shadowBlur = 0;
      } else {
        g.fillStyle = 'rgba(255,255,255,0.1)';
        box(x, y);
      }
      if (mx.refDay.has(i) && i !== mx.cells - 1) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1); }
    }
    if (mx.hover >= 0) { const { x, y } = cell(mx.hover); g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x - 1, y - 1, s + 2, s + 2); }
  }

  function matrixLoop(t) {
    mx.raf = 0;
    if (current !== 'journey' || document.hidden) return;
    matrixDraw(t);
    if (!reduce()) mx.raf = requestAnimationFrame(matrixLoop);
  }

  function matrixStart() {
    matrixLayout();
    mx.shownAt = performance.now();
    cancelAnimationFrame(mx.raf);
    mx.raf = requestAnimationFrame(matrixLoop);
  }

  const jText = $('j-text');
  let jBase = '';
  mx.cv.addEventListener('pointermove', (e) => {
    const b = mx.cv.getBoundingClientRect();
    const x = e.clientX - b.left, y = e.clientY - b.top;
    const i = Math.floor(x / mx.cw) * 7 + Math.floor(y / mx.cw) - mx.off;
    if (i < 0 || i >= mx.cells) { mx.hover = -1; jText.textContent = jBase; return; }
    mx.hover = i;
    const p = plan();
    const d = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() + i);
    const extra = i < mx.ti ? (mx.focus[i] ? T.fmtHM(mx.focus[i]) + ' studied' : 'gone') : i === mx.ti ? 'today' : T.relative(d, p.today);
    jText.textContent = 'Day ' + (i + 1) + ' of ' + mx.cells + ', ' + shortFmt.format(d) + ', ' + extra;
  });
  mx.cv.addEventListener('pointerleave', () => { mx.hover = -1; jText.textContent = jBase; });

  function paintJourney() {
    const p = plan();
    const day = $('j-day');
    let head, txt;
    if (!p.started) { head = 'Starts ' + T.relative(p.start, p.today); txt = 'Your plan begins ' + shortFmt.format(p.start); }
    else if (p.over) { head = 'Plan complete'; txt = p.total + ' days, ' + shortFmt.format(p.start) + ' to ' + shortFmt.format(p.end); }
    else { head = 'Day ' + Math.min(p.total, p.elapsed + 1); txt = NEET.describe(remaining(p.start, p.today)) + ' since ' + shortFmt.format(p.start) + ', ' + p.left + ' to go'; }
    day.textContent = head;
    if (p.started && !p.over) { const sm = document.createElement('small'); sm.textContent = 'of ' + p.total; day.appendChild(sm); }
    jBase = txt;
    if (mx.hover < 0) jText.textContent = txt;
    renderChips();
    if (mx.cells) { matrixData(); if (!mx.raf) matrixDraw(); }
  }

  const jEdit = $('j-edit'), jInput = $('j-input');
  jEdit.addEventListener('click', () => { jInput.value = toISO(startDate()); jInput.hidden = false; jEdit.hidden = true; jInput.focus(); });
  const closeJ = () => { jInput.hidden = true; jEdit.hidden = false; };
  jInput.addEventListener('change', async () => {
    if (parseISO(jInput.value)) { await persist({ startDate: jInput.value }); buildTrack(); paintJourney(); if (current === 'journey') matrixStart(); }
    closeJ();
  });
  jInput.addEventListener('blur', closeJ);
  jInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeJ(); });

  /* ---- embers: they rise behind the clock; the warmer the engine, the more of them ---- */
  (function embers() {
    const cv = $('embers');
    if (reduce() || !cv.getContext) return;
    const g = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, level = 0.25, raf = 0;
    const N = 90;
    const P = [];
    const hue = { r: 255, g: 255, b: 255 };

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.width = Math.round(innerWidth * dpr);
      H = cv.height = Math.round(innerHeight * dpr);
    }
    function spawn(p, anywhere) {
      p.x = Math.random() * W;
      p.y = anywhere ? Math.random() * H : H + 12 * dpr;
      p.r = (0.7 + Math.random() * 2) * dpr;
      p.vy = (0.18 + Math.random() * 0.7) * dpr;
      p.sw = (8 + Math.random() * 30) * dpr;
      p.ph = Math.random() * 6.283;
      p.sp = 0.004 + Math.random() * 0.012;
      p.k = Math.random();          // chooses whether this one shows at a given level
      p.a = 0.25 + Math.random() * 0.6;
    }
    for (let i = 0; i < N; i++) { const p = {}; spawn(p, true); P.push(p); }
    resize();
    window.addEventListener('resize', resize);

    function frame() {
      raf = 0;
      if (document.hidden || document.body.classList.contains('fx-light') || document.body.classList.contains('fx-off')) { g.clearRect(0, 0, W, H); return; }
      const b = document.body.classList;
      const want = b.contains('engine-hot') ? 1 : b.contains('engine-rest') ? 0.6 : 0.2;
      level += (want - level) * 0.02;
      const to = b.contains('engine-hot') ? [255, 150, 20] : b.contains('engine-rest') ? [60, 215, 110] : [255, 205, 150];
      hue.r += (to[0] - hue.r) * 0.04; hue.g += (to[1] - hue.g) * 0.04; hue.b += (to[2] - hue.b) * 0.04;
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      const speed = 0.6 + level * 1.4;
      for (const p of P) {
        p.y -= p.vy * speed;
        p.ph += p.sp;
        const x = p.x + Math.sin(p.ph) * p.sw;
        if (p.y < -10) spawn(p, false);
        if (p.k > level) continue;
        const fade = Math.min(1, p.y / (H * 0.25)) * Math.min(1, (H - p.y) / (H * 0.1) + 0.3);
        const al = p.a * fade * (0.3 + level * 0.7);
        const c = Math.round(hue.r) + ',' + Math.round(hue.g) + ',' + Math.round(hue.b);
        g.fillStyle = 'rgba(' + c + ',' + (al * 0.18).toFixed(3) + ')';
        g.beginPath(); g.arc(x, p.y, p.r * 4, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(' + c + ',' + al.toFixed(3) + ')';
        g.beginPath(); g.arc(x, p.y, p.r, 0, 6.283); g.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };
    document.addEventListener('visibilitychange', kick);
    self.neetEmbersKick = kick;
    kick();
  })();

  /* ---- tabs: the panels turn like pages ---- */
  const pill = $('pill');

  function placePill(animate) {
    const tab = $('t-' + current);
    if (!tab.offsetWidth) return;
    const x1 = tab.offsetLeft, w1 = tab.offsetWidth;
    const x0 = pill._x == null ? x1 : pill._x, w0 = pill._w == null ? w1 : pill._w;
    pill.style.width = w1 + 'px';
    pill.style.transform = 'translate3d(' + x1 + 'px,0,0)';
    if (animate && !reduce() && (x0 !== x1 || w0 !== w1)) {
      Motion.play(pill, (p) => ({ transform: 'translate3d(' + (x0 + (x1 - x0) * p).toFixed(2) + 'px,0,0)', width: (w0 + (w1 - w0) * p).toFixed(2) + 'px' }), { stiffness: 260, damping: 22 });
    }
    pill._x = x1; pill._w = w1;
  }

  function panelShown(name) {
    try { localStorage.setItem('neet.tab', name); } catch (e) { /* ignore */ }
    if (name === 'count') { tick({ snap: true }); monthsCard.reveal(140); daysCard.reveal(220); }
    if (name === 'focus') { paintFocus({ snap: true }); paintWeek(); fMinCard.reveal(140); fSecCard.reveal(210); }
    if (name === 'journey') { paintJourney(); matrixStart(); }
  }

  function showPanel(name) {
    if (name === current || !ORDER.includes(name)) return;
    const from = $('p-' + current), to = $('p-' + name);
    const dir = ORDER.indexOf(name) > ORDER.indexOf(current) ? 1 : -1;
    current = name;
    ORDER.forEach((k) => $('t-' + k).setAttribute('aria-selected', String(k === name)));
    placePill(true);

    ORDER.forEach((k) => { if ($('p-' + k) !== from && $('p-' + k) !== to) $('p-' + k).hidden = true; });
    to.getAnimations().forEach((a) => a.cancel());
    to.hidden = false;
    panelShown(name);

    if (reduce()) { from.hidden = true; return; }
    from.classList.add('leaving');
    const out = from.animate([
      { opacity: 1, transform: 'translate3d(0,0,0) rotateY(0deg)' },
      { opacity: 0, transform: 'translate3d(' + (-dir * 56) + 'px,0,0) rotateY(' + (dir * 20) + 'deg)' },
    ], { duration: 210, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    out.finished.then(() => {
      from.classList.remove('leaving');
      if (from.id !== 'p-' + current) from.hidden = true;
      out.cancel();
    }).catch(() => {});
    Motion.play(to, (p) => ({
      opacity: Motion.clamp01(p * 1.6),
      transform: 'translate3d(' + ((1 - p) * dir * 64).toFixed(2) + 'px,0,0) rotateY(' + (-dir * (1 - p) * 18).toFixed(2) + 'deg)',
    }), { stiffness: 150, damping: 19, delay: 120 });
  }

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showPanel(b.dataset.p)));
  $('tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = ORDER.indexOf(current) + (e.key === 'ArrowRight' ? 1 : -1);
    if (ORDER[i]) { showPanel(ORDER[i]); $('t-' + ORDER[i]).focus(); }
  });
  window.addEventListener('resize', () => { placePill(false); buildTrack(); if (current === 'journey') matrixStart(); });

  // start on the tab you used last
  (function restoreTab() {
    let saved = 'count';
    try { saved = localStorage.getItem('neet.tab') || 'count'; } catch (e) { /* ignore */ }
    if (!ORDER.includes(saved) || saved === 'count') return;
    $('p-count').hidden = true;
    $('p-' + saved).hidden = false;
    ORDER.forEach((k) => $('t-' + k).setAttribute('aria-selected', String(k === saved)));
    current = saved;
    if (saved === 'focus') { paintFocus({ snap: true }); paintWeek(); } else paintJourney();
  })();

  /* ---- arrival: everything is already real, it simply rises into place ---- */
  function show(el) { el.classList.remove('arrive'); }

  // the bar fills to where you are on a heavy spring; the marker rides the tip
  function introRail(delay) {
    buildTrack();
    const f = railFrac, w = trackW;
    fillEl.style.transform = 'scaleX(' + f + ')';
    headEl.style.transform = 'translate3d(' + (w * f) + 'px,0,0)';
    const a = Motion.play(fillEl, (p) => ({ transform: 'scaleX(' + Math.max(0, f * p).toFixed(5) + ')' }), { stiffness: 38, damping: 9, mass: 1, delay });
    Motion.play(headEl, (p) => ({ transform: 'translate3d(' + Math.max(0, w * f * p).toFixed(2) + 'px,0,0)' }), { stiffness: 38, damping: 9, mass: 1, delay });
    a.finished.then(() => { railIntro = true; paintRail(); }, () => { railIntro = true; });
  }

  function arrive() {
    const all = document.querySelectorAll('.arrive');
    placePill(false);
    if (reduce()) { all.forEach(show); railIntro = true; paintRail(); startSeconds(); return; }

    const aura = $('aura');
    aura.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2200, easing: 'cubic-bezier(0.2, 0.6, 0.2, 1)', fill: 'backwards' });
    show(aura);

    const go = (el, opts) => { Motion.rise(el, opts); show(el); };
    go($('today'), { delay: 300, dy: -6 });
    go($('controls'), { delay: 380, dy: -6 });

    // the flip cards open one after another
    show(clockEl);
    hoursCard.reveal(0);
    minutesCard.reveal(90);
    if (settings.showSeconds) secondsCard.reveal(180);
    if (current === 'count') { monthsCard.reveal(300); daysCard.reveal(390); }
    if (current === 'focus') { fMinCard.reveal(300); fSecCard.reveal(390); }

    go($('secbar'), { delay: 340, dy: 6 });
    go($('engine'), { delay: 460, dy: 8 });
    document.querySelectorAll('.gut').forEach((g, i) => go(g, { delay: 620 + i * 90, dy: 16 }));
    go($('tabs'), { delay: 540, dy: 10 });
    go($('panels'), { delay: 600, dy: 12 });
    go($('rail'), { delay: 700, dy: 18 });
    introRail(950);

    startSeconds();
  }

  // the fonts are bundled and preloaded, so this is a few milliseconds
  Promise.race([
    Promise.all([document.fonts.load('700 1em Digits'), document.fonts.load('400 1em UI'), document.fonts.load('700 1em UI')]).catch(() => {}),
    new Promise((res) => setTimeout(res, 300)),
  ]).then(arrive);

  /* ---- a gentle parallax: the numbers lean a few degrees toward the pointer, then settle flat ---- */
  const tiltTargets = [clockEl, $('panels')];
  const auraWrap = $('aura-wrap');
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, calmTimer = 0;

  function tilt() {
    cx += (tx - cx) * 0.075;
    cy += (ty - cy) * 0.075;
    const flat = Math.abs(cx) < 0.002 && Math.abs(cy) < 0.002 && tx === 0 && ty === 0;
    const t = flat ? '' : 'perspective(1800px) rotateX(' + (-cy * 2.4).toFixed(3) + 'deg) rotateY(' + (cx * 3.4).toFixed(3) + 'deg)';
    tiltTargets.forEach((el) => { el.style.transform = t; });
    auraWrap.style.transform = flat ? '' : 'translate3d(' + (cx * -30).toFixed(2) + 'px,' + (cy * -18).toFixed(2) + 'px,0)';
    raf = flat ? 0 : requestAnimationFrame(tilt);
  }

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reduce() || settings.fx !== 'full' || document.fullscreenElement || !$('sheet').hidden) return;
    tx = (e.clientX / innerWidth) * 2 - 1;
    ty = (e.clientY / innerHeight) * 2 - 1;
    clearTimeout(calmTimer);
    calmTimer = setTimeout(() => { tx = 0; ty = 0; }, 1400); // let it settle flat, so text stays razor sharp at rest
    if (!raf) raf = requestAnimationFrame(tilt);
  }, { passive: true });

  /* ---- toggles ---- */
  const btnAwake = $('btn-awake');
  const btnBell = $('btn-bell');
  const btnFull = $('btn-full');
  let awakeState = 'idle'; // idle | on | blocked

  function every(minutes) {
    if (minutes === 60) return 'hour';
    if (minutes % 60 === 0) return minutes / 60 + ' hours';
    return minutes > 60 ? (minutes / 60).toFixed(1) + ' h' : minutes + ' min';
  }

  function paintToggles() {
    btnAwake.setAttribute('aria-pressed', String(settings.keepAwake));
    btnAwake.dataset.tip = !settings.keepAwake
      ? 'Keep screen on'
      : awakeState === 'blocked' ? 'Browser blocked keep-awake' : 'Screen stays on';
    btnBell.setAttribute('aria-pressed', String(settings.reminders));
    btnBell.dataset.tip = settings.reminders ? 'Reminders on · every ' + every(cfg().reminderMinutes) : 'Reminders off';
  }

  function applyPrefs() {
    FlipCard.onLand = settings.flipSound ? () => Sound.click() : null;
    document.body.classList.remove('fx-full', 'fx-light', 'fx-off');
    document.body.classList.add('fx-' + cfg().fx);
    if (self.neetEmbersKick) self.neetEmbersKick();
    applySeconds();
    paintToggles();
  }

  /* keep the screen awake (Screen Wake Lock) while this tab is visible */
  let wakeLock = null;

  async function acquireWake() {
    if (!settings.keepAwake || document.visibilityState !== 'visible') return;
    if (wakeLock && !wakeLock.released) return;
    if (!('wakeLock' in navigator)) { awakeState = 'blocked'; paintToggles(); return; }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      awakeState = 'on';
    } catch (e) {
      awakeState = 'blocked';
    }
    paintToggles();
  }

  function releaseWake() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    awakeState = 'idle';
  }

  // coming back to the tab: show the right time at once, no catch-up flipping
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick({ snap: true });
      acquireWake();
    }
  });

  btnAwake.addEventListener('click', async () => {
    await persist({ keepAwake: !settings.keepAwake });
    if (settings.keepAwake) await acquireWake(); else releaseWake();
    paintToggles();
  });

  btnBell.addEventListener('click', async () => {
    await persist({ reminders: !settings.reminders });
    paintToggles();
  });

  // preview the reminder; hold Shift to preview the "window" version that appears over other apps
  $('btn-preview').addEventListener('click', (e) => {
    if (e.shiftKey) chrome.runtime.sendMessage({ type: 'preview-window' });
    else self.neetShowReminder();
  });

  /* ---- settings sheet ---- */
  const sheet = $('sheet'), scrim = $('scrim');
  let sheetOpener = null;

  function fillSheet() {
    const c = cfg();
    sheet.querySelectorAll('[data-k]').forEach((el) => {
      if (el.type === 'checkbox') el.checked = !!settings[el.dataset.k];
      else el.value = c[el.dataset.k];
    });
  }

  function openSheet() {
    if (!sheet.hidden) return;
    sheetOpener = document.activeElement;
    fillSheet();
    loadSync();
    scrim.hidden = false;
    sheet.hidden = false;
    if (!reduce()) {
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
      Motion.play(sheet, (p) => ({ opacity: Motion.clamp01(p * 1.8), transform: 'translate3d(' + ((1 - p) * 70).toFixed(2) + 'px,0,0) scale(' + (0.955 + 0.045 * p).toFixed(4) + ')' }), { stiffness: 210, damping: 21 });
    }
    $('sheet-close').focus();
  }

  function closeSheet() {
    if (sheet.hidden) return;
    const done = () => { sheet.hidden = true; scrim.hidden = true; if (sheetOpener && sheetOpener.focus) sheetOpener.focus(); };
    if (reduce()) { done(); return; }
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    sheet.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(50px,0,0) scale(0.97)' }], { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).onfinish = done;
  }

  $('btn-settings').addEventListener('click', openSheet);
  $('sheet-close').addEventListener('click', closeSheet);
  scrim.addEventListener('click', closeSheet);

  sheet.addEventListener('change', async (e) => {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    const k = el.dataset.k;
    const v = el.type === 'checkbox' ? el.checked : T.sane(Object.assign({}, settings, { [k]: el.value }))[k];
    if (el.type !== 'checkbox') el.value = v;
    await persist({ [k]: v });
    applyPrefs();
    if (['focus', 'short', 'long', 'every'].includes(k)) { const r = await T.act('refresh'); applyState(r.state); }
    paintFocus({ snap: true });
  });

  /* ---- backup: settings and study history, as one file ---- */
  $('bk-exp').addEventListener('click', async () => {
    const all = await chrome.storage.local.get(null);
    ['timer', 'syncCfg', 'syncBase', 'syncState', 'stamps', 'remoteLog', 'iid', 'deskBeat'].forEach((k) => delete all[k]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'neet-flip-clock', saved: new Date().toISOString(), data: all }, null, 2)], { type: 'application/json' }));
    a.download = 'neet-flip-clock-backup-' + toISO(new Date()) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  $('bk-imp').addEventListener('click', () => $('bk-file').click());
  $('bk-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()).data;
      if (!d || typeof d !== 'object') throw new Error('bad file');
      const keep = {};
      Object.keys(DEFAULTS).forEach((k) => { if (k in d) keep[k] = d[k]; });
      const cur = (await chrome.storage.local.get({ studyLog: {} })).studyLog;   // keep the larger number for every day
      const merged = Object.assign({}, cur);
      Object.entries(d.studyLog || {}).forEach(([day, v]) => {
        const o = merged[day] || {};
        merged[day] = Object.assign({}, o);
        Object.keys(v || {}).forEach((k) => { merged[day][k] = Math.max(+o[k] || 0, +v[k] || 0); });
      });
      keep.studyLog = merged;
      await chrome.storage.local.set(keep);
      toast('Backup imported.');
    } catch (err) { toast('That file is not a backup from this clock.'); }
  });

  /* ---- sync with the other browser (the work happens in the background worker) ---- */
  let syncInfo = { cfg: null, state: null };
  const syncSt = $('sync-st');
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };

  function paintSync() {
    const { cfg: c, state: st } = syncInfo;
    const on = !!(c && c.token);
    $('sync-form').hidden = on;
    $('sync-live').hidden = !on;
    syncSt.className = 'sync-st';
    if (!on) { syncSt.textContent = 'Not connected'; return; }
    if (st && !st.ok) { syncSt.textContent = (st.error || 'Sync failed') + '. It will retry.'; syncSt.classList.add('bad'); return; }
    syncSt.textContent = st ? 'Connected as ' + c.login + '. Last sync ' + ago(st.t) : 'Connecting...';
    syncSt.classList.add('ok');
  }
  function loadSync() {
    return chrome.storage.local.get({ syncCfg: null, syncState: null }).then((v) => { syncInfo = { cfg: v.syncCfg, state: v.syncState }; paintSync(); });
  }
  const ask = (msg) => chrome.runtime.sendMessage(msg).catch(() => ({ ok: false, error: 'The background worker is not responding' }));

  $('sync-go').addEventListener('click', async () => {
    const b = $('sync-go');
    b.disabled = true;
    syncSt.className = 'sync-st';
    syncSt.textContent = 'Connecting...';
    const r = await ask({ type: 'sync-connect', token: $('sync-token').value });
    b.disabled = false;
    if (r && r.ok) { $('sync-token').value = ''; toast('Connected. Use the same token in your other browser.'); }
    else { syncSt.textContent = (r && r.error) || 'Could not connect'; syncSt.classList.add('bad'); return; }
    loadSync();
  });
  $('sync-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('sync-go').click(); });
  $('sync-now').addEventListener('click', async () => { syncSt.textContent = 'Syncing...'; await ask({ type: 'sync-now' }); loadSync(); });
  $('sync-off').addEventListener('click', async () => { await ask({ type: 'sync-off' }); loadSync(); });

  /* ---- full screen ---- */
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else html.requestFullscreen().catch(() => {});
  }

  let idleTimer = null;
  function poke() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    if (document.fullscreenElement) {
      idleTimer = setTimeout(() => document.body.classList.add('idle'), 2600);
    }
  }

  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    document.body.classList.toggle('is-fullscreen', on);
    btnFull.dataset.tip = on ? 'Exit full screen (F)' : 'Full screen (F)';
    btnFull.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    poke();
    acquireWake();
  });

  btnFull.addEventListener('click', toggleFullscreen);
  document.addEventListener('mousemove', poke);
  document.addEventListener('pointerdown', poke);

  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, input, .controls, .sheet, .panels, .tabs')) return;
    toggleFullscreen();
  });

  document.addEventListener('keydown', (e) => {
    poke();
    if (e.key === 'Escape' && !sheet.hidden) { closeSheet(); return; }
    if (e.key === 'Escape' && deepOn) { closeDeep(); return; }
    if (deepOn && e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); $('f-go').click(); return; }
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'f') toggleFullscreen();
    else if (k === 's') { e.preventDefault(); openSheet(); }
    else if (k === 'd') openDeep();
    else if (k === '1') showPanel('count');
    else if (k === '2') showPanel('focus');
    else if (k === '3') showPanel('journey');
    else if (e.key === ' ' && current === 'focus' && !e.target.closest('button')) { e.preventDefault(); $('f-go').click(); }
  });

  /* ---- change the exam date ---- */
  const editBtn = $('edit-date');
  const dateInput = $('date-input');

  editBtn.addEventListener('click', () => {
    dateInput.value = toISO(target.date);
    dateInput.hidden = false;
    editBtn.hidden = true;
    dateInput.focus();
  });

  const closeEditor = () => { dateInput.hidden = true; editBtn.hidden = false; };

  dateInput.addEventListener('change', async () => {
    const picked = parseISO(dateInput.value);
    if (picked) {
      await persist({ targetDate: dateInput.value });
      target = { date: picked, custom: true };
      tick({ snap: true });
    }
    closeEditor();
  });
  dateInput.addEventListener('blur', closeEditor);
  dateInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditor(); });

  /* ---- stay in sync with chrome.storage, other tabs and the toolbar button ---- */
  function applyChanges(keys) {
    if (keys.includes('targetDate')) { target = resolveTarget(settings.targetDate); tick({ snap: true }); }
    if (keys.includes('keepAwake')) { if (settings.keepAwake) acquireWake(); else releaseWake(); }
    if (keys.includes('refs') || keys.includes('startDate') || keys.includes('targetDate')) { chipsEl.dataset.sig = ''; buildTrack(); if (current === 'journey') { paintJourney(); matrixStart(); } }
    applyPrefs();
    paintFocus({ snap: true });
  }

  chrome.storage.local.get(Object.assign({ timer: null, studyLog: {}, remoteLog: {}, deskBeat: 0, syncCfg: null, syncState: null }, DEFAULTS)).then((stored) => {
    const patch = {};
    if (!stored.targetDate && settings.targetDate) patch.targetDate = settings.targetDate; // carry over
    const next = Object.assign({}, stored, patch);
    const changed = Object.keys(DEFAULTS).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(settings[k]));
    Object.keys(DEFAULTS).forEach((k) => { settings[k] = next[k]; });
    if (stored.timer) ts = stored.timer;
    ownLog = stored.studyLog || {};
    rlog = stored.remoteLog || {};
    deskBeat = stored.deskBeat || 0;
    remix();
    syncInfo = { cfg: stored.syncCfg, state: stored.syncState };
    paintSync();
    cache();
    saveCache();
    if (Object.keys(patch).length) chrome.storage.local.set(patch);
    if (changed.length) applyChanges(changed);
    paintFocus({ snap: true });
    paintEngine();
    if (current === 'focus') paintWeek();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.studyLog || changes.remoteLog) {
      if (changes.studyLog) ownLog = changes.studyLog.newValue || {};
      if (changes.remoteLog) rlog = changes.remoteLog.newValue || {};
      remix();
      saveCache();
      paintEngine();
      if (current === 'focus') paintWeek();
      if (current === 'journey') matrixData();
    }
    if (changes.deskBeat) deskBeat = changes.deskBeat.newValue || 0;
    if (changes.syncCfg || changes.syncState) loadSync();
    if (changes.timer) applyState(changes.timer.newValue || T.fresh(cfg()));
    const keys = Object.keys(DEFAULTS).filter((k) => changes[k]);
    if (!keys.length) return;
    keys.forEach((k) => { settings[k] = changes[k].newValue === undefined ? DEFAULTS[k] : changes[k].newValue; });
    cache();
    applyChanges(keys);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'neet-show') self.neetShowReminder();
  });

  applyPrefs();
  paintFocus({ snap: true });
  paintEngine();
  buildTrack();
  nextMsg(true);
  acquireWake();
})();

