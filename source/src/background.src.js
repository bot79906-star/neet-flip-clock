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
