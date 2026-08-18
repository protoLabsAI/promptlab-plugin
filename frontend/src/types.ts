export type Message = { role: "system" | "user" | "assistant"; content: string };

export type PromptSummary = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  model: string;
  updated_at: string;
  updated_by: string;
};

export type PromptDoc = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  messages: Message[];
  model: string;
  params: { temperature?: number; max_tokens?: number };
  updated_at?: string;
  updated_by?: string;
  variables?: string[];
};

export type Version = { id: string; timestamp: string; by: string; name: string };

export type ModelLane = {
  provider: string;
  label?: string;
  configured: boolean;
  reason?: string;
  models: string[];
};

export type RunEvent =
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | { type: "usage"; input_tokens?: number; output_tokens?: number; total_tokens?: number }
  | { type: "done" }
  | { type: "error"; message: string };

export const VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function extractVariables(messages: Message[]): string[] {
  const seen: string[] = [];
  for (const m of messages) {
    for (const match of m.content.matchAll(VAR_RE)) {
      if (!seen.includes(match[1])) seen.push(match[1]);
    }
  }
  return seen;
}

export function emptyDoc(): PromptDoc {
  return {
    id: "",
    name: "",
    description: "",
    tags: [],
    messages: [
      { role: "system", content: "" },
      { role: "user", content: "" },
    ],
    model: "",
    params: {},
  };
}
