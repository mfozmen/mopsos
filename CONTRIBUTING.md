# Contributing

This is a single-user personal project, but it is public and it follows public-project
discipline. The rules below are enforced by CI, not by good intentions.

## Ground rules

- **Nothing lands on `main` without a pull request.** Direct pushes are blocked.
- **One topic per pull request.** A PR that touches CI and product code at the same time
  gets split.
- **CI must be green.** Lint, typecheck, tests, coverage, SonarCloud Quality Gate and CodeQL
  are all required checks.
- **Never commit personal financial data.** See `SECURITY.md`.

## Branch names

| Prefix   | Use                                         |
| -------- | ------------------------------------------- |
| `feat/`  | New capability                              |
| `fix/`   | Bug fix                                     |
| `chore/` | Repository plumbing, dependencies, docs     |
| `ci/`    | Workflows, pipelines, repository automation |

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/). Enforced by commitlint through
a husky `commit-msg` hook, so a malformed message fails locally before it can be pushed.

```
feat(housing): add EVDS series client
fix(score): treat a missing outcome as unresolved rather than zero
chore: bump vitest to 3.2
```

Releases are derived from these messages by semantic-release: `feat` bumps the minor
version, `fix` the patch, and `BREAKING CHANGE:` in the body bumps the major. A wrong prefix
produces a wrong version number, so pick it deliberately.

## Local checks

```bash
npm run lint
npm run typecheck
npm run test:coverage
```

`pre-commit` runs lint-staged over the files you touched; the full suite still runs in CI.

## Working on predictions

Two rules override convenience whenever they conflict with it:

1. **A verdict must be measurable.** No `resolution` block, no merge.
2. **A recorded outcome is never edited.** If a value turns out to be wrong, it is corrected
   by a new record that references the old one, never by rewriting history. The track record
   is only worth something if it cannot be quietly improved after the fact.
