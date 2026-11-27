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

// Sync between browsers (Chrome, Edge, any Chromium) through one private GitHub gist.
// Both browsers use the same token and find the same gist. Nothing else is needed: no server of ours.
//
// What merges, and how (so two browsers can never overwrite each other):
//   settings  one value per setting, the most recent change wins (ties broken by install id)
//   study log kept per browser install; focus time adds up, device-on time takes the larger one
//   timer     the most recent change wins; the browser that started a session is the one that finishes it
(() => {
  'use strict';
  const N = self.NEET, T = N.timer;

  const FILE = 'neet-flip-clock-sync.json';
  const API = 'https://api.github.com';
  const SKEYS = ['targetDate', 'startDate', 'refs', 'keepAwake', 'reminders', 'focus', 'short', 'long', 'every', 'auto', 'goal',
    'reminderMinutes', 'sound', 'flipSound', 'showSeconds', 'fx'];
  const DEF = Object.assign({ targetDate: null, startDate: null, refs: [], keepAwake: true, reminders: true }, T.CFG);
  const J = JSON.stringify;
  const get = (o) => chrome.storage.local.get(o);
  // same bytes whatever order the keys were built in, so two browsers never keep rewriting each other's copy
  const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
  const canon = (v) => J(sortKeys(v));

  async function gh(token, path, opt) {
    const r = await fetch(API + path, Object.assign({
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    }, opt));
    if (!r.ok) { const e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
    return r.status === 204 ? null : r.json();
  }

  async function findGist(token) {
    for (let page = 1; page <= 5; page++) {
      const list = await gh(token, '/gists?per_page=100&page=' + page);
      const g = list.find((x) => x.files && x.files[FILE]);
      if (g) return g.id;
      if (list.length < 100) break;
    }
    return null;
  }

  async function readDoc(token, id) {
    const g = await gh(token, '/gists/' + id);
    const f = g.files && g.files[FILE];
    if (!f) return null;
    let txt = f.content;
    if (f.truncated && f.raw_url) txt = await (await fetch(f.raw_url)).text();
    try { return JSON.parse(txt); } catch (e) { return null; }
  }

  const writeDoc = (token, id, doc) => gh(token, '/gists/' + id, { method: 'PATCH', body: J({ files: { [FILE]: { content: canon(doc) } } }) });
  const createGist = async (token, doc) => (await gh(token, '/gists', { method: 'POST', body: J({ description: 'NEET flip clock sync (do not edit)', public: false, files: { [FILE]: { content: canon(doc) } } }) })).id;

  // counters only ever grow, so merging two copies is just the larger number for every field
  function maxMerge(a, b) {
    const out = {};
    [a || {}, b || {}].forEach((src) => Object.keys(src).forEach((day) => {
      out[day] = out[day] || {};
      Object.keys(src[day] || {}).forEach((k) => { out[day][k] = Math.max(out[day][k] || 0, src[day][k] || 0); });
    }));
    return out;
  }

  const newer = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);   // [time, install id]

  // Pure function: given this browser's state and the cloud copy, say what the cloud and this browser should hold.
  function merge(L, R, now) {
    R = R && R.v === 1 ? R : { v: 1, settings: {}, logs: {}, timer: null, seen: {} };
    const doc = { v: 1, settings: {}, logs: {}, timer: null, seen: Object.assign({}, R.seen) };
    const apply = { settings: {}, stamps: {}, remoteLog: {}, timer: null };

    SKEYS.forEach((k) => {
      const lv = L.settings[k];
      const ls = L.stamps[k] || [0, L.iid];
      const rr = R.settings[k];                    // [value, time, install id]
      if (rr && J(rr[0]) !== J(lv) && newer([rr[1], rr[2]], ls)) {
        doc.settings[k] = rr; apply.settings[k] = rr[0]; apply.stamps[k] = [rr[1], rr[2]];
      } else if (rr && J(rr[0]) === J(lv)) {
        const st = newer([rr[1], rr[2]], ls) ? [rr[1], rr[2]] : ls;
        doc.settings[k] = [lv, st[0], st[1]]; apply.stamps[k] = st;
      } else {
        doc.settings[k] = [lv, ls[0], ls[1]]; apply.stamps[k] = ls;
      }
    });

    // logs: this install owns its own entry; the others are copied in, never edited
    const ids = new Set(Object.keys(R.logs || {}).concat(Object.keys(L.remoteLog || {}), [L.iid]));
    ids.forEach((id) => {
      if (id === L.iid) doc.logs[id] = maxMerge((R.logs || {})[id], L.log);
      else { doc.logs[id] = maxMerge((R.logs || {})[id], (L.remoteLog || {})[id]); apply.remoteLog[id] = doc.logs[id]; }
    });

    const lt = L.timer, rt = R.timer;
    if (rt && (!lt || newer([rt.u || 0, rt.o || ''], [lt.u || 0, lt.o || '']))) { doc.timer = rt; apply.timer = rt; }
    else doc.timer = lt || null;

    if (!doc.seen[L.iid] || now - doc.seen[L.iid] > 30 * 60000) doc.seen[L.iid] = now;
    return { doc, apply };
  }

  let busy = null;
  const sync = () => (busy = (busy || Promise.resolve()).then(run, run));

  async function run() {
    const { syncCfg } = await get({ syncCfg: null });
    if (!syncCfg || !syncCfg.token) return { ok: false, off: true };
    const now = Date.now();
    try {
      const iid = await T.getIid();
      const cur = await get(Object.assign({}, DEF, { syncBase: null, stamps: {}, studyLog: {}, remoteLog: {}, timer: null }));
      const settings = {}, stamps = {};
      const first = !cur.syncBase;
      SKEYS.forEach((k) => {
        settings[k] = cur[k];
        const changed = first ? J(cur[k]) !== J(DEF[k]) : J(cur[k]) !== J(cur.syncBase[k]);
        stamps[k] = changed ? [now, iid] : (cur.stamps[k] || [0, iid]);
      });

      let id = syncCfg.gistId || await findGist(syncCfg.token);
      let remote = id ? await readDoc(syncCfg.token, id) : null;
      const out = merge({ iid, settings, stamps, log: cur.studyLog, remoteLog: cur.remoteLog, timer: cur.timer }, remote, now);

      // this browser takes what is newer in the cloud
      const patch = Object.assign({}, out.apply.settings, { remoteLog: out.apply.remoteLog });
      if (out.apply.timer) patch.timer = out.apply.timer;
      const finalSettings = Object.assign({}, settings, out.apply.settings);
      const stampsOut = {};
      SKEYS.forEach((k) => { stampsOut[k] = out.apply.stamps[k]; });
      patch.stamps = stampsOut;
      patch.syncBase = Object.fromEntries(SKEYS.map((k) => [k, finalSettings[k]]));
      await chrome.storage.local.set(patch);

      // and the cloud takes what is newer here
      if (!id) { id = await createGist(syncCfg.token, out.doc); }
      else if (canon(out.doc) !== canon(remote)) await writeDoc(syncCfg.token, id, out.doc);
      if (id !== syncCfg.gistId) await chrome.storage.local.set({ syncCfg: Object.assign({}, syncCfg, { gistId: id }) });

      await chrome.storage.local.set({ syncState: { ok: true, t: Date.now() } });
      return { ok: true };
    } catch (e) {
      const bad = e && (e.status === 401 || e.status === 403);
      const msg = bad ? (e.status === 401 ? 'The token was rejected' : 'GitHub refused the request (permission or rate limit)')
        : e && e.status ? 'GitHub error ' + e.status : 'No connection';
      await chrome.storage.local.set({ syncState: { ok: false, t: Date.now(), error: msg } });
      return { ok: false, error: msg };
    }
  }

  async function connect(token) {
    token = (token || '').trim();
    if (!token) return { ok: false, error: 'Paste your token first' };
    let login = '';
    try { login = (await gh(token, '/user')).login; }
    catch (e) { return { ok: false, error: e.status === 401 ? 'GitHub rejected that token' : e.status ? 'GitHub error ' + e.status : 'No connection' }; }
    await chrome.storage.local.set({ syncCfg: { token, gistId: null, login } });
    return sync();
  }

  async function disconnect() {
    await chrome.storage.local.remove(['syncCfg', 'syncBase', 'syncState', 'remoteLog', 'stamps']);
    return { ok: true };
  }

  N.sync = { SKEYS, merge, maxMerge, sync, connect, disconnect };
})();

