# CLAUDE.md

Working context for Claude Code sessions in this repository.

## Language

The user writes in Turkish and expects replies in Turkish. **Everything produced is in
English**: code, commit messages, PR titles and bodies, issues, comments, documentation,
file and directory names, and this repository's own docs. Turkish domain data — district
names, TCMB/TÜİK series codes, TRY amounts — stays in its original form. That is data, not
a language choice.

**The application UI is the one exception: it is in Turkish.** There is exactly one user,
they read Turkish, and every proper noun on screen is Turkish already — district names,
TCMB series, TRY amounts. An English shell around Turkish content would mean translating in
your head on the one surface that is supposed to be effortless to read. This does not leak
into the codebase: identifiers, comments, tests and docs stay English, and user-facing
strings live behind a single module rather than being scattered inline.

## 1. What the product is

Mopsos is a single-user personal investment research tool with a **prediction track record**.
The user lives in Turkey and is deciding where to put TRY-denominated savings.

**The user's primary goal is buying a home.** The other asset classes exist in service of
that goal: where to park money and for how long while the down payment grows, and when to
convert it into a house.

Two halves:

1. **Research** — AI agents research a given asset class and produce a reasoned prediction.
2. **Track record** — when a prediction comes due it is compared against what actually
   happened and scored. Over time this answers: which agent is trustworthy, in which asset
   class, over which horizon.

**The second half is why this project exists.** Hundreds of tools generate research reports;
almost none keep score. **Whenever a design decision is ambiguous, pick the option that
protects the scoring side.**

The name: Mopsos was a seer of Anatolian origin. Amphilochus consulted two seers before war —
Mopsos predicted disaster, Calchas promised victory. Amphilochus listened to Calchas, and
Mopsos turned out to be right. The architecture follows the story: several agents answer the
same question, and reality decides which one was right.

## 2. Core concepts

