import { apiFetch } from "./kit";
import type { Message, ModelLane, PromptDoc, PromptSummary, RunEvent, Version } from "./types";

const P = "/api/plugins/promptlab";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not json */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const listPrompts = () =>
  apiFetch(`${P}/prompts`).then((r) => json<{ prompts: PromptSummary[] }>(r).then((d) => d.prompts));

export const getPrompt = (id: string) => apiFetch(`${P}/prompts/${id}`).then((r) => json<PromptDoc>(r));

export const savePrompt = (id: string, doc: PromptDoc) =>
  apiFetch(`${P}/prompts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  }).then((r) => json<PromptDoc>(r));

export const deletePrompt = (id: string) =>
  apiFetch(`${P}/prompts/${id}`, { method: "DELETE" }).then((r) => json<{ deleted: boolean }>(r));

// Streams the export through a blob URL so the browser saves a file — the
// gated route needs the bearer, so a plain <a href> can't do it.
export const exportPrompt = (id: string) =>
  apiFetch(`${P}/prompts/${id}/export`).then(async (r) => {
    if (!r.ok) throw new Error(`export failed: ${r.status}`);
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${id}.prompt.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

export const importPrompt = (data: PromptDoc, overwrite = false) =>
  apiFetch(`${P}/import${overwrite ? "?overwrite=true" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => json<PromptDoc>(r));

export const listVersions = (id: string) =>
  apiFetch(`${P}/prompts/${id}/versions`).then((r) => json<{ versions: Version[] }>(r).then((d) => d.versions));

export const readVersion = (id: string, vid: string) =>
  apiFetch(`${P}/prompts/${id}/versions/${vid}`).then((r) => json<PromptDoc>(r));

export const restoreVersion = (id: string, vid: string) =>
  apiFetch(`${P}/prompts/${id}/versions/${vid}/restore`, { method: "POST" }).then((r) => json<PromptDoc>(r));

// The HOST's cross-lane model list (ADR 0097) — qualified "<provider>:<model>"
// options, lanes with configured:false carrying a reason instead of being omitted.
export const availableModels = () =>
  apiFetch("/api/config/models/available").then((r) => json<{ lanes: ModelLane[]; options: string[] }>(r));

export async function runStream(
  body: { messages: Message[]; model: string; params: Record<string, number>; variables: Record<string, string> },
  onEvent: (e: RunEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await apiFetch(`${P}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`run failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)) as RunEvent);
      }
    }
  }
}
