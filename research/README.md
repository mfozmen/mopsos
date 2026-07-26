# research/

Every prediction this project has ever made, and what happened to it.

Files here are **append-only**. A verdict is never edited after the pull request that
introduced it is merged, and an outcome is never edited at all. If something turns out to
be wrong, it is corrected by a new record that points at the old one — the old one stays.

The reason is narrow and non-negotiable: the track record is only worth something if it
cannot be improved after the fact. Git history is what makes that claim checkable, and a
file that gets rewritten destroys the claim without leaving a trace.

## Layout

```
research/
  2026-07-26-menemen/                          one research run, one pull request
    2026-07-26-housing-tr-kfe-q3.md            a verdict: frontmatter + reasoning
    2026-07-26-housing-tr-kfe-q3.evidence.json the data it rests on
    2026-07-26-housing-rate-6w.md              a calibration probe of the above
    2026-07-26-housing-rate-6w.evidence.json
  outcomes/
    2026-10-16-outcome-housing-tr-kfe-q3.md    what actually happened
```

**One file per verdict.** `git log research/<run>/<id>.md` is then that verdict's entire
history, and an outcome references exactly one file.

**Run directories are named `YYYY-MM-DD-<slug>`** after the day the run happened and the
area it covered. A run is one pull request.

**Outcomes live outside the run directory**, because they are written months later. Keeping
them out means a merged run directory never changes again.

## Verdict ids

```
2026-07-26-housing-tr-kfe-q3
└── created  └── what it is about
```

The id is the filename stem, and `loadVerdicts` refuses a file whose name disagrees with the
id inside it — otherwise the two drift and references start pointing at nothing. Ids are
never reused and never renamed.

## Reading it

`loadVerdicts(root)` in `src/research/load.ts` reads the whole tree. It **refuses** a
malformed or unmeasurable verdict rather than skipping it: a verdict that quietly vanishes
from the record is indistinguishable from one that was never made.