| Concept    | Meaning                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Seer`     | A research agent. Own prompt, own disposition (cautious / optimistic / contrarian), own area.                                           |
| `Verdict`  | A prediction produced by a seer. Question, direction, probability (0–1), due date, reasoning summary.                                   |
| `Evidence` | The raw collected data a verdict rests on, plus source links.                                                                           |
| `Outcome`  | What actually happened, measured when the verdict comes due.                                                                            |
| `Score`    | Verdict × Outcome. Brier: `(probability − outcome)²`. Near 0 good, 0.25 a coin flip. Aggregated per seer, per asset class, per horizon. |

**Hard rule:** a verdict cannot contain an unmeasurable sentence. "Gold looks good" is not a
verdict. "As of 31 October 2026, gram gold will be above its 31 July 2026 close — 68%" is.
The system must refuse to store an unmeasurable prediction.

### Mandatory `resolution` block

Every verdict carries this, filled in **at prediction time**. Missing or incomplete means
schema validation failure and no storage.

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

1. **The source is fixed at prediction time.** Otherwise, once the result is out, there is
   room to pick whichever source makes the seer look right.
2. **`check_after` follows the publication calendar, not the calendar month.** TCMB's House
   Price Index (KFE) is published roughly 15 days after the reference period ends, so a
   housing prediction written as "in 4 weeks" actually takes ~7 weeks to resolve. TCMB
   announces its publication calendar on the first business day of the year — pin it into
   the repository and read `check_after` from it.
3. **`print: first` is mandatory.** TCMB's weekly loan rate series is revised retroactively
   and the KFE calculation method has been revised. Write the value read at resolution time
   into the repository and never look at the live series again. Otherwise a verdict that
   "hit" today flips to "missed" three months later and the track record is meaningless.

## 3. Scope — asset classes

Four tabs, Turkey / TRY context. **An asset class is a module that can be added later** —
opening a new tab means adding a folder and a definition file. Everything shared (verdict
format, scoring, UI shell) lives in the core; everything specific lives in its own module.

| Tab                | Status                           | Feedback speed      |
| ------------------ | -------------------------------- | ------------------- |
| Housing & Mortgage | Priority — first working feature | Slow (6–24 months)  |
| Precious Metals    | Scaffold, empty                  | Medium (1–6 months) |
| FX                 | Scaffold, empty                  | Fast (1–8 weeks)    |
| Equities           | Scaffold, empty                  | Fast (1–12 weeks)   |

"Scaffold, empty" means the tab exists, the module folder and definition file exist, there
are no seers inside, and it says "not configured yet". No research logic for these tabs.

### Housing module data flow

The user narrows top-down: **province → district → neighbourhood.**

| Level                       | Source                                                             | Reliability                                   |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| Country / region / province | TCMB KFE, YKKE, TÜİK housing sales, CPI, TCMB weekly mortgage rate | Official, calendar-published, auto-resolvable |
| District                    | Partly official (sales counts), partly listing data                | Mixed                                         |
| Neighbourhood               | Listing data only                                                  | Only as good as what we collect ourselves     |

**Listing snapshot store** — the only way to reach neighbourhood level. Listing sites keep no
historical archive; if collection does not start today, in six months there is nowhere on
earth to answer "what was it four months ago".

- Define a **fixed basket**: district + neighbourhood + room count + size band, all frozen.
  Defined once, never changed. The reason is **composition bias** — a free-floating median
  can move 5% with no price change at all, purely because the mix of active listings changed.
  What you measured then is the listing pool, not the price.
- Snapshots are written to the repository with a timestamp and are **never corrected
  retroactively.**
- The snapshot series can be used for scoring via `resolution.source: listing_snapshot`. It
  is never revised, but it only exists from the day collection started.
- A listing price is not a transaction price. The series measures **direction**, never an
  absolute value.

**The collection method is deliberately left open.** Listing sites prohibit automated access
and actively block it; a design that depends on it collapses in the first month. The
architecture is **source-agnostic**: a single `SnapshotSource` interface whose first
implementation is a manually/semi-manually fed CSV import. **Do not pick a source or write a
scraper on your own initiative.**

### At least two seers per asset class

Different prompts, different priors. A single-seer asset class counts as incomplete, because
its track record means nothing.

### Housing: short-horizon calibration probes are mandatory

Housing feedback takes 6–24 months. Long-horizon-only verdicts leave the track record empty
for months. So housing seers produce, alongside every long-horizon verdict, **at least two
probes resolvable in 2–8 weeks**. These are not investment decisions; they exist to calibrate
the seer. The schema supports this as a first-class concept: a verdict can be the
`calibration_probe` of another verdict.

## 4. Architecture decisions (settled — do not relitigate)

- **The agent runtime is Claude Code itself.** No separate orchestration layer. Each seer is
  a Claude Code subagent, and the user triggers a research run in which the subagents run in
  parallel. They live in `plugin/agents/`, packaged as an installable plugin alongside the
  `/mopsos` command; `.claude/settings.json` enables it for this repository so a clone works
  without setup. They were under `.claude/agents/` until the plugin existed, and had to move
  rather than be copied — a project's own `.claude/agents/` overrides a plugin agent of the
  same name, so copies would have meant the plugin's versions never running while two files
  drifted apart.
- **Output is a file written into the repository.** Each run produces versioned JSON/Markdown
  under `research/` (verdict + evidence). No database, no queue, no cron, no webhooks. A run
  is opened as a **pull request**; the user reviews and merges. That gives every prediction
  an immutable timestamp in git history, which the honesty of the track record depends on.
- **The UI is a local web app that reads files from the repository.** It never writes. No
  auth, no multi-user, no deployment. `npm run dev`.
- **Simplicity constraint:** each tab shows **one sentence and one number** at the top (e.g.
  "Best use over 12 months: deposit — 64% confidence"). Detail, reasoning and sources sit one
  click behind. Before adding a second chart to the dashboard, ask whether the first one is
  actually being read.

## 5. Public repository safety rule

The repository is public. **The user's personal financial data is never committed**: amounts,
portfolio size, account details, real address, national ID. `private/` is git-ignored for
those and the README says so explicitly. Research output stays generic and anonymous
("average price per m² for 3+1 flats in Menemen" yes, "my 2.4M TRY savings" no). API keys <!-- scan-ignore: example -->
live in `.env`, with `.env.example` committed.

## Working rules

- **Test-driven development, always.** No production code without a failing test
  first — new features, bug fixes, behaviour changes alike. Write one test for one
  behaviour, run it, watch it fail for the right reason, then write the minimum code
  that passes, then refactor while it stays green.

  A test written after the code passes immediately, and passing immediately proves
  nothing: it may test the implementation rather than the requirement, and it never
  demonstrated that it can catch anything. This matters more here than in most
  projects, because the rules being enforced — a verdict must be measurable, an
  outcome is never edited — are exactly the kind that fail silently. A validator
  that quietly accepts everything looks identical to one that works.

  If production code was written first, delete it and start over from the test. Do
  not keep it as reference and do not adapt it while writing the test; that is
  testing afterwards with extra steps. Type-only declarations and configuration are
  the exception, having no behaviour to fail.

- **Before each PR, give a short plan and get approval, then write.**
- **One topic per PR.** Do not merge separate concerns into one PR.
- Branch names: `feat/`, `fix/`, `chore/`, `ci/`.
- Conventional Commits, enforced by commitlint. `feat` → minor, `fix` → patch,
  `BREAKING CHANGE:` → major, via semantic-release on merge to `main`.
- `main` is protected: no direct pushes, PR required, CI + SonarCloud + CodeQL required.
- **If something is unclear, do not guess — ask.**
- A recorded outcome is never edited. Corrections are new records referencing the old one.

## Current phase

Phase 0 (repository and CI/CD infrastructure) — see the open issues for what comes next.
Phase 1 is the core: JSON Schemas, the Brier function, the asset class module registry, and
the listing snapshot job. The snapshot job starts before any seer exists, because it is the
one kind of data that cannot be collected retroactively — every week of delay is a permanent
loss.
