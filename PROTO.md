# PROTO.md — agent grounding for promptlab-plugin

Read this before changing anything. `CLAUDE.md` and `AGENTS.md` are pointers here.

## What this repo is

A **protoAgent plugin** (id `promptlab`) — a prompt manager + playground. It ships:

- a **console view**: a shadcn-style UI for writing, versioning, and test-running
  prompts against any host-configured model, streamed with live reasoning;
- **agent tools** (`list_prompts`, `get_prompt`, `render_prompt`, `save_prompt`)
  so managed prompts are usable from chat, subagents, and workflows;
- an **agent skill** (`skills/prompt-lab/`) teaching agents to prefer managed prompts.

Standalone repo: `protoLabsAI/promptlab-plugin`. The host installs it from git and
reads `protoagent.plugin.yaml` (data only — no plugin code runs at discovery).

## Stack

- **Backend**: Python 3.12 — FastAPI routers, langchain-core tools, PyYAML store.
- **Frontend**: Vite + React + TypeScript in `frontend/`, built into `static/`.
- **Tests**: pytest with pytest-asyncio in auto mode (`pyproject.toml`), host-free.

## Architecture — module map

| Path | What it is |
|---|---|
| `__init__.py` | Plugin wiring. `register(registry)` is the only entry point: builds the store from config, wires host config into the runner, mounts the two routers, registers the 4 tools and the skill dir. Each step is wrapped in try/except so one failure doesn't take out the rest. |
| `store.py` | Versioned YAML-file prompt store. One YAML file per prompt in `<base>/prompts/`, history snapshots in `<base>/history/<id>/` with the notes-plugin coalesce pattern. **No host imports** — runs standalone with only pyyaml. |
| `tools.py` | The 4 agent tools via `langchain_core.tools.tool`: `list_prompts`, `get_prompt`, `render_prompt`, `save_prompt`. There is **deliberately no delete tool** — `store.delete` exists but is never exposed to agents (an agent clobber is one restore away; a delete is not). |
| `api.py` | The two FastAPI routers (ADR 0026): a **public view router** (view page + exact-file-allowlisted assets) and a **gated data router** (prompt CRUD + versions + the SSE run route). The model list comes from the host's own `/api/config/models/available` — no models route here. |
| `runner.py` | SSE streaming of one playground run through the **host's** LLM client (`graph.llm.create_llm`), so the playground exercises the same model path chat does. Host imports are lazy; falls back to the live `HOST` singleton when register-time wiring hasn't happened (cold-boot resilience). |
| `frontend/` | Vite/React/TypeScript playground UI. Source of truth for the view. |
| `static/` | The committed Vite build output the view router serves. Never hand-edited. |
| `skills/prompt-lab/SKILL.md` | Agent skill: how to use managed prompts (list → get → render; prefer new ids when saving experiments). |
| `tests/` | Host-free suite. `conftest.py` loads `__init__.py` as a synthetic `promptlab` package and provides the `FakeRegistry` + `store` fixtures. |

## The host-free constraint (most important rule)

The test suite runs with **no protoAgent host installed**. That works because:

- All `graph.*` imports are **lazy** — inside functions, never at module top level
  (`runner.py` is the template; `store.py`/`tools.py`/`api.py` import no host code at all).
- `tests/conftest.py` loads the plugin as a synthetic package and provides
  `FakeRegistry`, which mounts routers onto a real FastAPI app and records
  tool/skill registrations — no host, no network, no real LLM.
- New tests use the `FakeRegistry` / `store` fixtures from `conftest.py`; anything
  touching the host boundary gets monkeypatched at the lazy-import seam.

Break this and CI breaks: a single top-level `graph.*` import makes every test
file that touches that module unimportable outside a host checkout.

## Build / Test / Lint

Gate (what CI runs — keep it green):

```bash
pip install -r requirements-dev.txt ruff && ruff check . && ruff format --check . && pytest -q
```

Frontend (only when you changed `frontend/` — then commit the `static/` output):

```bash
cd frontend && npm ci && npm run build
```

## Conventions

- **Ruff** (`pyproject.toml`): line-length 120, target py311, select `E`/`F`/`W`,
  ignore `E402`/`E501`/`E702`/`E731`/`E741`.
- **Version sync**: `protoagent.plugin.yaml` `version:` and `pyproject.toml`
  `version` must match — `tests/test_manifest.py` enforces it. Bump both or neither.
- **No runtime pip deps**: the host provides fastapi, langchain-core, and pyyaml;
  the manifest's `requires_pip` stays empty. Dev-only deps go in `requirements-dev.txt`.
- **`static/` is committed**: git-installed plugins need no npm at install time,
  so the Vite build output ships in the repo. Rebuild from `frontend/`, never hand-edit.
- **View contract (ADR 0038)**: sandboxed-iframe pattern — the page + assets live on
  the **public** `/plugins/promptlab` prefix (assets from an exact-file allowlist),
  all data on the **gated** `/api/plugins/promptlab` prefix.
- **Storage is instance-scoped**: `~/.protoagent/promptlab/`, with a
  `PROTOAGENT_INSTANCE` subdirectory when that env var is set; `PROMPTLAB_DIR`
  overrides the base entirely (tests use this).
- **Version history coalesces**: a same-author write within `coalesce_seconds`
  (default 300) does not mint a new version — the editor autosaves; an
  author-change always snapshots first. History pruned to `max_versions`.

## Do / Don't

**Do**

- Keep host imports lazy — `graph.*` only inside function bodies (`runner.py` shows how).
- Use `FakeRegistry` from `tests/conftest.py` for new tests.
- Keep the manifest version and `pyproject.toml` version in sync.
- Run the full gate before calling work done.

**Don't**

- Don't add top-level `graph.*` imports — it breaks the host-free suite.
- Don't blanket-ignore `.proto/` in `.gitignore` — only the per-session scratch
  paths (`.proto/memory/`, `.proto/session-notes.md`, `.proto/repo-map-cache.json`).
- Don't modify `static/` by hand — it's build output; change `frontend/` and rebuild.
- Don't add runtime pip dependencies — the host supplies them.
- Don't commit `node_modules` in any form — including a symlink; the `.gitignore`
  pattern is deliberately slash-less so it covers both.
