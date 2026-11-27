# Privacy Policy

_Last updated: for version 4.4.0_

**NEET 2028 Flip Clock** does not collect, sell or share personal data. The project operates no servers, analytics or advertising.

## What is stored, and where
Everything is stored **locally in your browser** using `chrome.storage`:

- Your settings (exam date, timer lengths, reminder interval, effects level, reference dates)
- Your focus-timer state and study history (time per day and per subject, "at desk" time)
- If you enable sync: your GitHub token and the id of your sync gist

None of this leaves your device unless you turn on sync.

## Network activity
The extension makes **no network requests** unless you enable the optional Chrome and Edge sync. When enabled, it talks only to `https://api.github.com`, using the token you supply, to read and write one **private gist** named `neet-flip-clock-sync.json` in **your own** GitHub account. The author of this project has no access to it.

The extension loads no remote code, scripts, fonts or images. Fonts are bundled.

## Permissions and why they are needed

| Permission | Why |
|---|---|
| `storage` | Save settings, history and timer state locally. |
| `alarms` | Schedule reminders, timer phase changes, the 30-second "at desk" counter and the sync interval. |
| `notifications` | Show reminder and timer-finished notifications. |
| `scripting` + host access (`<all_urls>`) | Show the small reminder card on top of the page you are currently viewing. The injected script only draws the card; it does not read or collect page content. |
| `system.display` | Place the reminder window in the corner of your primary screen. |

The reminder card can be turned off in Settings.

## Your control
- **Delete everything:** remove the extension, or clear its storage.
- **Stop sync:** disconnect in Settings and delete the gist and token from your GitHub account.
- **Export:** Settings has a backup export. The backup file **does not include** your sync token.

## Children
The project is aimed at students. It collects no personal information from anyone.

## Changes
Any change to this policy will be recorded in [CHANGELOG.md](CHANGELOG.md).

## Contact
Open an issue at <https://github.com/bot79906-star/neet-flip-clock/issues>.
