# Security Policy

## Reporting a vulnerability

Please report security issues through GitHub's
[private vulnerability reporting](https://github.com/mfozmen/mopsos/security/advisories/new)
rather than opening a public issue. Expect an initial response within a week.

## What this repository must never contain

This is a personal investment research tool in a **public** repository. The threat that
matters most here is not a remote attacker — it is accidental self-disclosure.

Never commit:

- Amounts, portfolio size, savings balance, income
- Bank or brokerage account details
- Home address, national ID (TCKN), phone number
- Anything that identifies which specific property is being considered
- API keys, tokens, credentials of any kind

Personal material belongs in `private/`, which is git-ignored. Secrets belong in `.env`,
which is also git-ignored; `.env.example` documents the keys without their values.

Research output must stay generic and anonymous. "Average price per m² for 3+1 flats in
Menemen" is publishable. "My 2.4M TRY savings" is not. <!-- scan-ignore: example -->

## Enforcement

- GitHub secret scanning with **push protection** rejects commits containing recognised
  credentials before they reach the repository.
- CodeQL runs on every pull request and weekly.
- Dependabot opens pull requests for vulnerable dependencies.
- Automated review on every pull request specifically looks for personal data leakage.

If a secret does get committed, treat it as compromised: rotate it first, then clean up.
