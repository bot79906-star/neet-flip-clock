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
