# Contributing

This is a single-user personal project, but it is public and it follows public-project
discipline. The rules below are enforced by CI, not by good intentions.

## Ground rules

- **Test first.** No production code without a failing test. See below.
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

## Test-driven development

Red, green, refactor. In that order, every time.

1. Write one test for one behaviour, named after the behaviour.
2. **Run it and watch it fail** — and check it failed for the reason you expected, not
   because of a typo or a missing import.
3. Write the minimum code that makes it pass.
4. Run again. Green, and everything else still green.
5. Refactor if it helps. Stay green. Add no behaviour.

The step people skip is the second one, and it is the one that carries the value. A test
written after the code passes on the first run, which tells you nothing: you never saw it
catch anything, and it is shaped by the implementation instead of by the requirement.

That gap matters here in particular. The rules this repository enforces — a verdict must
be measurable, an outcome is never edited — fail _silently_ when they fail. A validator
that accepts everything and a validator that works look exactly the same from the outside
until a prediction nobody can settle is already in the record.

If you wrote the code first, delete it and start from the test. Not "keep it as a
reference" — you will adapt it, and that is testing afterwards wearing a disguise.

Type-only declarations and configuration are exempt, having no behaviour that can fail.

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
