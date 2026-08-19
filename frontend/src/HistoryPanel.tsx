import { useEffect, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { listVersions, readVersion } from "./api";
import type { PromptDoc, Version } from "./types";
import { Button, cn } from "./ui";

export function HistoryPanel({
  promptId,
  onRestore,
  onClose,
  className,
}: {
  promptId: string;
  onRestore: (versionId: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PromptDoc | null>(null);

  useEffect(() => {
    setPreviewId(null);
    setPreview(null);
    listVersions(promptId).then(setVersions).catch(() => setVersions([]));
  }, [promptId]);

  useEffect(() => {
    if (!previewId) return setPreview(null);
    readVersion(promptId, previewId).then(setPreview).catch(() => setPreview(null));
  }, [promptId, previewId]);

  return (
    <aside className={cn("flex w-72 shrink-0 flex-col border-l border-border bg-bg-subtle", className)}>
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        <span className="text-[12px] font-semibold">History</span>
        <Button variant="ghost" size="icon" onClick={onClose} title="Close history">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {versions.length === 0 && (
          <p className="px-2 pt-6 text-center text-[12px] text-fg-subtle">
            No archived versions yet — they appear when a prompt is changed.
          </p>
        )}
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => setPreviewId(previewId === v.id ? null : v.id)}
            className={cn(
              "mb-0.5 block w-full rounded-md px-2.5 py-1.5 text-left transition-colors",
              previewId === v.id ? "bg-bg-hover" : "hover:bg-bg-hover/60",
            )}
          >
            <span className="block text-[12px] font-medium text-fg">{v.name || "(unnamed)"}</span>
            <span className="block text-[11px] text-fg-subtle">
              {fmtTime(v.timestamp)} · by {v.by || "?"}
            </span>
          </button>
        ))}
      </div>
      {preview && previewId && (
        <div className="max-h-[45%] overflow-y-auto border-t border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fg-muted uppercase">Preview</span>
            <Button variant="outline" size="sm" onClick={() => onRestore(previewId)}>
              <RotateCcw className="h-3 w-3" /> Restore
            </Button>
          </div>
          {preview.messages.map((m, i) => (
            <div key={i} className="mb-2">
              <span className="text-[10.5px] font-medium text-fg-subtle uppercase">{m.role}</span>
              <pre className="mt-0.5 rounded-md border border-border bg-bg-inset p-2 font-mono text-[11px] whitespace-pre-wrap text-fg-muted">
                {m.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function fmtTime(iso: string): string {
  if (!iso) return "unknown time";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
