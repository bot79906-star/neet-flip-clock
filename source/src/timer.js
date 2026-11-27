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
