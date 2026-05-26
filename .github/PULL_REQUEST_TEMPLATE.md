<!--
Thanks for the PR. Keep the form short; pi-mem's full workflow lives in CLAUDE.md.
-->

## Summary

<!-- 1-3 sentences. Lead with "why," not "what" — the diff says what. -->

## Changes

<!-- Bulleted list of concrete changes -->

-
-

## Testing

- [ ] `npm test` passes (124+ tests)
- [ ] `npm run typecheck` clean
- [ ] `npm run check` clean (Biome + Prettier)
- [ ] New tests added if behavior changed
- [ ] Integration drift guard added if wrapping a new claude-mem endpoint

## Scope check

- [ ] Falls within scope per [CONTRIBUTING.md](../CONTRIBUTING.md#whats-in-scope) and [CLAUDE.md](../CLAUDE.md#out-of-scope--do-not-add-unilaterally)
- [ ] No changes to claude-mem itself (we work within `rawAdapter` boundaries)

## Spec / plan updated?

If this adds a tool or changes a contract, update:

- [ ] `docs/superpowers/specs/2026-05-26-pi-mem-design.md` (error matrix, data flow)
- [ ] `docs/superpowers/plans/2026-05-26-pi-mem.md` (Revision History entry)
- [ ] `CHANGELOG.md` under `[Unreleased]`
- [ ] N/A — internal change only

## Anything reviewers should focus on?

<!-- Areas of uncertainty, design trade-offs, performance concerns, etc. -->
