"""promptlab — prompt manager + playground for protoAgent.

``register(registry)`` is the only place plugin code runs. Host-only imports
(graph.*) stay lazy inside functions so the test suite runs host-free.
"""

from __future__ import annotations

import logging

log = logging.getLogger("protoagent.plugins.promptlab")


def register(registry) -> None:
    cfg = registry.config or {}

    from .store import PromptStore

    store = PromptStore(
        max_versions=_as_int(cfg.get("max_versions"), 50),
        coalesce_seconds=_as_int(cfg.get("coalesce_seconds"), 300),
    )

    # The run route executes through the host's own LLM client (graph.llm.create_llm),
    # which needs the LIVE server config — read per-run, never captured at build time
    # (the stale-OAuth-token lesson).
    try:
        from . import runner

        host = getattr(registry, "host", None)
        if host is not None and getattr(host, "config", None):
            runner.set_host_config(host.config)
    except Exception:  # noqa: BLE001
        log.exception("[promptlab] wiring host config failed")

    # Console view (public page + assets) + data API (gated) — two routers (ADR 0026).
    try:
        from .api import build_data_router, build_view_router

        registry.register_router(build_view_router(), prefix="/plugins/promptlab")
        registry.register_router(build_data_router(store), prefix="/api/plugins/promptlab")
    except Exception:  # noqa: BLE001
        log.exception("[promptlab] mounting routers failed")

    # Agent tools — managed prompts usable from chat, subagents, and workflows.
    try:
        from .tools import build_tools

        for t in build_tools(store):
            registry.register_tool(t)
    except Exception:  # noqa: BLE001
        log.exception("[promptlab] registering tools failed")

    try:
        registry.register_skill_dir("skills")
    except Exception:  # noqa: BLE001
        log.exception("[promptlab] registering skills failed")

    log.info("[promptlab] registered")


def _as_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
