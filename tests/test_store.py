"""PromptStore — CRUD, versioning (the notes coalesce rules), and templating."""

from __future__ import annotations

import pytest

from promptlab.store import PromptStore, extract_variables, render_messages

DOC = {
    "name": "Summarizer",
    "description": "Summarize anything",
    "tags": ["writing"],
    "messages": [
        {"role": "system", "content": "You are terse."},
        {"role": "user", "content": "Summarize {{text}} in {{words}} words."},
    ],
    "model": "gateway-fast",
    "params": {"temperature": 0.2},
}


def test_save_get_roundtrip(store):
    saved = store.save("summarizer", DOC, by="operator")
    assert saved["variables"] == ["text", "words"]
    got = store.get("summarizer")
    assert got["name"] == "Summarizer"
    assert got["messages"][1]["role"] == "user"
    assert got["params"] == {"temperature": 0.2}
    assert got["updated_by"] == "operator"
    assert store.list()[0]["id"] == "summarizer"


def test_get_unknown_and_delete(store):
    assert store.get("nope") is None
    store.save("x", DOC, by="operator")
    assert store.delete("x") is True
    assert store.get("x") is None
    assert store.delete("x") is False


@pytest.mark.parametrize("bad", ["", "UPPER", "a b", "../evil", "a/../b", ".hidden", "a" * 65])
def test_slug_validation(store, bad):
    with pytest.raises(ValueError):
        store.save(bad, DOC, by="operator")
    with pytest.raises(ValueError):
        store.get(bad)


def test_update_cuts_version_of_outgoing(store):
    store.save("p", DOC, by="operator")
    store.save("p", {**DOC, "name": "V2"}, by="agent")  # author change → always archives
    versions = store.list_versions("p")
    assert len(versions) == 1
    old = store.read_version("p", versions[0]["id"])
    assert old["name"] == "Summarizer"


def test_same_author_coalesces_inside_window(store):
    store.save("p", DOC, by="operator")
    store.save("p", {**DOC, "name": "V2"}, by="operator")  # cuts v1 (outgoing)
    store.save("p", {**DOC, "name": "V3"}, by="operator")  # same author, same burst → no new version
    assert len(store.list_versions("p")) == 1


def test_author_change_never_coalesces(store):
    store.save("p", DOC, by="operator")
    store.save("p", {**DOC, "name": "V2"}, by="operator")
    store.save("p", {**DOC, "name": "V3"}, by="agent")  # agent clobber → must be undoable
    assert len(store.list_versions("p")) == 2


def test_zero_window_archives_every_write(tmp_path):
    store = PromptStore(base_dir=tmp_path, coalesce_seconds=0)
    store.save("p", DOC, by="operator")
    store.save("p", {**DOC, "name": "V2"}, by="operator")
    store.save("p", {**DOC, "name": "V3"}, by="operator")
    assert len(store.list_versions("p")) == 2


def test_prune_to_max_versions(tmp_path):
    store = PromptStore(base_dir=tmp_path, max_versions=3, coalesce_seconds=0)
    store.save("p", DOC, by="operator")
    for i in range(6):
        store.save("p", {**DOC, "name": f"V{i}"}, by="operator")
    assert len(store.list_versions("p")) == 3


def test_restore_version(store):
    store.save("p", DOC, by="operator")
    store.save("p", {**DOC, "name": "V2"}, by="agent")
    vid = store.list_versions("p")[0]["id"]
    restored = store.restore_version("p", vid, by="operator")
    assert restored["name"] == "Summarizer"
    assert store.get("p")["name"] == "Summarizer"
    # the restore archived the outgoing V2 too
    names = {store.read_version("p", v["id"])["name"] for v in store.list_versions("p")}
    assert "V2" in names


def test_read_version_rejects_paths(store):
    store.save("p", DOC, by="operator")
    assert store.read_version("p", "../../prompts/p") is None
    assert store.read_version("p", "does-not-exist") is None


def test_extract_and_render():
    msgs = [{"role": "user", "content": "Hi {{name}}, {{name}} again: {{ task }}"}]
    assert extract_variables(msgs) == ["name", "task"]
    out = render_messages(msgs, {"name": "Ada", "task": "review"})
    assert out[0]["content"] == "Hi Ada, Ada again: review"


def test_render_strict_missing_raises():
    msgs = [{"role": "user", "content": "{{a}} {{b}}"}]
    with pytest.raises(KeyError, match="missing variables: b"):
        render_messages(msgs, {"a": "1"})
    loose = render_messages(msgs, {"a": "1"}, strict=False)
    assert loose[0]["content"] == "1 {{b}}"
