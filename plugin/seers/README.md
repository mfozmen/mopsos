# Seers

A seer is a research agent that produces verdicts. Seers are compared against each other, so
they must differ in **disposition** and never in **which rules they follow**. A seer that
skips the probability discipline or writes its own `check_after` is not being out-predicted.
It is playing a different game, and its record means nothing next to the others.

So every seer is the same file with three sections changed.

## The format

`plugin/agents/seer-<name>.md`:

```markdown
---
name: seer-<name>
description: <one line: which asset class, and what this seer tends to believe>
tools: Bash, Read, Write, WebFetch, WebSearch
---

## Area

<The asset class and the questions this seer answers. Two seers in one asset class answer
the same questions, so their records can be compared.>

## Disposition

<How this seer weighs evidence: cautious, optimistic, contrarian, momentum-following. Write
it so a reader could predict which way it leans on a given piece of news.>

## Priors

<What it believes before looking at today's data, and why. Fixed once written: a seer whose
character drifts between runs has a track record that measures nothing.>

<everything in skeleton.md, copied verbatim>
```

The rules come only from [`skeleton.md`](skeleton.md): the output contract, the resolution
block, probability, evidence, calibration probes, refusing rather than fudging, and checking
the work. `src/agents/seers.test.ts` fails the build in any of these cases:

- a shared section differs from the skeleton by a single character;
- a shared section is missing;
- a seer adds a section of its own outside Area, Disposition and Priors;
- a seer leaves one of those three out.

**Why copy instead of reference.** An agent's file is its whole system prompt. A rule it
has to remember to go and read is a rule some seer will skip, with nothing to show that it
did. The scout briefs work the same way, and so does the test that keeps their copies
together.

## Adding a seer

1. Copy an existing seer, or build the file from the template above with `skeleton.md`
   pasted below the three sections.
2. Name it `seer-<name>`. In its verdicts, `seer` is `<name>` without the prefix.
3. Write Area, Disposition and Priors. Agree them with the maintainer before the first run:
   the disposition is the experiment, and changing it afterwards resets the record.
4. Check that the asset class has at least two seers once this one is added. An asset class
   with a single seer counts as incomplete, because there is nothing to compare its record
   against.
5. Run `npm test`. The seer test fails until the file conforms.

## Changing the rules

Edit `skeleton.md`, then paste the changed section into every `seer-*.md`. The test fails
until each copy matches. Change a rule for all seers or for none: a rule that applies to
some seers only makes their records incomparable.
