"""promptlab.tools — the agent-facing seam.

Managed prompts are LIVE for the agent: chat, subagents, and workflows pull the
same versioned documents the operator edits in the playground. Reads are free;
``save_prompt`` writes as author "agent", which always cuts a version of the
outgoing doc (author-change never coalesces) — an agent clobber is one restore
away. There is deliberately NO delete tool.
"""

from __future__ import annotations

import json

from langchain_core.tools import tool

from .store import PromptStore, render_messages


def build_tools(store: PromptStore) -> list:
    @tool
    def list_prompts() -> str:
        """List the managed prompts in the Prompt Lab library: id, name, description, tags."""
        return json.dumps({"prompts": store.list()}, ensure_ascii=False)

    @tool
    def get_prompt(prompt_id: str, version: str = "") -> str:
        """Read one managed prompt: its messages, {{variable}} names, default model and params.

        Pass a version id (from the prompt's version list) to read an archived version
        instead of the live one.
        """
        try:
            doc = store.read_version(prompt_id, version) if version else store.get(prompt_id)
        except ValueError as exc:
            return json.dumps({"error": str(exc)})
        if doc is None:
            return json.dumps({"error": f"unknown prompt or version: {prompt_id!r} {version!r}".strip()})
        return json.dumps(doc, ensure_ascii=False)

    @tool
    def render_prompt(prompt_id: str, variables_json: str = "{}") -> str:
        """Render a managed prompt with variable values, ready to use.

        variables_json is a JSON object mapping {{variable}} names to values, e.g.
        '{"topic": "release notes"}'. Errors if any variable in the prompt is missing —
        call get_prompt first to see which variables it needs.
        """
        try:
            variables = json.loads(variables_json or "{}")
            if not isinstance(variables, dict):
                raise ValueError("variables_json must be a JSON object")
        except (json.JSONDecodeError, ValueError) as exc:
            return json.dumps({"error": f"bad variables_json: {exc}"})
        try:
            doc = store.get(prompt_id)
        except ValueError as exc:
            return json.dumps({"error": str(exc)})
        if doc is None:
            return json.dumps({"error": f"unknown prompt: {prompt_id!r}"})
        try:
            messages = render_messages(doc["messages"], {k: str(v) for k, v in variables.items()})
        except KeyError as exc:
            return json.dumps({"error": str(exc.args[0] if exc.args else exc)})
        return json.dumps(
            {"id": prompt_id, "model": doc["model"], "params": doc["params"], "messages": messages}, ensure_ascii=False
        )

    @tool
    def save_prompt(
        prompt_id: str,
        name: str,
        system_prompt: str = "",
        user_template: str = "",
        description: str = "",
        tags: str = "",
        model: str = "",
    ) -> str:
        """Create or update a managed prompt in the Prompt Lab library.

        prompt_id is a slug ([a-z0-9-_]). system_prompt and user_template become the
        prompt's messages; use {{variable}} placeholders for values filled at render
        time. tags is comma-separated. model may name a slot like "gateway-alias" or
        "provider:model" ("" = host default). Updating an existing prompt archives
        the previous version first — the operator can always restore it.
        """
        messages = []
        if system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt})
        if user_template.strip():
            messages.append({"role": "user", "content": user_template})
        if not messages:
            return json.dumps({"error": "empty prompt: give system_prompt and/or user_template"})
        doc = {
            "name": name,
            "description": description,
            "tags": [t.strip() for t in tags.split(",") if t.strip()],
            "messages": messages,
            "model": model,
        }
        try:
            saved = store.save(prompt_id, doc, by="agent")
        except ValueError as exc:
            return json.dumps({"error": str(exc)})
        return json.dumps({"saved": saved["id"], "variables": saved["variables"]})

    return [list_prompts, get_prompt, render_prompt, save_prompt]
