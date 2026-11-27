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
