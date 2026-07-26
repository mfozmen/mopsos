# private/

Everything in this directory is git-ignored. This README is the only file that is not.

**Personal data lives here and nowhere else.** Amounts, savings balance, income, bank and
brokerage details, home address, national ID, phone number, and notes about a specific
property you are actually considering.

The risk this guards against is not a remote attacker. It is publishing your own finances by
accident, in a public repository, where it cannot be unpublished — a commit that is deleted
five minutes later has already been cloned, cached and indexed.

## What goes in the repository instead

Research output stays generic and anonymous. The distinction is whether a sentence is about
the market or about you:

| In the repository                                      | In here                                |
| ------------------------------------------------------ | -------------------------------------- |
| "Median listing price per m² for 3+1 flats in Menemen" | "My 2.4M TRY savings"                  |
| "The average mortgage rate fell to 38.2%"              | "My mortgage offer was 39.1%"          |
| "Housing sales in İzmir were up 12% year on year"      | "The flat at <address> is listed at …" |

Verdicts, evidence and outcomes are all market statements. If a verdict cannot be written
without naming your position, it is the wrong verdict — the record is supposed to be about
what happens, not about what you own.

## Enforcement

`npm run scan:personal-data` runs over every tracked file on every pull request and fails CI
on a hit. It looks for national ids (checksum-validated, so ordinary eleven-digit numbers do
not trip it), Turkish IBANs, phone numbers, street addresses, and amounts phrased as yours
rather than as the market's.

GitHub's own secret scanning covers credentials. It will never catch "my 2.4M TRY", which is
why this exists separately.
