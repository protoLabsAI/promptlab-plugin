# promptlab-plugin

**Prompt Lab** — a prompt manager + playground plugin for [protoAgent](https://github.com/protoLabsAI/protoAgent).

A shadcn-style console view for writing, versioning, and test-running prompts, plus
agent tools that make the same prompt library live for the agent. The differentiator
over standalone tools (Langfuse, Agenta, …): prompts managed here are directly usable
by chat, subagents, and workflows on the instance that owns them — no second system.

## What it contributes

- **Console view** (`Prompt Lab`, full rail surface) — a Vite/React playground served
  by the plugin itself (ADR 0038: sandboxed iframe, no host build, git-installable).
  Prompt list + editor (multi-message, `{{variable}}` templating), model picker fed by
  the host's cross-lane model list (`/api/config/models/available`, ADR 0097),
  temperature/max-tokens, streamed runs with live reasoning + token usage, and a
  version-history panel with restore.
- **Agent tools** — `list_prompts`, `get_prompt`, `render_prompt` (strict variable
  substitution), `save_prompt` (writes as author `agent`; always archives the outgoing
  version). Deliberately no delete tool.
- **Skill** — `prompt-lab`: when and how the agent should use managed prompts.

Runs execute through the host's own LLM client (`graph.llm.create_llm`), so every lane
the host can reach works in the playground — gateway aliases, `<provider>:<model>`
slots, native OAuth — with the exact routing chat uses.

## Storage

`~/.protoagent/promptlab/` (per-instance under `PROTOAGENT_INSTANCE`, override with
`PROMPTLAB_DIR`): one YAML doc per prompt in `prompts/`, history in `history/<id>/`.
Versioning follows the notes-plugin rules: identical saves and same-author writes
inside `coalesce_seconds` don't mint versions (the editor autosaves); an author change
always does (an agent clobber is one restore away); pruned to `max_versions`.

## Install

```bash
# from protoAgent chat or CLI
plugin install https://github.com/protoLabsAI/promptlab-plugin
```

Enable it in config (ships disabled):

```yaml
plugins:
  enabled: [promptlab]
```

Config (all optional): `max_versions` (50), `coalesce_seconds` (300), `default_model` ("").
Requires host ≥ 0.134.0 (the cross-lane model list).

## Development

```bash
# backend tests — host-free (only requirements-dev.txt)
python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt ruff
./.venv/bin/pytest -q && ./.venv/bin/ruff check .

# frontend — builds into static/ (COMMITTED, so a git install needs no npm)
cd frontend && npm install && npm run build
```

The view follows the four rules (`docs/guides/building-react-plugin-views.md`): page +
assets on the public `/plugins/promptlab` prefix (an iframe/ES-module load can't carry
a bearer — assets are exempted via manifest `public_paths` and served from an
exact-file allowlist), data on gated `/api/plugins/promptlab`, slug-aware everything
via the DS kit's `apiFetch`, theming via `--pl-*` tokens (live re-theme included).
