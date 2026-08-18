"""promptlab.store — versioned prompt storage, instance-scoped (ADR 0004).

One YAML file per prompt under ``<base>/prompts/``, with per-prompt history under
``<base>/history/<id>/`` following the notes-plugin snapshot pattern: the OUTGOING
doc is archived before a write replaces it, identical saves and same-author writes
inside the coalesce window are skipped, and history is pruned to ``max_versions``.
A change of author always cuts a version — agent-clobbers-operator is the case
most worth undoing.

No host imports here: the module runs standalone under pytest with only pyyaml.
"""

from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import yaml

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
VAR_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")

_STAMP_FMT = "%Y%m%dT%H%M%S.%fZ"


def default_base_dir() -> Path:
    """``PROMPTLAB_DIR`` overrides the base; ``PROTOAGENT_INSTANCE`` adds a
    per-instance subdir (dev sandbox gets its own prompts, ADR 0004)."""
    base = Path(os.environ.get("PROMPTLAB_DIR") or (Path.home() / ".protoagent" / "promptlab"))
    instance = os.environ.get("PROTOAGENT_INSTANCE", "").strip()
    return base / instance if instance else base


def extract_variables(messages: list[dict]) -> list[str]:
    """``{{name}}`` placeholders across all message contents, in first-seen order."""
    seen: list[str] = []
    for m in messages:
        for name in VAR_RE.findall(str(m.get("content", ""))):
            if name not in seen:
                seen.append(name)
    return seen


def render_messages(messages: list[dict], variables: dict[str, str], strict: bool = True) -> list[dict]:
    """Substitute ``{{name}}`` placeholders. ``strict`` raises on any placeholder
    without a value — the agent-tool default, so a half-rendered prompt never runs."""
    missing = [v for v in extract_variables(messages) if v not in variables]
    if strict and missing:
        raise KeyError("missing variables: " + ", ".join(missing))

    def _sub(text: str) -> str:
        return VAR_RE.sub(lambda m: str(variables.get(m.group(1), m.group(0))), text)

    return [{**m, "content": _sub(str(m.get("content", "")))} for m in messages]


