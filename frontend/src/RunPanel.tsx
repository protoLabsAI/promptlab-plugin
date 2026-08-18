import { useEffect, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronRight, Play, Square } from "lucide-react";
import { availableModels, runStream } from "./api";
import { Markdown } from "./Markdown";
import type { ModelLane, PromptDoc } from "./types";
import { extractVariables } from "./types";
import { Button, Input, Label, Section, Select, Spinner, cn } from "./ui";

type Usage = { input_tokens?: number; output_tokens?: number; total_tokens?: number };

export function RunPanel({
  doc,
  varValues,
  onVarChange,
  onChange,
}: {
  doc: PromptDoc;
  varValues: Record<string, string>;
  onVarChange: (name: string, value: string) => void;
  onChange: (patch: Partial<PromptDoc>) => void;
}) {
  const [lanes, setLanes] = useState<ModelLane[]>([]);
  const [running, setRunning] = useState(false);
  const [reasoning, setReasoning] = useState("");
  const [showReasoning, setShowReasoning] = useState(true);
  const [answer, setAnswer] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    availableModels()
      .then((d) => setLanes(d.lanes))
      .catch(() => setLanes([]));
    return () => abortRef.current?.abort();
  }, []);

  const variables = extractVariables(doc.messages);

  async function run() {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setRunning(true);
    setReasoning("");
    setShowReasoning(true);
    setAnswer("");
    setUsage(null);
    setError("");
    const params: Record<string, number> = {};
    if (doc.params.temperature != null) params.temperature = doc.params.temperature;
    if (doc.params.max_tokens != null) params.max_tokens = doc.params.max_tokens;
    try {
      await runStream(
        { messages: doc.messages, model: doc.model, params, variables: varValues },
        (e) => {
          if (e.type === "delta") setAnswer((a) => a + e.text);
          else if (e.type === "reasoning") setReasoning((r) => r + e.text);
          else if (e.type === "usage") setUsage(e);
          else if (e.type === "error") setError(e.message);
        },
        ctl.signal,
      );
    } catch (err) {
      if (!ctl.signal.aborted) setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const started = running || answer || reasoning || error;

  return (
    <div className="flex w-[44%] max-w-[600px] min-w-[320px] shrink-0 flex-col border-l border-border">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
          <div>
            <Label htmlFor="run-model">Model</Label>
            <Select id="run-model" value={doc.model} onChange={(e) => onChange({ model: e.target.value })}>
              <option value="">Host default</option>
              {lanes
                .filter((lane) => lane.models.length > 0 || !lane.configured)
                .map((lane) => (
                <optgroup
                  key={lane.provider}
                  label={lane.configured ? lane.provider : `${lane.provider} — ${lane.reason || "not configured"}`}
                >
                  {lane.models.map((m) => (
                    <option key={m} value={`${lane.provider}:${m}`} disabled={!lane.configured}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div className="w-20">
            <Label htmlFor="run-temp">Temp</Label>
            <Input
              id="run-temp"
              type="number"
              step="0.1"
              min="0"
              max="2"
              placeholder="—"
              value={doc.params.temperature ?? ""}
              onChange={(e) => onChange({ params: { ...doc.params, temperature: num(e.target.value) } })}
            />
          </div>
          <div className="w-24">
            <Label htmlFor="run-max">Max tokens</Label>
            <Input
              id="run-max"
              type="number"
              step="1"
              min="1"
              placeholder="—"
              value={doc.params.max_tokens ?? ""}
              onChange={(e) => onChange({ params: { ...doc.params, max_tokens: num(e.target.value) } })}
            />
          </div>
        </div>

        {variables.length > 0 && (
          <Section title="Variables">
            <div className="grid grid-cols-2 gap-2">
              {variables.map((v) => (
                <div key={v}>
                  <Label htmlFor={`var-${v}`} className="font-mono normal-case">{`{{${v}}}`}</Label>
                  <Input
                    id={`var-${v}`}
                    value={varValues[v] ?? ""}
                    placeholder="value"
                    onChange={(e) => onVarChange(v, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </Section>
        )}

        {running ? (
          <Button variant="outline" onClick={() => abortRef.current?.abort()}>
            <Square className="h-3.5 w-3.5" /> Stop
          </Button>
        ) : (
          <Button onClick={run} disabled={doc.messages.every((m) => !m.content.trim())}>
            <Play className="h-3.5 w-3.5" /> Run
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!started && (
          <p className="pt-8 text-center text-[12px] text-fg-subtle">
            Run the prompt to see the streamed response here.
          </p>
        )}

        {reasoning && (
          <div className="mb-3 rounded-lg border border-border bg-reasoning">
            <button
              className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-[11.5px] font-medium text-fg-muted"
              onClick={() => setShowReasoning((s) => !s)}
            >
              {showReasoning ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Brain className="h-3.5 w-3.5" /> Reasoning
            </button>
            {showReasoning && (
              <p className="px-3 pb-2.5 text-[12px] whitespace-pre-wrap italic opacity-80 text-fg-muted">
                {reasoning}
              </p>
            )}
          </div>
        )}

        {answer && <Markdown text={answer} />}
        {running && (
          <p className={cn("flex items-center gap-2 text-[12px] text-fg-subtle", answer && "mt-3")}>
            <Spinner /> streaming…
          </p>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-[12px] text-error">
            {error}
          </div>
        )}

        {usage && (
          <p className="mt-4 border-t border-border pt-2 text-[11px] text-fg-subtle">
            {usage.input_tokens ?? "?"} in · {usage.output_tokens ?? "?"} out · {usage.total_tokens ?? "?"} total tokens
          </p>
        )}
      </div>
    </div>
  );
}
