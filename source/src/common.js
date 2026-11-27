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
