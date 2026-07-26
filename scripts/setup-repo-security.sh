#!/usr/bin/env bash
# Applies this repository's security settings. Idempotent — safe to re-run.
#
# These are GitHub-side settings, not files, so they live here as a script rather
# than as configuration: otherwise nobody can tell what state the repository is
# supposed to be in. Everything below is free on public repositories.
#
# Usage: ./scripts/setup-repo-security.sh
set -euo pipefail

REPO="${REPO:-mfozmen/mopsos}"

echo "Applying security settings to $REPO"

# Secret scanning, and — the one that actually protects you — push protection,
# which rejects a commit containing a recognised credential before it lands.
# On a public repository a leaked key is scraped within seconds; deleting it
# afterwards does not un-leak it.
#
# Note: secret_scanning_non_provider_patterns and secret_scanning_validity_checks
# are NOT set here. The API accepts them and returns success, then leaves them
# disabled — they need Secret Protection, which this repository does not have.
# Setting them would make this script report something untrue.
gh api -X PATCH "repos/$REPO" \
  -F 'security_and_analysis[secret_scanning][status]=enabled' \
  -F 'security_and_analysis[secret_scanning_push_protection][status]=enabled' \
  --silent

# Dependabot alerts and automatic security-fix PRs.
gh api -X PUT "repos/$REPO/vulnerability-alerts" --silent
gh api -X PUT "repos/$REPO/automated-security-fixes" --silent
echo "  dependabot alerts + security fixes: enabled"

# Let people report a vulnerability privately instead of opening a public issue.
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" --silent
echo "  private vulnerability reporting: enabled"

# Repository-wide default for the Actions token: read-only, and no permission to
# approve pull requests. Each workflow widens this explicitly where it must.
gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false \
  --silent
echo "  default workflow token: read-only"

# Unused surfaces off. The wiki would be a second, unversioned place for project
# state to live; this project keeps its state in the repository.
gh api -X PATCH "repos/$REPO" \
  -F has_wiki=false \
  -F delete_branch_on_merge=true \
  --silent
echo "  wiki: disabled, branch cleanup on merge: enabled"

# Report what GitHub actually stored, not what was sent. Several of these
# settings accept a value and silently ignore it depending on the plan; a script
# that prints its own intentions is worse than no script, because it reads as
# proof that the setting is on.
echo
echo "Actual state:"
gh api "repos/$REPO" -q '.security_and_analysis | to_entries[] | "  \(.key): \(.value.status)"'
gh api "repos/$REPO/actions/permissions/workflow" -q '"  default_workflow_permissions: \(.default_workflow_permissions)"'