class PromptStore:
    def __init__(self, base_dir: Path | None = None, max_versions: int = 50, coalesce_seconds: int = 300):
        self.base = Path(base_dir) if base_dir else default_base_dir()
        self.max_versions = max(1, int(max_versions))
        self.coalesce_seconds = max(0, int(coalesce_seconds))

    # ── paths ────────────────────────────────────────────────────────────────

    def _prompts_dir(self) -> Path:
        d = self.base / "prompts"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _history_dir(self, prompt_id: str) -> Path:
        d = self.base / "history" / prompt_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _path(self, prompt_id: str) -> Path:
        if not SLUG_RE.match(prompt_id or ""):
            raise ValueError(f"invalid prompt id {prompt_id!r} (want [a-z0-9][a-z0-9_-]*, max 64)")
        return self._prompts_dir() / f"{prompt_id}.yaml"

    # ── documents ────────────────────────────────────────────────────────────

    @staticmethod
    def _normalize(doc: dict) -> dict:
        messages = [
            {"role": str(m.get("role", "user")), "content": str(m.get("content", ""))}
            for m in (doc.get("messages") or [])
        ]
        params = doc.get("params") or {}
        return {
            "name": str(doc.get("name", "")),
            "description": str(doc.get("description", "")),
            "tags": [str(t) for t in (doc.get("tags") or [])],
            "messages": messages,
            "model": str(doc.get("model", "")),
            "params": {k: params[k] for k in ("temperature", "max_tokens") if params.get(k) is not None},
            "updated_at": str(doc.get("updated_at", "")),
            "updated_by": str(doc.get("updated_by", "")),
        }

    def list(self) -> list[dict]:
        """Summaries, most recently updated first."""
        out = []
        for path in sorted(self._prompts_dir().glob("*.yaml")):
            doc = self._read_doc(path)
            if doc is None:
                continue
            out.append(
                {
                    "id": path.stem,
                    "name": doc["name"] or path.stem,
                    "description": doc["description"],
                    "tags": doc["tags"],
                    "model": doc["model"],
                    "updated_at": doc["updated_at"],
                    "updated_by": doc["updated_by"],
                }
            )
        return sorted(out, key=lambda d: d["updated_at"], reverse=True)

    def get(self, prompt_id: str) -> dict | None:
        path = self._path(prompt_id)
        if not path.exists():
            return None
        doc = self._read_doc(path)
        if doc is None:
            return None
        return {"id": prompt_id, **doc, "variables": extract_variables(doc["messages"])}

    def save(self, prompt_id: str, doc: dict, by: str) -> dict:
        """Create or update. The outgoing doc is snapshotted first (coalesced)."""
        path = self._path(prompt_id)
        incoming = self._normalize(doc)
        incoming["updated_at"] = _now_iso()
        incoming["updated_by"] = by
        if path.exists():
            outgoing = path.read_text(encoding="utf-8")
            self._snapshot(prompt_id, outgoing, by)
        path.write_text(yaml.safe_dump(incoming, sort_keys=False, allow_unicode=True), encoding="utf-8")
        return {"id": prompt_id, **incoming, "variables": extract_variables(incoming["messages"])}

    def delete(self, prompt_id: str) -> bool:
        """Deletes the live doc; history stays recoverable on disk."""
        path = self._path(prompt_id)
        if not path.exists():
            return False
        self._snapshot(prompt_id, path.read_text(encoding="utf-8"), "delete")
        path.unlink()
        return True

    def _read_doc(self, path: Path) -> dict | None:
        try:
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError):
            return None
        return self._normalize(raw) if isinstance(raw, dict) else None

    # ── history (the notes-plugin pattern) ───────────────────────────────────

    def _history_files(self, prompt_id: str) -> list[Path]:
        """Oldest first — lexical sort is chronological (microsecond UTC stamp leads)."""
        try:
            return sorted(self._history_dir(prompt_id).glob("*.yaml"))
        except OSError:
            return []

    @staticmethod
    def _parse_id(path: Path) -> tuple[str, str, str]:
        """``<stamp>-<by>-<digest>`` → (id, iso_timestamp, by); unparsable still lists."""
        vid = path.stem
        parts = vid.split("-")
        if len(parts) < 3:
            return vid, "", ""
        stamp, by = parts[0], parts[1]
        try:
            ts = datetime.strptime(stamp, _STAMP_FMT).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            ts = ""
        return vid, ts, by

    def _snapshot(self, prompt_id: str, outgoing: str, by: str) -> Path | None:
        """Best-effort: never raises, never blocks a save."""
        if not outgoing.strip():
            return None
        try:
            files = self._history_files(prompt_id)
            newest = files[-1] if files else None
            if newest is not None:
                try:
                    if newest.read_text(encoding="utf-8") == outgoing:
                        return None  # no-op save
                except (OSError, ValueError):
                    pass
                if self.coalesce_seconds > 0:
                    _, ts, prev_by = self._parse_id(newest)
                    if prev_by == by and ts:
                        age = (datetime.now(timezone.utc) - datetime.fromisoformat(ts)).total_seconds()
                        if 0 <= age < self.coalesce_seconds:
                            return None  # same editing burst
            stamp = datetime.now(timezone.utc).strftime(_STAMP_FMT)
            digest = hashlib.sha256(outgoing.encode("utf-8")).hexdigest()[:8]
            path = self._history_dir(prompt_id) / f"{stamp}-{by}-{digest}.yaml"
            path.write_text(outgoing, encoding="utf-8")
            files = self._history_files(prompt_id)
            for stale in files[: -self.max_versions] if len(files) > self.max_versions else []:
                try:
                    stale.unlink()
                except OSError:
                    pass
            return path
        except (OSError, ValueError):
            return None

    def list_versions(self, prompt_id: str) -> list[dict]:
        """Newest first: ``{id, timestamp, by, name}``."""
        self._path(prompt_id)  # slug validation
        out = []
        for path in reversed(self._history_files(prompt_id)):
            vid, ts, by = self._parse_id(path)
            doc = self._read_doc(path)
            out.append({"id": vid, "timestamp": ts, "by": by, "name": (doc or {}).get("name", "")})
        return out

    def read_version(self, prompt_id: str, version_id: str) -> dict | None:
        """Matched against known filenames, never joined onto a path — this takes
        operator/agent input and must not name a file outside the history dir."""
        self._path(prompt_id)
        for path in self._history_files(prompt_id):
            if path.stem == version_id:
                doc = self._read_doc(path)
                if doc is None:
                    return None
                return {"id": prompt_id, "version": version_id, **doc, "variables": extract_variables(doc["messages"])}
        return None

    def restore_version(self, prompt_id: str, version_id: str, by: str) -> dict | None:
        ver = self.read_version(prompt_id, version_id)
        if ver is None:
            return None
        doc = {k: ver[k] for k in ("name", "description", "tags", "messages", "model", "params")}
        return self.save(prompt_id, doc, by)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
