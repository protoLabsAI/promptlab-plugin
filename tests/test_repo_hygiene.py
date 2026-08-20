"""Repo hygiene — things `git add -A` can smuggle in that review shouldn't have to catch.

The concrete lesson: a `frontend/node_modules` symlink (mode 120000, absolute local
target) once got committed because gitignore's `node_modules/` (trailing slash =
directories only) doesn't match symlink blobs. On any other clone that's a dangling
link. These tests keep the tree free of tracked symlinks and keep the ignore
pattern slash-less so it can't recur.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _git_ls_files_staged() -> list[str]:
    """`git ls-files -s` lines, or skip when not running from a git checkout."""
    try:
        proc = subprocess.run(
            ["git", "ls-files", "-s"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        pytest.skip("git unavailable")
    if proc.returncode != 0:
        pytest.skip("not a git checkout")
    return proc.stdout.splitlines()


def test_no_tracked_symlinks():
    # mode 120000 = symlink blob; a symlink to an absolute local path dangles everywhere else
    links = [line.split("\t", 1)[-1] for line in _git_ls_files_staged() if line.startswith("120000 ")]
    assert not links, f"symlinks committed to git: {links}"


def test_node_modules_never_tracked():
    tracked = [line.split("\t", 1)[-1] for line in _git_ls_files_staged()]
    offenders = [p for p in tracked if "node_modules" in p.split("/")]
    assert not offenders, f"node_modules tracked in git: {offenders}"


def test_gitignore_node_modules_pattern_covers_symlinks():
    # `node_modules/` matches only directories — a symlinked node_modules slips
    # through and `git add -A` stages it. The pattern must stay slash-less.
    patterns = [
        line.strip()
        for line in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    assert "node_modules" in patterns, ".gitignore must contain slash-less `node_modules`"
    assert "node_modules/" not in patterns
