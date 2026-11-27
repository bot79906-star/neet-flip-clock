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
