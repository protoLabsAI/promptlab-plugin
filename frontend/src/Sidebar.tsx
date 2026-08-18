import { useState } from "react";
import { FlaskConical, Plus, Search } from "lucide-react";
import type { PromptSummary } from "./types";
import { Button, cn } from "./ui";

export function Sidebar({
  prompts,
  selectedId,
  onSelect,
  onNew,
}: {
  prompts: PromptSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? prompts.filter((p) =>
        [p.id, p.name, p.description, ...p.tags].some((s) => s.toLowerCase().includes(q)),
      )
    : prompts;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-subtle">
      <div className="flex h-11 items-center gap-2 border-b border-border px-3">
        <FlaskConical className="h-4 w-4 text-accent" />
        <span className="text-[13px] font-semibold">Prompt Lab</span>
        <Button variant="ghost" size="icon" className="ml-auto" title="New prompt" onClick={onNew}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="relative px-2.5 py-2">
        <Search className="pointer-events-none absolute top-1/2 left-4.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prompts"
          className="h-7 w-full rounded-md border border-border bg-bg-inset pr-2 pl-7 text-[12px] text-fg placeholder:text-fg-subtle focus:outline-2 focus:outline-offset-0 focus:outline-focus/60"
        />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {shown.length === 0 && (
          <p className="px-2 pt-6 text-center text-[12px] text-fg-subtle">
            {prompts.length === 0 ? "No prompts yet." : "No matches."}
          </p>
        )}
        {shown.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={cn(
              "mb-0.5 block w-full rounded-md border-l-2 px-2.5 py-1.5 text-left transition-colors",
              p.id === selectedId
                ? "border-accent bg-bg-hover"
                : "border-transparent hover:bg-bg-hover/60",
            )}
          >
            <span className="block truncate text-[12.5px] font-medium text-fg">{p.name || p.id}</span>
            <span className="block truncate text-[11px] text-fg-subtle">
              {p.id}
              {p.tags.length > 0 && ` · ${p.tags.join(", ")}`}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