const ALARM = 'neet-reminder';
const PHASE_ALARM = 'neet-phase';
const BADGE_ALARM = 'neet-badge';
const BEAT_ALARM = 'neet-beat';
const SYNC_ALARM = 'neet-sync';

/* ---------- the hourly timer ---------- */

async function syncAlarm() {
  const { reminders } = await chrome.storage.local.get({ reminders: true });
  const existing = await chrome.alarms.get(ALARM);

  if (!reminders) {
    if (existing) await chrome.alarms.clear(ALARM);
    return;
  }
  const minutes = (await NEET.timer.getCfg()).reminderMinutes;
  if (!existing || existing.periodInMinutes !== minutes) {
    await chrome.alarms.create(ALARM, { delayInMinutes: minutes, periodInMinutes: minutes });
  }
}

chrome.runtime.onInstalled.addListener(() => { syncAlarm(); syncTimer(); startBeat(true); syncCloud(); });
chrome.runtime.onStartup.addListener(() => { syncAlarm(); syncTimer(); startBeat(true); syncCloud(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.reminders || changes.reminderMinutes) syncAlarm();
  if (changes.timer) syncTimer(changes.timer.newValue);
  if (changes.syncCfg) syncCloud();
  // a change made here goes to the other browser a few seconds later
  if (['timer', 'targetDate', 'startDate', 'refs', 'keepAwake', 'reminders', 'focus', 'short', 'long', 'every', 'auto', 'goal', 'reminderMinutes', 'sound', 'flipSound', 'showSeconds', 'fx'].some((k) => changes[k])) pushSoon();
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM) remind();
  if (alarm.name === PHASE_ALARM) {
    const r = await NEET.timer.act('complete');
    if (r && r.finished) announce(r.finished, r.state);
  }
  if (alarm.name === BADGE_ALARM) paintBadge();
  if (alarm.name === BEAT_ALARM) beat();
  if (alarm.name === SYNC_ALARM) NEET.sync.sync();
});
chrome.action.onClicked.addListener(() => remind());
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === 'sync-connect') { NEET.sync.connect(msg.token).then(reply); return true; }
  if (msg.type === 'sync-now') { NEET.sync.sync().then(reply); return true; }
  if (msg.type === 'sync-off') { NEET.sync.disconnect().then(reply); return true; }
  if (msg.type === 'notify-fallback' || msg.type === 'preview-window') showWindow();
});
syncAlarm();
syncTimer();
startBeat(false);
syncCloud();

