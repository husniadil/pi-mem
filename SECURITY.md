# Security Policy

## Reporting a Vulnerability

Email: **husni.adil@gmail.com**

Please include:
- A clear description of the issue
- Reproduction steps or proof-of-concept
- Affected version(s) — typically `0.1.0` or later
- Impact assessment (what an attacker could achieve)

I'll acknowledge within 7 days and aim to ship a fix within 30 days
for credible reports. Please don't file public GitHub issues for
security-sensitive reports — use email first.

## Supported Versions

Only the latest minor version receives security fixes. Older versions
may be deprecated without backport. Current: `0.1.x`.

## Attack Surface

pi-mem is a local Node.js process — it has no network ingress and
exposes no service ports. Risk surfaces:

- **Subprocess spawning** — `child_process.spawn` is used to invoke
  `claude-mem` hooks. Arguments are constructed from session/event
  data; no shell interpolation (no `shell: true`). User input doesn't
  reach a shell.
- **HTTP requests to localhost** — `mem_search`, `mem_get_observations`,
  `mem_timeline` make HTTP requests to the claude-mem worker on
  `127.0.0.1:<port>`. No external network calls. No bearer tokens
  read or transmitted.
- **Filesystem reads** — limited to `~/.claude-mem/settings.json` (for
  port discovery) and discovery of claude-mem worker scripts under
  `$CLAUDE_CONFIG_DIR` / `$CLAUDE_PLUGIN_ROOT`.
- **Log output** — `logger.ts` redacts `Bearer\s+\S+` patterns
  defensively (no API keys are read in normal operation, but the
  redactor is there in case any are passed through).

## Out-of-scope

- Vulnerabilities in **claude-mem** itself (report upstream:
  https://github.com/thedotmack/claude-mem)
- Vulnerabilities in **pi** itself (report upstream:
  https://github.com/earendil-works/pi)
- Issues caused by running pi-mem with `PI_MEM_LOG_LEVEL=debug` in
  shared environments (debug logs may include observation IDs / file
  paths — set to `warn` or higher in shared contexts)
