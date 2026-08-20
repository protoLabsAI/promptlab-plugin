"""Manifest coherence — the data the host reads without importing us."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = yaml.safe_load((ROOT / "protoagent.plugin.yaml").read_text(encoding="utf-8"))


def test_version_lockstep_with_pyproject():
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    version = re.search(r'^version = "([^"]+)"', pyproject, re.M).group(1)
    assert MANIFEST["version"] == version


def test_ships_disabled_and_typed():
    assert MANIFEST["id"] == "promptlab"
    assert MANIFEST["enabled"] is False
    assert isinstance(MANIFEST["config_section"], str)  # a list here fails the host's reserved-section check


def test_view_path_is_a_route_register_serves(registry):
    import promptlab

    promptlab.register(registry)
    from fastapi.testclient import TestClient

    client = TestClient(registry.app)
    for view in MANIFEST["views"]:
        assert client.get(view["path"]).status_code == 200
        assert not view["path"].startswith("/api/")


def test_public_paths_cover_the_asset_dir():
    # ES-module imports can't carry a bearer (the notes vendor lesson) — the Vite
    # bundle must be reachable unauthenticated or the view 401s into a dead box.
    assert "/plugins/promptlab/assets/" in MANIFEST["public_paths"]


def test_static_build_is_committed():
    index = ROOT / "static" / "index.html"
    assert index.exists(), "static/index.html missing — run `npm run build` in frontend/"
    html = index.read_text(encoding="utf-8")
    # four-rules markers: slug-aware base split + DS kit CSS off that base
    assert 'split("/plugins/")[0]' in html
    assert "/_ds/plugin-kit.css" in html
    assert "http://localhost" not in html
    # Vite must emit RELATIVE asset urls (base:"./") — a root-absolute /assets/...
    # resolves against the wrong origin path under the /agents/<slug>/ fleet proxy
    assert 'href="./assets/' in html or 'src="./assets/' in html
    assert 'src="/assets/' not in html

    # the kit JS import + the gated data prefix live in the bundle (kit.ts / api.ts)
    bundle = "".join(p.read_text(encoding="utf-8") for p in (ROOT / "static" / "assets").glob("*.js"))
    assert "/_ds/plugin-kit.js" in bundle
    assert "/api/plugins/promptlab" in bundle
    assert "http://localhost" not in bundle


def test_mobile_prompt_switcher_in_bundle():
    # Below @4xl the header's prompt name IS the drawer toggle (App.tsx): a
    # ChevronDown affordance titled "Switch prompt" replaced the old standalone
    # PanelLeft header button. Lucide icon names and title strings survive
    # minification, so the committed bundle is checkable directly.
    bundle = "".join(p.read_text(encoding="utf-8") for p in (ROOT / "static" / "assets").glob("*.js"))
    assert "ChevronDown" in bundle
    assert "Switch prompt" in bundle
