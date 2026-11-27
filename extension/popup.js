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

(async () => {
  'use strict';

  const { pad, sameDay, remaining } = NEET;
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const WINDOW = new URLSearchParams(location.search).get('mode') === 'window'; // a real window, over any app
  html.classList.toggle('mode-window', WINDOW);
  html.style.setProperty('--life', NEET.POPUP_SECONDS + 's');

  const tell = (msg) => { if (!WINDOW) parent.postMessage(Object.assign({ neet: true }, msg), '*'); };

  // tells the page that the card loaded (so it knows it wasn't blocked)
  tell({ type: 'ready' });

  const target = await NEET.getTarget();
  const now = new Date();
  const r = remaining(now, target.date);

  // the numbers are the real numbers from the very first frame
  const monthsCard = new FlipCard($('months'), pad(r.months));
  const daysCard = new FlipCard($('days'), pad(r.days));

  const examToday = sameDay(now, target.date);
  let big, label;
  if (r.total > 0) {
    big = String(r.total);
    label = r.total === 1 ? 'day to go' : 'days to go';
  } else {
    big = examToday ? 'Today' : '—';
    label = examToday ? 'is exam day' : 'date has passed';
  }
  const num = $('total');
  num.setAttribute('aria-label', big);
  [...big].forEach((ch, k) => {
    const dg = document.createElement('span');
    dg.className = 'dg';
    dg.style.setProperty('--k', k);
    dg.setAttribute('aria-hidden', 'true');
    dg.innerHTML = '<i></i>';
    dg.firstChild.textContent = ch;
    num.appendChild(dg);
  });
  $('lbl').textContent = label;
  $('date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(target.date);

  // where you are in the plan, and a line to carry into the next hour
  try {
    const st = await chrome.storage.local.get({ startDate: null });
    const start = NEET.parseISO(st.startDate) || NEET.parseISO(NEET.timer.DEFAULT_START);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const total = Math.max(1, Math.round((target.date - start) / 864e5));
    const frac = Math.min(1, Math.max(0, (now - start) / (target.date - start || 1)));
    const gone = Math.max(0, Math.round((today - start) / 864e5));
    const left = Math.max(0, Math.round((target.date - today) / 864e5));
    const weeks = Math.ceil(left / 7);
    $('r-day').textContent = today < start ? 'Plan starts ' + NEET.timer.relative(start, today) : 'Day ' + Math.min(total, gone + 1) + ' of ' + total;
    $('r-pct').textContent = weeks + (weeks === 1 ? ' week left' : ' weeks left');
    $('rbar').style.setProperty('--p', frac.toFixed(4));
    $('rmsg').textContent = NEET.lines.next({ left, gone, total, weeks, hrs: 23 - now.getHours(), daypart: NEET.lines.daypart(now), over: today > target.date, examDay: left === 0, notStarted: today < start });
  } catch (e) { $('rmsg').textContent = 'Every day counts.'; }

  const sendHeight = () => tell({ type: 'size', height: Math.ceil(document.body.getBoundingClientRect().height) });
  if (!WINDOW) new ResizeObserver(sendHeight).observe(document.body);

  // fonts are bundled and preloaded; this just makes sure, then waits for the first painted frame
  await Promise.race([
    Promise.all([document.fonts.load('700 1em Digits'), document.fonts.load('400 1em UI'), document.fonts.load('700 1em UI')]).catch(() => {}),
    new Promise((res) => setTimeout(res, 300)),
  ]);
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

  sendHeight();
  document.body.classList.add('in');
  if (!Motion.reduced()) {
    monthsCard.reveal(170);
    daysCard.reveal(260);
  }
  tell({ type: 'show' });
  if (WINDOW) fitWindow();

  /* ---- leaving: the close button, the ring running out, Esc, or (in a page) a swipe ---- */
  let closing = false;

  async function closeWindow() {
    try { const w = await chrome.windows.getCurrent(); await chrome.windows.remove(w.id); } catch (e) { window.close(); }
  }

  function leave() {
    if (closing) return;
    closing = true;
    if (!WINDOW) { tell({ type: 'leave' }); return; }
    const card = $('card');
    if (Motion.reduced()) { closeWindow(); return; }
    const a = card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0,-6px,0)' }], { duration: 240, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    a.onfinish = closeWindow;
    setTimeout(closeWindow, 700);
  }

  $('close').addEventListener('click', leave);
  $('ring').addEventListener('animationend', leave);
  if (WINDOW) document.addEventListener('keydown', (e) => { if (e.key === 'Escape') leave(); });

  /* ---- in a page, the host handles grabbing and swiping and tells us the state ---- */
  window.addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || e.data.neetCmd !== true) return;
    if ('hover' in e.data) document.body.classList.toggle('hovering', !!e.data.hover);
    if ('drag' in e.data) document.body.classList.toggle('dragging', !!e.data.drag);
    if ('close' in e.data) $('close').classList.toggle('hot', !!e.data.close);
  });

  /* ---- as a window: size it to fit its content exactly, keeping it pinned to the right edge ---- */
  async function fitWindow() {
    try {
      const w = await chrome.windows.getCurrent();
      const cs = getComputedStyle(document.body);
      const contentH = $('card').offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const wantW = 360 + (w.width - innerWidth);
      const wantH = Math.ceil(contentH) + (w.height - innerHeight);
      if (Math.abs(wantW - w.width) > 2 || Math.abs(wantH - w.height) > 2) {
        await chrome.windows.update(w.id, { width: wantW, height: wantH, left: w.left + w.width - wantW });
      }
    } catch (e) { /* best effort */ }
  }
})();

