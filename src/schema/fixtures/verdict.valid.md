---
schema_version: 1
id: 2026-07-26-housing-tr-kfe-q3
seer: cautious
asset_class: housing
question: 'Will the TCMB house price index for Turkey in September 2026 be above 41.5?'
probability: 0.62
created_at: '2026-07-26'
due_at: '2026-09-30'
resolution:
  source: evds
  series: TP.KTF17
  reference_period: '2026-09'
  check_after: '2026-10-16'
  rule: 'value > 41.5'
  print: first
---

The index has risen in each of the last three quarters while the weekly mortgage rate
has fallen, which historically precedes continued nominal growth. The main risk to this
call is a rate reversal, which would not show up in the September print but would in the
December one.

Note the seven-week gap between `due_at` and `check_after`: the September figure is not
published until mid-October.
