# Contributing to pi-mem

Thanks for considering a contribution. Before opening a PR, read
[`CLAUDE.md`](./CLAUDE.md) — it documents the project's feature
development workflow (grounding → spec/plan → TDD → review).

## Setup

```bash
# Node 22 from .nvmrc
nvm use   # or: fnm use, asdf use, mise use

npm install            # auto-installs the pre-commit hook via `prepare`
npm test               # full unit + integration suite
npm run typecheck      # tsc --noEmit
npm run check          # biome format/lint + prettier (markdown), read-only
npm run check:fix      # auto-fix format + safe lint issues
```

Integration tests under `tests/integration/` auto-skip via
`describe.skipIf(!haveClaudeMem)` when claude-mem isn't installed.
To exercise them: `npx claude-mem install` first.

### Pre-commit hook

`simple-git-hooks` installs a pre-commit hook that runs:

```
npm run check && npm run typecheck
```

Read-only (no auto-fix on commit). Fail-fast (~2–3s). If it blocks
your commit, run `npm run check:fix` to auto-format, re-stage,
re-commit.

**Partial-stage trap:** the hook runs `biome check` against the entire
working tree, not just staged files. If you have a format-dirty
unstaged file alongside your staged change, the hook will fail even
though that file isn't part of your commit. Two workarounds:

- Run `npm run check:fix` to fix everything first (cleanest), or
- Temporarily skip the hook: `SKIP_SIMPLE_GIT_HOOKS=1 git commit ...`
  (use sparingly — CI runs the same checks)

### Git blame archaeology

Project includes `.git-blame-ignore-revs` to skip the one-time format
normalization commit. GitHub blame auto-respects it. For local CLI:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

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
- Anything requiring claude-mem source changes — maintainer deprioritized pi
  support in the April 2026 backlog cleanup (PR #1786 closed, issue #1963 +
  discussion #1970 stalled); we work strictly within `rawAdapter` fallback
  boundaries

If you want to propose something out-of-scope, open an issue and
explain the use case. We may revisit.

## Releases

Maintainers: bump `package.json`, append to `CHANGELOG.md` under a new
version section, tag `v<version>`, push tags. `npm publish` is manual
(no auto-publish from CI).