/* ---------- "at desk": how long the device has been on today, not counting sleep ----------
   Every 30 seconds the worker adds the time since its last beat. If the gap is longer than about
   100 seconds the device was asleep (or the browser was closed), so that gap is not counted.
   The sum is kept per day and split exactly at midnight. */

async function startBeat(fresh) {
  if (fresh) await chrome.storage.local.set({ deskBeat: Date.now() });
  const a = await chrome.alarms.get(BEAT_ALARM);
  if (!a) await chrome.alarms.create(BEAT_ALARM, { periodInMinutes: 0.5 });
  if (!fresh) beat();
}

let beating = Promise.resolve();
function beat() { beating = beating.then(doBeat, doBeat); return beating; }

async function doBeat() {
  const now = Date.now();
  const { deskBeat } = await chrome.storage.local.get({ deskBeat: 0 });
  if (deskBeat && now > deskBeat && now - deskBeat <= 100000) {
    let t = deskBeat;
    while (t < now) {
      const d = new Date(t);
      const end = Math.min(now, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime());
      await NEET.timer.addLog({ desk: Math.round((end - t) / 10) / 100 }, NEET.toISO(d));
      t = end;
    }
  }
  await chrome.storage.local.set({ deskBeat: now });
}

/* ---------- sync with the other browser ---------- */

let pushTimer = 0;
function pushSoon() { clearTimeout(pushTimer); pushTimer = setTimeout(() => NEET.sync.sync(), 4000); }

async function syncCloud() {
  const { syncCfg } = await chrome.storage.local.get({ syncCfg: null });
  if (syncCfg && syncCfg.token) {
    await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
    NEET.sync.sync();
  } else await chrome.alarms.clear(SYNC_ALARM);
}

/* ---------- showing it: in the page when Chrome is in front, as a real window everywhere else ---------- */

const isOwnPage = (url) => !!url && url.startsWith(chrome.runtime.getURL(''));
const WINDOW_URL = () => chrome.runtime.getURL('popup.html?mode=window');

async function remind() {
  if (await showInPage()) return;
  await showWindow();
}

// Chrome is the app in front and its page can take the card: slide it in over that page
async function showInPage() {
  let win = null;
  try { win = await chrome.windows.getLastFocused({ populate: true }); } catch (e) { return false; }
  if (!win || !win.focused || win.state === 'minimized') return false;

  const tab = (win.tabs || []).find((t) => t.active);
  if (!tab || tab.id == null) return false;

  try {
    if (isOwnPage(tab.url)) await chrome.tabs.sendMessage(tab.id, { type: 'neet-show' });
    else await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['reminder.js'] });
    return true;
  } catch (e) {
    return false; // chrome:// pages, the Web Store and similar can't be scripted
  }
}

