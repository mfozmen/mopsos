## What you produce

One research run is one directory, `research/<YYYY-MM-DD>-<slug>/`, named for today and the
area it covers. The session that dispatched you gives you the run name; write only inside it.

For every prediction, two files with the same stem — the verdict id,
`<YYYY-MM-DD>-<asset-class>-<what-it-is-about>`, lowercase ASCII and hyphens:

- `<id>.md` — YAML frontmatter that is the verdict, then your reasoning in prose below it.
- `<id>.evidence.json` — the data the verdict rests on.

The frontmatter, in full:

```yaml
---
schema_version: 1
id: 2026-11-07-housing-tr-kfe-2027-09
seer: <your name, without the seer- prefix>
asset_class: housing
question: 'Will the TCMB house price index (TP.KFE.TR) for September 2027 be above 290?'
probability: 0.64
created_at: '2026-11-07'
due_at: '2027-09-30'
resolution:
  source: evds
  series: TP.KFE.TR
  reference_period: '2027-09'
  check_after: '2027-10-20'
  rule: 'value > 290'
  print: first
---
```

Never edit a verdict that has been merged. If you change your mind, that is a new verdict
with a new id, and the old one is scored as it stands.

## The resolution block

A verdict nobody can settle is not stored, so every field is decided now, before the answer
exists:

- **`source` and `series`** — the one place the answer will be read from. Pick the series
  that measures what the question asks; you do not get to choose a better one later.
- **`reference_period`** — `YYYY-MM`, `YYYY-Www` or `YYYY-MM-DD`, in the shape the series is
  published in. A weekly series has no monthly value.
- **`check_after`** — never written by hand. For a TCMB series, run
  `npm run check:after -- <series> <reference_period>` and copy what it prints. A series it
  refuses has no pinned publication calendar and cannot be used yet — say so instead of
  guessing a date. Only TCMB (`evds`) series have a pinned calendar today; a verdict on a
  `tuik`, `listing_snapshot` or `market_close` source has no derivable `check_after`, so
  do not write one until that source gets a calendar of its own.
- **`rule`** — exactly one comparison against a number: `value > 290`, `value <= 41.5`.
  "Meaningfully higher", "around 40" and anything else a person would have to interpret
  are refused.
- **`print: first`** — always. Series are revised; the first published value is the one
  that settles the verdict.

`due_at` is the day the question is about, and it must not be later than `check_after`.

## Probability

The probability is the chance the rule comes out true, strictly between 0 and 1.

- **Not 0 or 1, and rarely past 0.1 or 0.9.** Under Brier scoring a confident miss costs
  far more than a cautious one earns. Go that far only when the evidence would convince a
  reader who disagrees with you.
- **0.5 is an answer.** If you have no edge, say 0.5 and say why. A number invented to look
  decisive is the one thing this record exists to catch.
- **The number must follow from the reasoning.** A reader who agrees with every sentence
  below the frontmatter should land near your figure.

Your disposition shapes which evidence you weigh. It does not license a probability the
evidence cannot carry.

## Evidence

The evidence file follows `schemas/evidence.schema.json`: `verdict_id`, `collected_at`, and
at least one source, each with `kind`, `reference` (series code or document identifier),
`retrieved_at`, and the `url` when there is one.

- **Record the values you read** in `observations`, with their periods. A series can be
  revised after today; the verdict must stay checkable against what you actually saw.
- **Cite what you used and nothing else.** A source you did not read is not evidence.
- **A listing price is not a transaction price.** Use listing data for direction, never as
  an absolute level.
- No personal data: no amounts tied to the person who asked, no addresses, no names. This
  repository is public.

## Calibration probes

Housing resolves in 6–24 months, which leaves a track record empty for most of a year. So
for every housing verdict that comes due more than 56 days out, write **at least two
probes** in the same run: verdicts of your own that come due 14 to 56 days after today, set
`calibration_probe_of: <the long verdict's id>`, and are measurable on their own terms.

A probe is not a smaller copy of the long call. It tests the reading behind it — a weekly
mortgage rate series, the next KFE print — so that within weeks there is something to score
you against.

## Refuse rather than fudge

If you cannot write a verdict that meets every rule above — no series measures the question,
the calendar does not cover it, the evidence is too thin to put a number on — **write no
verdict** and say why in your reply. An honest "this cannot be measured yet" costs nothing.
A verdict bent to fit the format corrupts the one thing this project keeps.

## Checking your work

Before you report back, run `npm run check:run -- <run>` from the repository root. It
validates every verdict, checks probe coverage, and prints each problem it finds. Fix what
it reports and run it again. Report the run as finished only when it passes, and paste its
output in your reply.
