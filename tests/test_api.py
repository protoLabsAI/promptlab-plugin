"""The routers, mounted exactly as register() mounts them (the artifact-plugin
lesson: test the ACTUAL registered path, not the rule-compliant one)."""

from __future__ import annotations

import json

import promptlab
from fastapi.testclient import TestClient


def _client(registry) -> TestClient:
    promptlab.register(registry)
    return TestClient(registry.app)


def test_register_contributions(registry):
    promptlab.register(registry)
    assert sorted(t.name for t in registry.tools) == ["get_prompt", "list_prompts", "render_prompt", "save_prompt"]
    assert registry.skill_dirs == ["skills"]


def test_view_served_on_declared_path_not_api(registry):
    client = _client(registry)
    r = client.get("/plugins/promptlab/view")
    assert r.status_code == 200
    assert "/_ds/plugin-kit" in r.text
    assert client.get("/api/plugins/promptlab/view").status_code == 404


def test_assets_served_and_guarded(registry):
    client = _client(registry)
    from promptlab.api import STATIC_DIR

    names = [p.name for p in (STATIC_DIR / "assets").glob("*.js")]
    assert names, "frontend build missing — run `npm run build` in frontend/"
    r = client.get(f"/plugins/promptlab/assets/{names[0]}")
    assert r.status_code == 200
    assert "javascript" in r.headers["content-type"]
    assert client.get("/plugins/promptlab/assets/nope.js").status_code == 404
    assert client.get("/plugins/promptlab/assets/..%2F..%2F__init__.py").status_code == 404


def test_prompt_crud_over_gated_routes(registry):
    client = _client(registry)
    body = {"name": "T", "messages": [{"role": "user", "content": "hi {{who}}"}]}
    r = client.put("/api/plugins/promptlab/prompts/t1", json=body)
    assert r.status_code == 200
    assert r.json()["variables"] == ["who"]

    assert client.get("/api/plugins/promptlab/prompts").json()["prompts"][0]["id"] == "t1"
    assert client.get("/api/plugins/promptlab/prompts/t1").json()["updated_by"] == "operator"
    assert client.get("/api/plugins/promptlab/prompts/none").status_code == 404
    assert client.put("/api/plugins/promptlab/prompts/BAD ID", json=body).status_code == 400

    client.put("/api/plugins/promptlab/prompts/t1", json={**body, "name": "T2"})
    # operator saves coalesce; flip author via a direct store write to cut a version
    r = client.get("/api/plugins/promptlab/prompts/t1/versions")
    assert r.status_code == 200

    assert client.delete("/api/plugins/promptlab/prompts/t1").json()["deleted"] is True


def test_version_routes(registry, monkeypatch):
    client = _client(registry)
    body = {"name": "V1", "messages": [{"role": "user", "content": "x"}]}
    client.put("/api/plugins/promptlab/prompts/p", json=body)

    # author change forces a version cut without waiting out the coalesce window
    from promptlab.store import PromptStore
    import os

    store = PromptStore(base_dir=os.environ["PROMPTLAB_DIR"])
    store.save("p", {**body, "name": "V2"}, by="agent")

    versions = client.get("/api/plugins/promptlab/prompts/p/versions").json()["versions"]
    assert len(versions) == 1
    vid = versions[0]["id"]
    assert client.get(f"/api/plugins/promptlab/prompts/p/versions/{vid}").json()["name"] == "V1"
    assert client.get("/api/plugins/promptlab/prompts/p/versions/ghost").status_code == 404
    r = client.post(f"/api/plugins/promptlab/prompts/p/versions/{vid}/restore")
    assert r.json()["name"] == "V1"


def test_run_route_streams_sse(registry, tmp_path):
    """The run route with an injected fake stream — SSE framing end to end."""
    from promptlab.api import build_data_router
    from promptlab.store import PromptStore

    async def fake_stream(messages, model="", params=None):
        assert messages[0]["content"] == "hi Ada"  # variables rendered before the run
        yield {"type": "delta", "text": "he"}
        yield {"type": "delta", "text": "llo"}
        yield {"type": "done"}

    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(
        build_data_router(PromptStore(base_dir=tmp_path), run_stream=fake_stream),
        prefix="/api/plugins/promptlab",
    )
    client = TestClient(app)
    body = {
        "messages": [{"role": "user", "content": "hi {{who}}"}],
        "variables": {"who": "Ada"},
        "model": "m",
        "params": {},
    }
    with client.stream("POST", "/api/plugins/promptlab/run", json=body) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]
    assert [e["type"] for e in events] == ["delta", "delta", "done"]
    assert "".join(e.get("text", "") for e in events) == "hello"
