import { Plus, X } from "lucide-react";
import type { Message, PromptDoc } from "./types";
import { Button, Input, Label, Section, Select, Textarea } from "./ui";

const ROLES: Message["role"][] = ["system", "user", "assistant"];

export function Editor({
  doc,
  isNew,
  onChange,
  onIdChange,
}: {
  doc: PromptDoc;
  isNew: boolean;
  onChange: (patch: Partial<PromptDoc>) => void;
  onIdChange: (id: string) => void;
}) {
  const setMessage = (i: number, patch: Partial<Message>) =>
    onChange({ messages: doc.messages.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="p-name">Name</Label>
          <Input
            id="p-name"
            value={doc.name}
            placeholder="Release-notes summarizer"
            onChange={(e) => {
              onChange({ name: e.target.value });
              if (isNew) onIdChange(slugify(e.target.value));
            }}
          />
        </div>
        <div>
          <Label htmlFor="p-id">Id {isNew ? "" : "(fixed)"}</Label>
          <Input
            id="p-id"
            value={doc.id}
            disabled={!isNew}
            placeholder="release-notes-summarizer"
            className="disabled:opacity-60"
            onChange={(e) => onIdChange(slugify(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="p-desc">Description</Label>
          <Input
            id="p-desc"
            value={doc.description}
            placeholder="What this prompt is for"
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="p-tags">Tags</Label>
          <Input
            id="p-tags"
            value={doc.tags.join(", ")}
            placeholder="writing, release"
            onChange={(e) =>
              onChange({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
            }
          />
        </div>
      </div>

      <Section
        title="Messages"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ messages: [...doc.messages, { role: "user", content: "" }] })}
          >
            <Plus className="h-3.5 w-3.5" /> Add message
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {doc.messages.map((m, i) => (
            <div key={i} className="rounded-lg border border-border bg-bg-raised p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <Select
                  value={m.role}
                  onChange={(e) => setMessage(i, { role: e.target.value as Message["role"] })}
                  className="h-6.5 w-28 text-[11.5px]"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
                <span className="text-[11px] text-fg-subtle">
                  {"{{variable}}"} placeholders are filled at run time
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-6 w-6"
                  title="Remove message"
                  disabled={doc.messages.length <= 1}
                  onClick={() => onChange({ messages: doc.messages.filter((_, j) => j !== i) })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                rows={2}
                value={m.content}
                placeholder={m.role === "system" ? "You are…" : "Write the {{thing}}…"}
                onChange={(e) => setMessage(i, { content: e.target.value })}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 64);
