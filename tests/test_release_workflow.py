"""Release workflow — the thin caller for the org's reusable plugin-release.

`.github/workflows/release.yml` delegates to protoLabsAI/release-tools' reusable
`plugin-release.yml`, which does the tag + GitHub Release + Discord ping. The
caller's job is only to fire at the right moment and stay fenced to this repo so
forks don't publish. These tests pin that contract without needing a live run.
"""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
RELEASE = ROOT / ".github" / "workflows" / "release.yml"


def _load() -> dict:
    return yaml.safe_load(RELEASE.read_text(encoding="utf-8"))


def _triggers(wf: dict) -> dict:
    # PyYAML parses a bare `on:` key as the boolean True (YAML 1.1 quirk).
    return wf.get("on", wf.get(True))


def test_release_workflow_exists():
    assert RELEASE.exists(), "release.yml missing — no release automation"


def test_calls_reusable_plugin_release_at_pinned_ref():
    job = _load()["jobs"]["release"]
    assert job["uses"] == "protoLabsAI/release-tools/.github/workflows/plugin-release.yml@v2"
    # `secrets: inherit` is what lets the reusable workflow reach the Discord webhook.
    assert job["secrets"] == "inherit"


def test_triggers_on_main_push_and_manual_dispatch():
    triggers = _triggers(_load())
    assert "main" in triggers["push"]["branches"]
    assert "workflow_dispatch" in triggers  # manual dispatch path


def test_guarded_to_this_repo_and_release_commits():
    guard = _load()["jobs"]["release"]["if"]
    # fork fence — an upstream fork must never cut releases
    assert "github.repository == 'protoLabsAI/promptlab-plugin'" in guard
    # the two ways a release may legitimately start
    assert "github.event_name == 'workflow_dispatch'" in guard
    assert "chore: release v" in guard
