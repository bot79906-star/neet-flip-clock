# Contributing

Thanks for helping improve NEET 2028 Flip Clock! Bug reports, ideas, documentation fixes and code are all welcome.

## Ways to help
- **Report a bug** using the [bug template](../../issues/new/choose).
- **Suggest a feature** using the feature template.
- **Improve docs**, add screenshots to `docs/screenshots/`, fix typos.
- **Send code**, see below.

## Development setup
You only need Python 3 and Chrome or Edge. There is no npm and no bundler.

```bash
git clone https://github.com/YOUR-USERNAME/neet-flip-clock.git
cd neet-flip-clock
python3 source/build.py          # builds source/ into extension/
```

Then in `chrome://extensions`: enable **Developer mode**, click **Load unpacked** and pick the `extension/` folder. After each change, rebuild and press the reload icon on the extension card.

## Where things live
- Edit **`source/src/`** (and `source/manifest.json`). **Do not edit `extension/` by hand**, it is generated.
- **Always commit the rebuilt `extension/`** together with your source changes. CI fails if they do not match.
- See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the files fit together.

## Pull request checklist
- [ ] Branch from `main`, one focused change per PR
- [ ] `python3 source/build.py` run and `extension/` committed
- [ ] Tested by loading the extension in Chrome (and Edge if the change touches sync, the new tab page, or reminders)
- [ ] No new network requests, remote code, trackers or extra permissions (if a permission is needed, explain why in the PR and update `PRIVACY.md`)
- [ ] `CHANGELOG.md` updated for user-visible changes
- [ ] Screenshots or a short clip for UI changes

## Code style
- Plain JavaScript (no frameworks), 2-space indentation, `'single quotes'`, semicolons.
- Keep motion on `transform` and `opacity` so it stays smooth.
- Keep the extension fast to open: avoid blocking work before the first paint.
- Respect the **Effects** setting (Full / Light / Off) for any new animation.

## Commit messages
Short, present tense, descriptive: `Fix timer drift after sleep`, `Add long-break length setting`.

## Releases (maintainers)
1. Bump `version` (and `version_name`) in `source/manifest.json`.
2. Add a section to `CHANGELOG.md`.
3. `python3 source/build.py` and commit.
4. `bash scripts/package.sh`, then create a GitHub Release tagged `vX.Y.Z` and attach the zip from `dist/`.

By contributing you agree that your work is released under the [MIT License](LICENSE).
