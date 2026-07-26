#!/usr/bin/env bash
# Protects `main`. Idempotent — safe to re-run, and it must be re-run after a new
# required check appears (SonarCloud only registers its context after it has run
# at least once with a token).
#
# Usage: ./scripts/setup-branch-protection.sh
set -euo pipefail

REPO="${REPO:-mfozmen/mopsos}"

# Required status checks. A context that has never reported cannot be required —
# GitHub accepts it, but the branch then blocks forever waiting for a check that
# nobody runs. Add "SonarCloud Code Analysis" here once SONAR_TOKEN is set.
CONTEXTS='["ci", "CodeQL"]'

echo "Protecting main on $REPO"

gh api -X PUT "repos/$REPO/branches/main/protection" --input - --silent <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": $CONTEXTS
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "block_creations": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
echo "  no direct pushes, PR required, checks required: $CONTEXTS"
echo "  strict (branch must be up to date), linear history, conversations resolved"

# No required approving review: this is a single-maintainer repository and nobody
# can approve their own pull request. Requiring one would block every merge.
#
# enforce_admins IS on, though. With one maintainer, who is also the admin,
# leaving it off means the rule applies to nobody — a direct push to main just
# succeeds with "Bypassed rule violations". This project's central claim is that
# every prediction has an immutable timestamp in git history, and that claim is
# only as strong as the branch it lives on. The escape hatch when a required
# check is itself broken is to run this script with enforce_admins flipped, land
# the fix, and run it again — deliberate and visible, rather than always-on.

# Squash only. Every PR becomes exactly one commit on main, which is what
# semantic-release reads to decide the next version.
gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  --silent
echo "  merge strategy: squash only"

echo "Done."
