<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<title>NEET UG 2028 · Reminder</title>
<link rel="preload" href="fonts/digits.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="fonts/ui-400.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="fonts/ui-700.woff" as="font" type="font/woff" crossorigin>
<style>/*CSS*/</style>
<script src="popup.js" defer></script>
</head>
<body>
  <div class="edge" aria-hidden="true"><i></i></div>

  <main id="card" role="status" aria-live="polite">
    <header class="rise" style="--i:0">
      <img class="app" src="icons/icon48.png" alt="" width="30" height="30" draggable="false">
      <div class="head">
        <p class="title">NEET UG 2028</p>
        <p class="sub">Reminder</p>
      </div>
      <button id="close" class="close" type="button" aria-label="Dismiss reminder">
        <svg class="ring" viewBox="0 0 32 32" aria-hidden="true">
          <circle class="track" cx="16" cy="16" r="13"/>
          <circle class="prog" id="ring" cx="16" cy="16" r="13"/>
        </svg>
        <svg class="x" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8"/></svg>
      </button>
    </header>

    <div class="row">
      <div class="pair">
        <div class="cell"><div id="months"></div><span class="lab rise" style="--i:3">months</span></div>
        <div class="cell"><div id="days"></div><span class="lab rise" style="--i:4">days</span></div>
      </div>
      <div class="total rise" style="--i:2">
        <p class="num" id="total"></p>
        <p class="lbl" id="lbl">days to go</p>
        <p class="date" id="date"></p>
      </div>
    </div>

    <div class="rail rise" style="--i:5">
      <div class="r1"><span><b id="r-day"></b></span><span id="r-pct"></span></div>
      <div class="rbar" id="rbar"><i></i></div>
      <p class="rmsg" id="rmsg"></p>
    </div>
  </main>
</body>
</html>