// Anything else (another app in front, an Android app, a Linux app, a PWA window, a page that can't be
// scripted): open the card as its own small window in the top-right corner. It appears above other apps.
async function showWindow() {
  try {
    await closeReminderWindows();

    const W = 376, H = 214; // a good first guess: the card then fits itself exactly
    const opts = { url: WINDOW_URL(), type: 'popup', width: W, height: H, focused: true };
    try {
      const info = await chrome.system.display.getInfo();
      const d = info.find((i) => i.isPrimary) || info[0];
      if (d) {
        opts.left = Math.round(d.workArea.left + d.workArea.width - W - 16);
        opts.top = Math.round(d.workArea.top + 16);
      }
    } catch (e) { /* the system places it */ }

    const win = await chrome.windows.create(opts);
    if (win && win.id != null) await chrome.storage.session.set({ reminderWindowId: win.id });
  } catch (e) {
    await notify(); // last resort
  }
}

// never two reminder windows at once: the previous one (remembered by id) is closed first
async function closeReminderWindows() {
  try {
    const { reminderWindowId } = await chrome.storage.session.get('reminderWindowId');
    if (reminderWindowId != null) await chrome.windows.remove(reminderWindowId).catch(() => {});
    await chrome.storage.session.remove('reminderWindowId');
  } catch (e) { /* ignore */ }
  try { // belt and braces: anything still showing the card
    const wins = await chrome.windows.getAll({ populate: true });
    for (const w of wins) {
      if ((w.tabs || []).some((t) => (t.url || t.pendingUrl || '').startsWith(chrome.runtime.getURL('popup.html')))) {
        await chrome.windows.remove(w.id).catch(() => {});
      }
    }
  } catch (e) { /* ignore */ }
}

async function notify() {
  const { date } = await NEET.getTarget();
  const now = new Date();
  const r = NEET.remaining(now, date);

  const options = {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'NEET UG 2028',
    message: r.total > 0
      ? NEET.describe(r) + ' to go'
      : NEET.sameDay(now, date) ? 'It is exam day.' : 'The date you set has passed.',
    priority: 1,
  };
  if (r.total > 0) options.contextMessage = r.total + ' days in total';

  chrome.notifications.create(options);
}


/* ---------- the focus timer: it keeps running with no tab open ---------- */

async function syncTimer(state) {
  if (state === undefined) state = (await chrome.storage.local.get({ timer: null })).timer;
  if (state && state.status === 'running') {
    await chrome.alarms.create(PHASE_ALARM, { when: Math.max(Date.now() + 500, state.endAt) });
    await chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 1 });
  } else {
    await chrome.alarms.clear(PHASE_ALARM);
    await chrome.alarms.clear(BADGE_ALARM);
  }
  paintBadge(state);
}

// minutes left on the toolbar icon, orange while focusing, green on a break
async function paintBadge(state) {
  if (state === undefined) state = (await chrome.storage.local.get({ timer: null })).timer;
  try {
    if (!state || state.status === 'idle') { await chrome.action.setBadgeText({ text: '' }); return; }
    const left = state.status === 'running' ? Math.max(0, state.endAt - Date.now()) : state.remaining;
    await chrome.action.setBadgeText({ text: state.status === 'paused' ? 'II' : String(Math.max(1, Math.ceil(left / 60000))) });
    await chrome.action.setBadgeBackgroundColor({ color: state.phase === 'focus' ? '#ff9f0a' : '#30d158' });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#000000' });
  } catch (e) { /* ignore */ }
}

async function announce(was, state) {
  const c = await NEET.timer.getCfg();
  const next = state.phase === 'long' ? c.long : c.short;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: was === 'focus' ? 'Focus session done' : 'Break over',
    message: (was === 'focus' ? 'Take a ' + next + ' minute break. ' : 'Ready for the next focus session? ') + await noteLine(),
    priority: 2,
  });
}

// a line of motivation for notifications, with today's numbers
async function noteLine() {
  const st = await chrome.storage.local.get({ startDate: null, targetDate: null });
  const target = (await NEET.getTarget()).date;
  const start = NEET.parseISO(st.startDate) || NEET.parseISO(NEET.timer.DEFAULT_START);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const left = Math.max(0, Math.round((target - today) / 864e5));
  return NEET.lines.next({ left, gone: Math.max(0, Math.round((today - start) / 864e5)), total: Math.round((target - start) / 864e5), weeks: Math.ceil(left / 7), hrs: 24 - now.getHours() - 1, daypart: NEET.lines.daypart(now), over: today > target, examDay: left === 0 });
}

