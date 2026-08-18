"""runner.run_stream with an injected llm_factory — no host, no network."""

from __future__ import annotations

from promptlab.runner import _split_chunk, run_stream


class _Chunk:
    def __init__(self, content="", kwargs=None, usage=None):
        self.content = content
        self.additional_kwargs = kwargs or {}
        self.usage_metadata = usage


class _FakeLLM:
    def __init__(self, chunks):
        self._chunks = chunks
        self.messages = None

    async def astream(self, messages):
        self.messages = messages
        for c in self._chunks:
            yield c


async def _collect(gen):
    return [e async for e in gen]


async def test_stream_deltas_reasoning_usage():
    llm = _FakeLLM(
        [
            _Chunk(kwargs={"reasoning_content": "hmm "}),
            _Chunk(content="Hel"),
            _Chunk(content="lo", usage={"input_tokens": 5, "output_tokens": 2, "total_tokens": 7}),
        ]
    )
    events = await _collect(
        run_stream(
            [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}],
            model="x",
            llm_factory=lambda model, params: llm,
        )
    )
    assert [e["type"] for e in events] == ["reasoning", "delta", "delta", "usage", "done"]
    assert events[3]["total_tokens"] == 7
    # role mapping reached the LLM as LC message objects
    assert [type(m).__name__ for m in llm.messages] == ["SystemMessage", "HumanMessage"]


async def test_anthropic_thinking_blocks_split():
    reasoning, answer = _split_chunk(
        _Chunk(
            content=[
                {"type": "thinking", "thinking": "let me see"},
                {"type": "text", "text": "answer"},
            ]
        )
    )
    assert reasoning == "let me see"
    assert answer == "answer"


async def test_factory_error_becomes_error_event():
    def boom(model, params):
        raise RuntimeError("no gateway")

    events = await _collect(run_stream([{"role": "user", "content": "u"}], llm_factory=boom))
    assert events[-1]["type"] == "error"
    assert "no gateway" in events[-1]["message"]


async def test_params_filtered_to_known_keys():
    seen = {}

    def factory(model, params):
        seen.update(params)
        return _FakeLLM([_Chunk(content="ok")])

    await _collect(
        run_stream(
            [{"role": "user", "content": "u"}],
            params={"temperature": 0.1, "max_tokens": 9, "evil": 1, "top_p": None},
            llm_factory=factory,
        )
    )
    assert seen == {"temperature": 0.1, "max_tokens": 9}
