"""promptlab.runner — stream one playground run through the HOST's LLM client.

``graph.llm.create_llm`` is the single execution seam: it routes ``<provider>:<model>``
slots, the LiteLLM gateway, and native-OAuth providers exactly as chat does, so the
playground exercises the same path the agent runs on. Host imports stay lazy — the
test suite injects ``llm_factory`` and never touches the host.

Events yielded (plain dicts, the API layer wraps them as SSE):
  {"type": "reasoning", "text": ...}   native/gateway reasoning stream
  {"type": "delta", "text": ...}       answer tokens
  {"type": "usage", ...}               final token counts, when the stream reports them
  {"type": "done"}                     clean end
  {"type": "error", "message": ...}    anything raised (never propagates)
"""

from __future__ import annotations

import logging
from typing import AsyncIterator, Callable, Optional

log = logging.getLogger("protoagent.plugins.promptlab")

# () -> LangGraphConfig — wired by register() from registry.host.config; stays None
# under the host-free test suite.
_host_config: Optional[Callable] = None


def set_host_config(getter: Callable | None) -> None:
    global _host_config
    _host_config = getter


def _default_llm_factory(model: str, params: dict):
    from graph.llm import create_llm  # host-only, lazy

    cfg_get = _host_config
    if cfg_get is None:
        # Cold-boot resilience: register() runs BEFORE the server wires
        # registry.host (agent_init loads plugins early, populates HOST late),
        # so the register-time wiring silently skips on a fresh boot — the exact
        # failure the desktop app hit after its v0.141.0 update restart. The
        # HOST singleton is always populated before any REQUEST can arrive, so
        # read it live instead of depending on registration order.
        try:
            from graph.plugins.host import HOST  # host-only, lazy

            cfg_get = HOST.config
        except Exception:  # noqa: BLE001 — host-free context: fall through to the error
            cfg_get = None
    if cfg_get is None:
        raise RuntimeError("promptlab: no host config available (plugin not registered?)")
    llm = create_llm(cfg_get(), model_name=model or None)
    if params:
        try:
            llm = llm.bind(**params)
        except Exception:  # noqa: BLE001 — a lane that rejects bind still runs with model defaults
            log.warning("[promptlab] model lane ignored params %s", list(params))
    return llm


def _to_lc_messages(messages: list[dict]):
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    cls = {"system": SystemMessage, "user": HumanMessage, "assistant": AIMessage}
    return [cls.get(str(m.get("role", "user")), HumanMessage)(content=str(m.get("content", ""))) for m in messages]


def _split_chunk(chunk) -> tuple[str, str]:
    """(reasoning_text, answer_text) out of one stream chunk. Gateway lanes lift
    reasoning into ``additional_kwargs.reasoning_content`` (graph/llm.py); native
    Anthropic lanes stream it as ``thinking`` content blocks."""
    reasoning = str(getattr(chunk, "additional_kwargs", {}).get("reasoning_content") or "")
    content = getattr(chunk, "content", "")
    if isinstance(content, str):
        return reasoning, content
    answer = ""
    for block in content or []:
        if isinstance(block, str):
            answer += block
        elif isinstance(block, dict):
            kind = block.get("type", "")
            if kind == "thinking":
                reasoning += str(block.get("thinking", ""))
            else:
                answer += str(block.get("text", ""))
    return reasoning, answer


async def run_stream(
    messages: list[dict],
    model: str = "",
    params: dict | None = None,
    llm_factory: Callable | None = None,
) -> AsyncIterator[dict]:
    factory = llm_factory or _default_llm_factory
    clean = {k: v for k, v in (params or {}).items() if k in ("temperature", "max_tokens") and v is not None}
    usage = None
    try:
        llm = factory(model, clean)
        async for chunk in llm.astream(_to_lc_messages(messages)):
            reasoning, answer = _split_chunk(chunk)
            if reasoning:
                yield {"type": "reasoning", "text": reasoning}
            if answer:
                yield {"type": "delta", "text": answer}
            meta = getattr(chunk, "usage_metadata", None)
            if meta:
                usage = meta
    except Exception as exc:  # noqa: BLE001 — surface as an event, never a broken stream
        log.exception("[promptlab] run failed")
        yield {"type": "error", "message": f"{type(exc).__name__}: {exc}"}
        return
    if usage:
        yield {
            "type": "usage",
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "total_tokens": usage.get("total_tokens"),
        }
    yield {"type": "done"}
