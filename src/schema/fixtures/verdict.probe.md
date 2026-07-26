---
schema_version: 1
id: 2026-07-26-housing-mortgage-rate-6w
seer: cautious
asset_class: housing
question: 'Will the average TCMB weekly mortgage rate be lower in six weeks than it is today?'
probability: 0.45
created_at: '2026-07-26'
due_at: '2026-09-06'
calibration_probe_of: 2026-07-26-housing-tr-kfe-q3
resolution:
  source: evds
  series: TP.KTFTUK
  reference_period: '2026-W36'
  check_after: '2026-09-11'
  rule: 'value < 38.2'
  print: first
---

Not an investment call on its own. It exists to produce a measurable result within six
weeks, so that the seer's confidence on the September index call can be weighed against
something rather than taken on trust.
