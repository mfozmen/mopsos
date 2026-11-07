"""Decides what the Claude reviewer looks at: only what changed since its last review.

Called by .github/workflows/claude-review.yml before the review step. The
reviewer's finished tracking comment ends with a `REVIEWED-HEAD: <sha>` line,
so the PR thread is the reviewer's notebook. This finds the newest such line,
checks the sha is still an ancestor of the PR head (a rebase or force-push
makes it unreachable, and `git log A..B` would then list the whole branch),
and hands the review step:

  mode      incremental | full | unchanged
  base      the last reviewed sha (incremental/unchanged), else empty
  head      the PR head sha now under review
  commits   this PR's own new commits since base; merges and main's commits
            are left out so merging main into the branch does not flood it
  previous  the previous summary, so open findings are checked rather than
            re-derived
  diff      a file holding the incremental range's commits, for the reviewer
            to Read

Standard library only. Adapted from mfozmen/notelore.
Tests: .github/scripts/test_review_range.py (run by ci.yml).
"""

import json
import os
import re
import subprocess
import urllib.request
import uuid
from pathlib import Path

# A whole line, and only a whole line: prose that merely mentions the marker
# (a PR describing this very mechanism, for one) must not be read as a head.
REVIEWED_HEAD = re.compile(r"^REVIEWED-HEAD: ([0-9a-f]{7,40})$", re.MULTILINE)

# Only the review action's own finished comment counts: a human cannot post as
# the Actions bot, and a review still in progress has not opened with this yet.
REVIEWER_LOGIN = "github-actions[bot]"
FINISHED_SIGNATURE = "**Claude finished"


def last_review(comments):
    """(reviewed sha, body) of the newest finished review, else (None, None).

    `comments` is (author login, body) pairs, oldest first.
    """
    found = (None, None)
    for login, body in comments:
        body = body or ""
        if login != REVIEWER_LOGIN or not body.startswith(FINISHED_SIGNATURE):
            continue
        matches = REVIEWED_HEAD.findall(body)
        if matches:
            found = (matches[-1], body)
    return found


def choose_mode(base, head, is_ancestor):
    """full without a usable earlier review, unchanged when it already saw this head,
    incremental otherwise. `is_ancestor(base, head)` asks git."""
    if not base:
        return "full"
    if head.startswith(base) or base.startswith(head):
        return "unchanged"
    return "incremental" if is_ancestor(base, head) else "full"


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=False)


def is_ancestor(base, head):
    return git("merge-base", "--is-ancestor", base, head).returncode == 0


def own_commits(base, head, main_ref="origin/main"):
    """This PR's commits since `base`, oldest first, without merges or main's commits.

    A failing `git log` raises: an empty answer would read as "nothing new" and
    silently skip the review.
    """
    listed = git(
        "log", "--no-merges", "--reverse", "--format=%h %s", f"{base}..{head}", f"^{main_ref}"
    )
    if listed.returncode != 0:
        raise RuntimeError(f"git log failed: {listed.stderr.strip()}")
    return listed.stdout.strip()


def range_diff(commits):
    """Each listed commit as `git show` prints it, oldest first.

    Written to a file by this trusted step so the reviewer reads the range with
    Read instead of being allowed to run git, whose options can write files.
    """
    shown = []
    for line in commits.splitlines():
        sha = line.split(" ", 1)[0]
        result = git("show", "--no-ext-diff", sha)
        if result.returncode != 0:
            raise RuntimeError(f"git show {sha} failed: {result.stderr.strip()}")
        shown.append(result.stdout)
    return "\n".join(shown)


def github(path, token):
    request = urllib.request.Request(
        f"https://api.github.com/{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def fetch_comments(repo, number, token):
    """Every issue comment on the PR as (author login, body), following pagination."""
    comments, page = [], 1
    while True:
        batch = github(f"repos/{repo}/issues/{number}/comments?per_page=100&page={page}", token)
        if not batch:
            return comments
        comments.extend(
            ((comment.get("user") or {}).get("login", ""), comment.get("body") or "")
            for comment in batch
        )
        page += 1


def write_outputs(path, values, delimiter=None):
    # A random delimiter: commit subjects flow into `commits`, and a fixed one could
    # be closed early by a subject equal to it, letting the rest overwrite `mode`.
    delimiter = delimiter or f"RANGE_{uuid.uuid4().hex}"
    with Path(path).open("a", encoding="utf-8") as out:
        for key, value in values.items():
            if "\n" in value:
                out.write(f"{key}<<{delimiter}\n{value}\n{delimiter}\n")
            else:
                out.write(f"{key}={value}\n")


def main():
    repo, number = os.environ["GITHUB_REPOSITORY"], os.environ["PR_NUMBER"]
    token = os.environ["GH_TOKEN"]
    head = github(f"repos/{repo}/pulls/{number}", token)["head"]["sha"]
    base, previous = last_review(fetch_comments(repo, number, token))
    mode = choose_mode(base or "", head, is_ancestor)
    commits = own_commits(base, head) if mode == "incremental" else ""
    if mode == "incremental" and not commits:
        mode = "unchanged"  # only merges from main arrived: nothing of its own to review
    diff_path = Path(os.environ["REVIEW_DIFF"])
    # Inside the PR's checkout, so the reviewer's Read can reach it. Unlinked
    # first: a PR that commits a symlink at this path must not redirect the write.
    if os.path.lexists(diff_path):
        diff_path.unlink()
    diff_path.write_text(range_diff(commits) if mode == "incremental" else "", encoding="utf-8")
    write_outputs(
        os.environ["GITHUB_OUTPUT"],
        {
            "mode": mode,
            "base": (base or "") if mode != "full" else "",
            "head": head,
            "commits": commits,
            "previous": previous or "(none)",
            "diff": str(diff_path),
        },
    )
    print(f"review range: mode={mode} base={base or '-'} head={head}")


if __name__ == "__main__":
    main()
