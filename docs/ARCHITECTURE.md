# Architecture

A Manifest V3 extension with no framework and no runtime dependencies. `source/build.py` bundles `source/src/` into the `extension/` folder that browsers load.

## Entry points

| Output file | Built from | Role |
|---|---|---|
| `newtab.html` / `newtab.js` | `newtab.html.tpl`, `common`, `quotes`, `timer`, `sound`, `motion`, `flip`, `reminder.src`, `newtab.app` | The new tab page (countdown, focus, journey, settings). CSS is inlined for a fast first paint. |
| `popup.html` / `popup.js` | `popup.html.tpl`, `common`, `quotes`, `timer`, `motion`, `flip`, `popup.app` | The reminder card, shown in an iframe. |
| `reminder.js` | `motion`, `reminder.src` | Injected into the current page to display the reminder card. |
| `background.js` | `common`, `quotes`, `timer`, `sync`, `background.src` | Service worker: alarms, badge, notifications, "at desk" counter, sync. |

## Source modules (`source/src/`)

| File | Purpose |
|---|---|
| `common.js` | Shared helpers and defaults |
| `timer.js` | Pomodoro state machine, subjects, per-install logs |
| `flip.js`, `flip.css` | Flip-clock rendering and animation |
| `motion.js` | Spring and transform-based motion helpers |
| `sound.js` | Timer sounds |
| `sync.js` | Gist-based sync and merge logic |
| `quotes.js` | Motivation lines |
| `newtab.app.js`, `newtab.css` | New tab page logic and styling |
| `popup.app.js`, `popup.css` | Reminder card logic and styling |
| `fonts.css` | `@font-face` declarations for the bundled fonts |

## Data
Everything is in `chrome.storage.local` (timer state in session storage where needed). Per-install logs are merged by taking the maximum value per day and subject, which makes sync safe across browsers.

## Build
```bash
python3 source/build.py            # outputs ./extension
python3 source/build.py /some/dir  # or a custom folder
```
The build is deterministic. CI rebuilds and fails if the committed `extension/` differs.

## Design principles
- Fast: inline CSS, few files, nothing blocks first paint.
- Smooth: animate only `transform` and `opacity`.
- Private: no remote code, no analytics, one optional network target (`api.github.com`).
