# Security Policy

## Supported versions
Only the latest release receives fixes.

## Reporting a vulnerability
Please **do not** open a public issue for security problems.

Use GitHub's private reporting: go to the **Security** tab of this repository and choose **Report a vulnerability**. If that is not available, contact the maintainer through the email on their GitHub profile.

Please include steps to reproduce, the browser and version, and the extension version. You can expect an acknowledgement within a few days.

## Things worth knowing
- **Sync token:** if you use sync, your GitHub token is stored unencrypted in the extension's local storage, which is the normal behaviour for browser extensions. Create it with **only** the `gist` scope, and revoke it at <https://github.com/settings/tokens> if a device is lost or shared.
- **Backups never contain the token.**
- **Never paste your token** into an issue or pull request.
- The extension loads no remote code and contacts only `api.github.com`, and only when sync is enabled.
