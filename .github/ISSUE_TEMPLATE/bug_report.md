---
name: Bug report
about: Something doesn't work as documented in spec/README
labels: bug
---

## Environment

- **pi-mem version**: <!-- output of `npm ls @husniadil/pi-mem` or commit SHA -->
- **claude-mem version**: <!-- output of `npx claude-mem --version` (we test against 13.x) -->
- **pi version**: <!-- output of `pi --version` -->
- **Node version**: <!-- output of `node --version` (we require ≥ 22) -->
- **OS**: <!-- macOS, Linux distro, etc. -->

## What happened

<!-- One-sentence summary -->

## Repro steps

1.
2.
3.

## Expected

<!-- What spec/README says should happen, with section reference if you can find it -->

## Actual

<!-- What actually happened. Paste tool output / error messages verbatim -->

```
<paste here>
```

## Debug info

<details>
<summary>Click to expand — run with debug logging</summary>

```bash
PI_MEM_LOG_LEVEL=debug pi
# then trigger the bug
```

Paste relevant `[DEBUG]` lines:

</details>

## Which tool / surface is affected?

- [ ] Auto-inject context (session_start)
- [ ] Event capture (message_end / tool_result / agent_end)
- [ ] `mem_search` tool
- [ ] `mem_timeline` tool
- [ ] `mem_get_observations` tool
- [ ] Preflight / startup
- [ ] Other: <!-- specify -->

## Is this a claude-mem contract drift?

If pi-mem worked previously and broke after a `claude-mem` update, this
is likely contract drift (see CLAUDE.md "Critical fragility" section).
Run `npm test -- tests/integration/` against the new claude-mem version
— a failing drift guard tells us what changed. Include the failing
test output above.
