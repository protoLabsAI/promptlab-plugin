"""Test bootstrap — make the plugin importable with NO protoAgent host.

The host loads the plugin under a synthetic package; the suite does the same so
relative imports (``from .store import ...``) resolve standalone. Executing
``__init__.py`` is safe because host-only imports live inside ``register()``.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PKG = "promptlab"

if PKG not in sys.modules:
    _spec = importlib.util.spec_from_file_location(PKG, ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
    assert _spec and _spec.loader
    _mod = importlib.util.module_from_spec(_spec)
    sys.modules[PKG] = _mod
    _spec.loader.exec_module(_mod)


class FakeRegistry:
    """Mounts routers onto a real FastAPI app exactly as the host does, so tests
    exercise the ACTUAL registered paths (prefix + route), not a hand-built app."""

    def __init__(self, config: dict | None = None):
        from fastapi import FastAPI

        self.app = FastAPI()
        self.config = config or {}
        self.tools: list = []
        self.skill_dirs: list = []
        self.host = None

    def register_router(self, router, prefix: str):
        self.app.include_router(router, prefix=prefix)

    def register_tool(self, t):
        self.tools.append(t)

    def register_skill_dir(self, path: str):
        self.skill_dirs.append(path)


@pytest.fixture
def registry(monkeypatch, tmp_path):
    monkeypatch.setenv("PROMPTLAB_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("PROTOAGENT_INSTANCE", raising=False)
    return FakeRegistry()


@pytest.fixture
def store(tmp_path):
    from promptlab.store import PromptStore

    return PromptStore(base_dir=tmp_path / "data")
