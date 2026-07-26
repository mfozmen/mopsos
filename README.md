# Mopsos

A single-user personal investment research tool that keeps score of its own predictions.

Mopsos was a seer of Anatolian origin. In the legend, Amphilochus consults two seers before
going to war: Mopsos predicts disaster, his rival Calchas promises victory. Amphilochus
listens to Calchas, and Mopsos turns out to be right. This project follows the story —
**several agents answer the same question, and reality decides which one was right.**

There are hundreds of tools that generate research reports. Almost none keep score of the
reports they generate. That second half is why this project exists.

> [!WARNING]
> This repository is public. **Personal financial data is never committed here** — no
> amounts, portfolio size, account details, home address or national ID. Anything of that
> kind belongs in the git-ignored `private/` directory. Research output stays generic and
> anonymous: "average price per m² for 3+1 flats in Menemen" is fine, "my 2.4M TRY savings"
> is not.

## Status

Phase 0 — repository and CI/CD infrastructure. No product code yet.

## Concepts

The entire vocabulary is built on five terms.

| Concept      | Meaning                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Seer**     | A research agent. Has its own prompt, its own disposition (cautious / optimistic / contrarian) and its own area.                                                   |
| **Verdict**  | A prediction produced by a seer. Question, direction, probability (0–1), due date, reasoning summary.                                                              |
| **Evidence** | The raw data a verdict rests on — price series, interest rates, listing data, news summaries — plus source links.                                                  |
| **Outcome**  | What actually happened, measured when the verdict comes due.                                                                                                       |
| **Score**    | Verdict × Outcome, as a Brier score: `(probability − outcome)²`. Near 0 is good, 0.25 is a coin flip. Aggregated per seer, per asset class and per horizon length. |

### A verdict must be measurable

"Gold looks good" is not a verdict. "As of 31 October 2026, gram gold will be above its
31 July 2026 close — 68%" is a verdict. The system refuses to store an unmeasurable
prediction.

That rule is enforced through a mandatory `resolution` block, filled in **at prediction
time**. A verdict without a complete block fails schema validation and is not stored.

```yaml
resolution:
  source: evds # evds | tuik | listing_snapshot | market_close
  series: 'TP.KTF17' # series code, or snapshot basket id
  reference_period: '2026-09' # the period being measured
  check_after: '2026-10-16' # derived from the publication calendar, known up front
  rule: 'value > 41.5' # one comparison, no room for interpretation
  print: first # the first published value, NOT the revised one
```

Three reasons, none negotiable:

1. **The source is fixed at prediction time**, so nobody can pick the flattering source
   after the result is out.
2. **`check_after` follows the publication calendar, not the calendar month.** TCMB's House
   Price Index is published roughly 15 days after the reference period ends, so a housing
   prediction written as "in 4 weeks" actually takes ~7 weeks to resolve.
3. **`print: first` is mandatory.** TCMB's weekly loan rate series is revised retroactively.
   The value read at resolution time is written into the repository and the live series is
   never consulted again — otherwise a verdict that "hit" today flips to "missed" three
   months later, and the track record becomes meaningless.

## How it works

1. A research run is triggered in Claude Code. Several seers — Claude Code subagents defined
   under `.claude/agents/` — research the same question in parallel.
2. Each run writes versioned verdict and evidence files under `research/` and opens a
   **pull request**. There is no database, queue or cron. Git history is what gives every
   prediction an immutable timestamp, and the honesty of the track record depends on it.
3. The user reviews and merges.
4. When a verdict comes due, its `resolution` block is executed: the value is fetched once,
   recorded as an outcome, and scored.
5. Over time the score answers the only question that matters — which seer is trustworthy,
   in which asset class, over which horizon.

The UI is a local web app that **reads** files from the repository. It never writes. No
auth, no multi-user, no deployment.

## Asset classes

All four are in a Turkey / TRY context. An asset class is a module: opening a new tab means
adding a folder and a definition file.

| Tab                | Status                           | Feedback speed      |
| ------------------ | -------------------------------- | ------------------- |
| Housing & Mortgage | Priority — first working feature | Slow (6–24 months)  |
| Precious Metals    | Scaffold, empty                  | Medium (1–6 months) |
| FX                 | Scaffold, empty                  | Fast (1–8 weeks)    |
| Equities           | Scaffold, empty                  | Fast (1–12 weeks)   |

Every asset class carries **at least two seers** with different priors. A single-seer asset
class counts as incomplete, because its track record means nothing.

Because housing feedback takes 6–24 months, housing seers must also produce **calibration
probes** — short predictions resolvable in 2–8 weeks — alongside every long-horizon verdict.
They are not investment decisions; they exist to measure how much the seer's long call can
be trusted.

## Getting started

Requires Node 22 (see `.nvmrc`).

```bash
git clone git@github.com:mfozmen/mopsos.git
cd mopsos
npm ci
cp .env.example .env   # fill in your own keys
```

| Command                 | What it does                        |
| ----------------------- | ----------------------------------- |
| `npm run lint`          | ESLint over the repository          |
| `npm run format`        | Prettier, write mode                |
| `npm run typecheck`     | `tsc --noEmit`                      |
| `npm test`              | Vitest                              |
| `npm run test:coverage` | Vitest with an lcov coverage report |

## Repository layout

```
src/            application code
.github/        workflows, issue and PR templates
scripts/        one-off repository administration scripts
private/        git-ignored; personal data never leaves this directory
```

## Documentation

- `CLAUDE.md` — the working context and rules for Claude Code sessions in this repository
- `CONTRIBUTING.md` — branch naming, commit format, PR expectations
- `SECURITY.md` — how to report a vulnerability
