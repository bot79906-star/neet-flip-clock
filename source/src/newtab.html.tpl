<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>New Tab</title>
<link rel="preload" href="fonts/digits.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="fonts/ui-400.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="fonts/ui-700.woff" as="font" type="font/woff" crossorigin>
<style>/*CSS*/</style>
<script src="newtab.js" defer></script>
</head>
<body>
  <canvas class="embers" id="embers" aria-hidden="true"></canvas>
  <div class="aura-wrap" id="aura-wrap" aria-hidden="true"><div class="aura arrive" id="aura"></div></div>

  <header class="top">
    <p id="today" class="arrive"></p>

    <div class="controls arrive" id="controls" role="toolbar" aria-label="Page controls">
      <button id="btn-awake" class="icon-btn" type="button" aria-pressed="true" aria-label="Keep screen on" data-tip="Keep screen on">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
          <path class="slash" d="M3 3l18 18"/>
        </svg>
      </button>

      <button id="btn-bell" class="icon-btn" type="button" aria-pressed="true" aria-label="Reminders" data-tip="Reminders on">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
          <path class="slash" d="M3 3l18 18"/>
        </svg>
      </button>

      <button id="btn-settings" class="icon-btn" type="button" aria-label="Settings" data-tip="Settings (S)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10"/>
          <circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>
        </svg>
      </button>

      <button id="btn-preview" class="icon-btn" type="button" aria-label="Preview reminder" data-tip="Preview reminder (Shift: as window)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>

      <button id="btn-full" class="icon-btn" type="button" aria-label="Full screen" data-tip="Full screen (F)">
        <svg class="i-expand" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
        </svg>
        <svg class="i-shrink" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>
        </svg>
      </button>
    </div>
  </header>

  <main>
    <aside class="gut gl arrive" aria-hidden="true"><b id="gl-n">0</b><span>days gone</span><p id="gl-q"></p></aside>
    <aside class="gut gr arrive" aria-hidden="true"><b id="gr-n">0</b><span>days to go</span><p id="gr-q"></p></aside>
    <div class="stage" id="stage">
      <div class="clockwrap">
        <section id="clock" class="clock arrive" role="timer" aria-label="Current time"></section>
        <div class="secbar arrive" id="secbar" aria-hidden="true"><i></i></div>
      </div>

      <p class="engine arrive" id="engine" aria-live="off">
        <i class="ember" aria-hidden="true"></i>
        <span title="How long this device has been on today. It pauses while the device sleeps.">At desk <b id="eng-desk">0m</b></span>
        <span>Week <b id="eng-week"></b></span>
      </p>

      <div class="tabs arrive" id="tabs" role="tablist" aria-label="Views">
        <i class="pill" id="pill" aria-hidden="true"></i>
        <button role="tab" id="t-count" class="tab" type="button" aria-selected="true" data-p="count">Countdown</button>
        <button role="tab" id="t-focus" class="tab" type="button" aria-selected="false" data-p="focus">Focus</button>
        <button role="tab" id="t-journey" class="tab" type="button" aria-selected="false" data-p="journey">Journey</button>
      </div>

      <div class="panels arrive" id="panels">

        <section class="panel on" id="p-count" role="tabpanel" aria-labelledby="t-count">
          <p class="cd-title">NEET UG 2028 is in</p>
          <div class="cd-cards" id="cd-cards">
            <div class="cd-group">
              <div id="months"></div>
              <span class="cd-label">months</span>
            </div>
            <div class="cd-group">
              <div id="days"></div>
              <span class="cd-label">days</span>
            </div>
          </div>
          <p class="cd-line" id="cd-line"></p>
          <p class="cd-note">
            <span id="target-text"></span>
            <button id="edit-date" class="link-btn" type="button">Change date</button>
            <input id="date-input" type="date" hidden aria-label="NEET exam date">
          </p>
        </section>

        <section class="panel" id="p-focus" role="tabpanel" aria-labelledby="t-focus" hidden>
          <p class="f-phase"><span id="f-phase">Focus</span><span class="dots" id="f-dots" aria-hidden="true"></span></p>
          <div class="f-cards" id="f-cards" role="timer" aria-label="Focus timer">
            <div id="f-min"></div>
            <div id="f-sec"></div>
          </div>
          <div class="subs" id="subs" role="group" aria-label="Subject">
            <button class="sub" type="button" data-s="phy" aria-pressed="true">Physics</button>
            <button class="sub" type="button" data-s="chem" aria-pressed="false">Chemistry</button>
            <button class="sub" type="button" data-s="bot" aria-pressed="false">Botany</button>
            <button class="sub" type="button" data-s="zoo" aria-pressed="false">Zoology</button>
          </div>
          <div class="f-controls">
            <button id="f-go" class="pill-btn primary" type="button">Start focus</button>
            <button id="f-skip" class="pill-btn" type="button">Skip</button>
            <button id="f-reset" class="pill-btn" type="button">Reset</button>
            <button id="f-deep" class="pill-btn" type="button" data-tip="Deep focus (D)">Deep focus</button>
          </div>
          <div class="week" id="week" aria-label="Focus time, last seven days"></div>
        </section>

        <section class="panel" id="p-journey" role="tabpanel" aria-labelledby="t-journey" hidden>
          <p class="j-day" id="j-day"></p>
          <div class="matrix" id="matrix-wrap">
            <canvas id="matrix" role="img" aria-label="Every day of your plan, with the days already gone lit"></canvas>
          </div>
          <p class="j-sub"><span id="j-text"></span><button id="j-edit" class="link-btn" type="button">Change start</button><input id="j-input" type="date" hidden aria-label="Preparation start date"></p>
          <div class="chips" id="chips"></div>
          <div class="ref-add" id="ref-form" hidden>
            <input id="ref-label" type="text" maxlength="40" placeholder="Name, e.g. Mock 1" aria-label="Label">
            <input id="ref-date" type="date" aria-label="Date">
            <button id="ref-add" class="pill-btn primary" type="button">Add</button>
            <button id="ref-cancel" class="pill-btn" type="button">Cancel</button>
          </div>
        </section>

      </div>
    </div>
  </main>


  <footer class="rail arrive" id="rail" aria-label="Where you are in the plan">
    <div class="r-top">
      <p class="r-today"><b id="r-hleft"></b> left today</p>
      <p class="r-msg" id="r-msg"></p>
      <p class="r-left"><b id="r-left">0</b> <span id="r-left-l">days left</span></p>
    </div>
    <div class="track" id="track" role="img" aria-label="">
      <div class="t-fill" id="t-fill" aria-hidden="true"><i class="shine"></i></div>
      <div class="t-minor" id="t-minor" aria-hidden="true"></div>
      <div class="t-refs" id="t-refs"></div>
      <div class="t-head" id="t-head" aria-hidden="true"><span class="t-flag" id="t-flag"></span></div>
    </div>
    <div class="scale" id="scale" aria-hidden="true"></div>
  </footer>

  <div class="deep" id="deep" hidden role="dialog" aria-modal="true" aria-label="Deep focus">
    <p class="d-phase" id="d-phase"></p>
    <div class="d-cards"><div id="d-min"></div><div id="d-sec"></div></div>
    <div class="d-line" aria-hidden="true"><i id="d-fill"></i></div>
    <p class="d-msg" id="d-msg"></p>
    <p class="d-quote" id="d-quote"></p>
    <div class="d-controls">
      <button id="d-go" class="pill-btn primary" type="button">Pause</button>
      <button id="d-skip" class="pill-btn" type="button">Skip</button>
      <button id="d-exit" class="pill-btn" type="button">Exit</button>
    </div>
  </div>

  <div class="scrim" id="scrim" hidden></div>
  <aside class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Settings" hidden>
    <header><h2>Settings</h2><button id="sheet-close" class="icon-btn" type="button" aria-label="Close settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button></header>
    <div class="rows">
      <h3>Sync Chrome and Edge</h3>
      <div class="sync" id="sync">
        <p class="sync-st" id="sync-st" role="status">Not connected</p>
        <div class="sync-row" id="sync-form"><input id="sync-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your GitHub token" aria-label="GitHub token"><button id="sync-go" class="pill-btn primary" type="button">Connect</button></div>
        <div class="sync-row" id="sync-live" hidden><button id="sync-now" class="pill-btn" type="button">Sync now</button><button id="sync-off" class="pill-btn" type="button">Disconnect</button></div>
        <p class="sync-help">Use the same token in both browsers and they stay in step: settings, dates, the timer and your history. <a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=NEET%20flip%20clock" target="_blank" rel="noopener">Create a token</a> with only the "gist" permission. Everything lives in one private gist on your account.</p>
      </div>
      <h3>Focus timer</h3>
      <label class="row"><span>Focus length</span><span class="num"><input data-k="focus" type="number" min="1" max="99"><em>min</em></span></label>
      <label class="row"><span>Short break</span><span class="num"><input data-k="short" type="number" min="1" max="60"><em>min</em></span></label>
      <label class="row"><span>Long break</span><span class="num"><input data-k="long" type="number" min="1" max="90"><em>min</em></span></label>
      <label class="row"><span>Long break after</span><span class="num"><input data-k="every" type="number" min="2" max="8"><em>sessions</em></span></label>
      <label class="row"><span>Start the next phase automatically</span><input class="sw" data-k="auto" type="checkbox"></label>
      <h3>Reminders and sound</h3>
      <label class="row"><span>Reminder card every</span><span class="num"><input data-k="reminderMinutes" type="number" min="5" max="240"><em>min</em></span></label>
      <label class="row"><span>Chime when a phase ends</span><input class="sw" data-k="sound" type="checkbox"></label>
      <label class="row"><span>Flap click on every flip</span><input class="sw" data-k="flipSound" type="checkbox"></label>
      <label class="row"><span>Effects</span><select data-k="fx" aria-label="Effects level"><option value="full">Full</option><option value="light">Light</option><option value="off">Off</option></select></label>
      <h3>Clock</h3>
      <label class="row"><span>Show seconds</span><input class="sw" data-k="showSeconds" type="checkbox"></label>
      <h3>Your data</h3>
      <div class="row nolabel"><button id="bk-exp" class="pill-btn" type="button">Export backup</button><button id="bk-imp" class="pill-btn" type="button">Import backup</button><input id="bk-file" type="file" accept="application/json" hidden></div>
    </div>
  </aside>
</body>
</html>
