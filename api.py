"""promptlab.api — the two routers (ADR 0026).

PUBLIC ``/plugins/promptlab``: the view page + its Vite-built assets. An iframe
navigation and an ES-module import can't carry a bearer, so both are ungated —
the page is chrome; everything it FETCHES is on the gated router. Assets are
served from an exact-file allowlist, so the subtree can't be walked.

GATED ``/api/plugins/promptlab``: prompt CRUD + versions + the SSE run route.
The model list comes from the HOST's own ``/api/config/models/available`` —
the view calls it directly, so there is no models route here.
"""

from __future__ import annotations

import json
import mimetypes
from pathlib import Path
from typing import Callable, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from .store import PromptStore, render_messages

STATIC_DIR = Path(__file__).parent / "static"


class PromptBody(BaseModel):
    name: str = ""
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    messages: list[dict] = Field(default_factory=list)
    model: str = ""
    params: dict = Field(default_factory=dict)


class RunBody(BaseModel):
    messages: list[dict] = Field(default_factory=list)
    model: str = ""
    params: dict = Field(default_factory=dict)
    variables: dict[str, str] = Field(default_factory=dict)


class ImportBody(BaseModel):
    """An exported ``.prompt.json`` — the doc shape with the id INSIDE the body
    (PUT carries it in the URL instead). Extra export keys (``variables``,
    ``updated_at``, ``updated_by``) are ignored; they get recomputed on save."""

    id: str
    name: str = ""
    description: str = ""
    tags: list[str] = Field(default_factory=list)
    messages: list[dict] = Field(default_factory=list)
    model: str = ""
    params: dict = Field(default_factory=dict)


def build_view_router(static_dir: Path = STATIC_DIR) -> APIRouter:
    router = APIRouter()

    @router.get("/view", response_class=HTMLResponse)
    async def _view():
        index = static_dir / "index.html"
        if not index.exists():
            return HTMLResponse("<h1>Prompt Lab</h1><p>static build missing</p>", status_code=500)
        return HTMLResponse(index.read_text(encoding="utf-8"))

    @router.get("/assets/{name}")
    async def _asset(name: str):
        assets = static_dir / "assets"
        allowed = {p.name: p for p in assets.glob("*") if p.is_file()} if assets.is_dir() else {}
        target = allowed.get(name)
        if target is None:
            raise HTTPException(status_code=404)
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        return Response(
            content=target.read_bytes(),
            media_type=ctype,
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    return router


def build_data_router(store: PromptStore, run_stream: Optional[Callable] = None) -> APIRouter:
    if run_stream is None:
        from . import runner

        run_stream = runner.run_stream

    router = APIRouter()

    @router.get("/prompts")
    async def _list() -> dict:
        return {"prompts": store.list()}

    @router.get("/prompts/{prompt_id}")
    async def _get(prompt_id: str) -> dict:
        doc = _ok_id(lambda: store.get(prompt_id))
        if doc is None:
            raise HTTPException(status_code=404, detail="unknown prompt")
        return doc

    @router.put("/prompts/{prompt_id}")
    async def _save(prompt_id: str, body: PromptBody) -> dict:
        return _ok_id(lambda: store.save(prompt_id, body.model_dump(), by="operator"))

    @router.delete("/prompts/{prompt_id}")
    async def _delete(prompt_id: str) -> dict:
        return {"deleted": _ok_id(lambda: store.delete(prompt_id))}

    @router.get("/prompts/{prompt_id}/export")
    async def _export(prompt_id: str) -> Response:
        doc = _ok_id(lambda: store.get(prompt_id))
        if doc is None:
            raise HTTPException(status_code=404, detail="unknown prompt")
        # The doc's own shape as JSON — no envelope; the id travels in the body
        # so the file can be imported (or re-id'd) on another instance.
        return Response(
            content=json.dumps(doc, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{prompt_id}.prompt.json"'},
        )

    @router.post("/import")
    async def _import(body: ImportBody, overwrite: bool = False) -> dict:
        existing = _ok_id(lambda: store.get(body.id))
        if existing is not None and not overwrite:
            raise HTTPException(
                status_code=409,
                detail=f"prompt '{body.id}' already exists (pass ?overwrite=true to replace)",
            )
        # by="import" keeps provenance in history and stops the coalesce window
        # from folding the import into an operator editing burst.
        return _ok_id(lambda: store.save(body.id, body.model_dump(), by="import"))

    @router.get("/prompts/{prompt_id}/versions")
    async def _versions(prompt_id: str) -> dict:
        return {"versions": _ok_id(lambda: store.list_versions(prompt_id))}

    @router.get("/prompts/{prompt_id}/versions/{version_id}")
    async def _version(prompt_id: str, version_id: str) -> dict:
        doc = _ok_id(lambda: store.read_version(prompt_id, version_id))
        if doc is None:
            raise HTTPException(status_code=404, detail="unknown version")
        return doc

    @router.post("/prompts/{prompt_id}/versions/{version_id}/restore")
    async def _restore(prompt_id: str, version_id: str) -> dict:
        doc = _ok_id(lambda: store.restore_version(prompt_id, version_id, by="operator"))
        if doc is None:
            raise HTTPException(status_code=404, detail="unknown version")
        return doc

    @router.post("/run")
    async def _run(body: RunBody):
        # Loose render: unfilled {{vars}} pass through literally, so a quick run
        # without values still shows the model what the template looks like.
        messages = render_messages(body.messages, body.variables, strict=False)

        async def _events():
            async for evt in run_stream(messages, model=body.model, params=body.params):
                yield f"data: {json.dumps(evt)}\n\n"

        return StreamingResponse(
            _events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        )

    return router


def _ok_id(fn: Callable):
    """Map the store's slug ValueError onto a 400 instead of a 500."""
    try:
        return fn()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
