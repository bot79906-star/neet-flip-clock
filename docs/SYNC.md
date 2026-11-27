# Chrome and Edge sync

Sync is **optional** and needs no server. It uses one **private GitHub gist** in your own account as shared storage.

## What is synced
Settings, exam and reference dates, the timer, and your study history. Study logs are kept per browser install and **merged**, never overwritten, so using both browsers on the same day adds up correctly.

## Set up (about a minute)
1. Create a token at <https://github.com/settings/tokens/new?scopes=gist>. Tick **only** `gist`, generate it, and copy it.
2. In the first browser: Settings (`S`) → **Sync Chrome and Edge** → paste the token → **Connect**.
3. In the second browser: do the same with the **same** token.

The extension finds or creates a private gist named `neet-flip-clock-sync.json`. It syncs about once a minute.

## Safety notes
- Use a token with the `gist` scope only. It cannot touch your repositories.
- The token is stored in the extension's local browser storage and is **not** included in backup exports.
- To stop syncing: disconnect in Settings, then revoke the token at <https://github.com/settings/tokens> and delete the gist if you wish.
- If a device is lost or shared, revoke the token straight away.

## Troubleshooting
- **"Not connected" or errors:** confirm the token has the `gist` scope and has not expired.
- **Data not appearing:** make sure both browsers use the exact same token (same GitHub account).
- **Only one gist is used:** if you see several, keep the one named `neet-flip-clock-sync.json` that is updated most recently.
