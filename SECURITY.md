# Security Policy

## Supported versions

Only the latest release (and `main`) is supported with security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting: open the repository's
**Security** tab → **Report a vulnerability**, and describe the issue with
reproduction steps. You can also request a private channel for coordinated
disclosure follow-ups there.

## Scope notes

Document Compiler is, by design, a **localhost-only** tool:

- the HTTP server binds to `127.0.0.1` and performs no authentication;
- documents are stored unencrypted under `data/` (or `DOC_COMPILER_DATA`).

Reports about *remote* exploitation are still welcome (e.g. drive-by style
attacks against the local server from a malicious web page, path traversal in
the HTTP routes, or unsafe file handling) — those are in scope.

Deployment hardening (exposing the server over a network, multi-user setups)
is outside the intended use and outside supported scope.
