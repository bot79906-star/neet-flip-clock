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
