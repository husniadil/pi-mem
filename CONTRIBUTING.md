# Contributing to pi-mem

Thanks for considering a contribution. Before opening a PR, read
[`CLAUDE.md`](./CLAUDE.md) — it documents the project's feature
development workflow (grounding → spec/plan → TDD → review).

## Setup

```bash
# Node 22 from .nvmrc
nvm use   # or: fnm use, asdf use, mise use

npm install
npm test               # full unit + integration suite
npx tsc --noEmit       # type check
```

Integration tests under `tests/integration/` auto-skip via
`describe.skipIf(!haveClaudeMem)` when claude-mem isn't installed.
To exercise them: `npx claude-mem install` first.

## Workflow

1. **Open an issue first** if you're adding a new tool / endpoint
   wrapper. Spec/plan changes live in `docs/superpowers/` and benefit
   from upstream design discussion.
2. **Branch off `main`**: `git checkout -b feat/<name>` (or `fix/`, `docs/`).
3. **TDD per task** — read CLAUDE.md §3 for the exact discipline.
4. **Tests + tsc must pass** before pushing.
5. **Open a PR** — CI will run on every push to the PR.

## Commit messages

Conventional Commits. Existing log shows the patterns:

```
feat: <new functionality>
fix: <bug fix>
docs: <docs only>
test: <test-only changes>
chore: <misc>
ci: <CI/build config>
```

Subject ≤ 72 chars, body wrapped at ~72. Lead with the "why," not
the "what" (the diff already says what).

## What's in scope

- New `mem_*` agent tools wrapping claude-mem worker-backed endpoints
  (see CLAUDE.md "Out-of-scope" section for what's intentionally excluded)
- Bug fixes to existing tools, capture, inject, preflight
- Documentation improvements to spec/plan/CHANGELOG/README
- Drift-guard tests against new claude-mem versions
- Performance / startup-time improvements

## What's out of scope

- Tree-sitter `smart_*` codebase tools (different domain — pi has natives)
- `observation_*` / `memory_*` server-beta-only tools (different runtime)
- Knowledge corpus management (`build_corpus`, `prime_corpus`, etc.) —
  wait for explicit demand
- Anything requiring claude-mem source changes (maintainer declined pi
  support; we work strictly within rawAdapter fallback boundaries)

If you want to propose something out-of-scope, open an issue and
explain the use case. We may revisit.

## Releases

Maintainers: bump `package.json`, append to `CHANGELOG.md` under a new
version section, tag `v<version>`, push tags. `npm publish` is manual
(no auto-publish from CI).
