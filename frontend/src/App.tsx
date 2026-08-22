import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Check, ChevronDown, Download, FlaskConical, History, PanelLeft, Save, Trash2, Upload } from "lucide-react";
import { deletePrompt, exportPrompt, getPrompt, importPrompt, listPrompts, restoreVersion, savePrompt } from "./api";
import { Editor } from "./Editor";
import { HistoryPanel } from "./HistoryPanel";
import { RunPanel } from "./RunPanel";
import { Sidebar } from "./Sidebar";
import type { PromptDoc, PromptSummary } from "./types";
import { emptyDoc } from "./types";
import { Button, Spinner } from "./ui";

const AUTOSAVE_MS = 1200;

export default function App() {
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [doc, setDoc] = useState<PromptDoc | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  // Narrow-panel prompt-list drawer (only reachable below @4xl — the static
  // sidebar takes over above it, so stale `true` is harmless there).
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Armed state for the two-step delete; disarms itself after a beat.
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);
  // Armed state for a conflicting import — same two-step in-DOM pattern as
  // delete (window.confirm is dead in the sandboxed iframe). Holds the parsed
  // doc so the second click can retry with overwrite.
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PromptDoc | null>(null);
  useEffect(() => {
    if (!pendingImport) return;
    const t = setTimeout(() => setPendingImport(null), 4000);
    return () => clearTimeout(t);
  }, [pendingImport]);
  const [varValues, setVarValues] = useState<Record<string, Record<string, string>>>({});
  const docRef = useRef<{ doc: PromptDoc | null; isNew: boolean; dirty: boolean }>({
    doc: null,
    isNew: false,
    dirty: false,
  });
  docRef.current = { doc, isNew, dirty };

  const refreshList = useCallback(() => listPrompts().then(setPrompts).catch(() => {}), []);
  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const doSave = useCallback(async (): Promise<boolean> => {
    const { doc: d, isNew: creating } = docRef.current;
    if (!d || !d.id) return false;
    setSaving(true);
    setSaveError("");
    try {
      const saved = await savePrompt(d.id, d);
      // keep any edits typed while the save was in flight
      setDoc((cur) => (cur && cur.id === saved.id ? { ...cur, updated_at: saved.updated_at } : cur));
      if (docRef.current.doc?.id === saved.id) setDirty(false);
      if (creating) setIsNew(false);
      refreshList();
      return true;
    } catch (err) {
      setSaveError(String(err instanceof Error ? err.message : err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [refreshList]);

  // Autosave for existing prompts (server-side coalescing keeps history sane —
  // the notes-plugin pattern). New prompts save explicitly via Create.
  useEffect(() => {
    if (!dirty || isNew || !doc?.id) return;
    const t = setTimeout(doSave, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc, dirty, isNew, doSave]);

  // ⌘S saves immediately
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        doSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave]);

  async function select(id: string) {
    const { dirty: wasDirty, isNew: creating } = docRef.current;
    if (wasDirty && !creating) await doSave();
    try {
      setDoc(await getPrompt(id));
      setIsNew(false);
      setDirty(false);
      setSaveError("");
      setConfirmDelete(false);
    } catch (err) {
      setSaveError(String(err));
    }
  }

  function startNew() {
    setDoc(emptyDoc());
    setIsNew(true);
    setDirty(false);
    setSaveError("");
    setShowHistory(false);
    setConfirmDelete(false);
  }

  // Two-step in-DOM delete confirmation. window.confirm is a trap here: the
  // view runs in the console's sandboxed iframe (no allow-modals), where
  // confirm() silently returns false — delete looked broken with no error.
  async function remove() {
    if (!doc || isNew) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    try {
      await deletePrompt(doc.id);
      setDoc(null);
      setShowHistory(false);
      refreshList();
    } catch (err) {
      setSaveError(String(err instanceof Error ? err.message : err));
    }
  }

  async function applyImport(data: PromptDoc, overwrite: boolean) {
    try {
      await importPrompt(data, overwrite);
      setPendingImport(null);
      refreshList();
      select(data.id);
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err);
      if (!overwrite && msg.includes("already exists")) {
        setPendingImport(data); // arm — the next click retries with overwrite
      } else {
        setSaveError(msg);
      }
    }
  }

  function importClick() {
    if (pendingImport) {
      applyImport(pendingImport, true);
      return;
    }
    fileRef.current?.click();
  }

  function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyImport(JSON.parse(String(reader.result)) as PromptDoc, false);
      } catch {
        setSaveError("import failed — file is not valid JSON");
      }
    };
    reader.readAsText(file);
  }

  async function restore(versionId: string) {
    if (!doc) return;
    try {
      setDoc(await restoreVersion(doc.id, versionId));
      setDirty(false);
      refreshList();
    } catch (err) {
      setSaveError(String(err));
    }
  }

  const patch = (p: Partial<PromptDoc>) => {
    setDoc((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  };

  // Drawer actions also dismiss it — selecting a prompt on a phone-width panel
  // should land you in the editor, not behind an open drawer.
  const drawerSelect = (id: string) => {
    setDrawerOpen(false);
    select(id);
  };
  const drawerNew = () => {
    setDrawerOpen(false);
    startNew();
  };

  return (
    // Mobile-first, sized by the PANEL not the viewport (the learning-wiki
    // pattern): this view renders inside the console rail / fleet proxy, where
    // viewport media queries lie. Base layout = drawer sidebar + stacked panes;
    // container variants add the desktop arrangement back at width:
    //   @3xl (768px)  editor and run panel go side by side
    //   @4xl (896px)  the prompt list becomes a static sidebar
    <div className="@container/lab relative flex h-full bg-bg text-fg">
      <input ref={fileRef} type="file" accept=".json,.prompt.json" hidden onChange={handleImportFile} />
      <Sidebar
        className="hidden @4xl/lab:flex"
        prompts={prompts}
        selectedId={isNew ? null : (doc?.id ?? null)}
        onSelect={select}
        onNew={startNew}
      />
      {drawerOpen && (
        <div className="absolute inset-0 z-20 @4xl/lab:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-xl">
            <Sidebar
              className="flex h-full"
              prompts={prompts}
              selectedId={isNew ? null : (doc?.id ?? null)}
              onSelect={drawerSelect}
              onNew={drawerNew}
            />
          </div>
        </div>
      )}

      {doc ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
            {/* Below @4xl the name itself is the drawer toggle — the chevron is
                the "tap to switch" signal. At @4xl+ the static sidebar handles
                switching, so the name reverts to a plain heading. */}
            <h2 className="min-w-0 @4xl/lab:hidden">
              <button
                type="button"
                className="-ml-1.5 flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-semibold hover:bg-bg-hover"
                title="Switch prompt"
                onClick={() => setDrawerOpen(true)}
              >
                <span className="truncate">{isNew ? "New prompt" : doc.name || doc.id}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
              </button>
            </h2>
            <h2 className="hidden truncate text-[13px] font-semibold @4xl/lab:block">
              {isNew ? "New prompt" : doc.name || doc.id}
            </h2>
            <span className="mr-auto text-[11px] text-fg-subtle">
              {saving ? (
                <Spinner className="h-3 w-3" />
              ) : saveError ? (
                <span className="text-error" title={saveError}>save failed — {saveError}</span>
              ) : dirty ? (
                "unsaved"
              ) : isNew ? (
                ""
              ) : (
                <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-success" /> saved</span>
              )}
            </span>
            {isNew ? (
              <Button size="sm" disabled={!doc.id || saving} onClick={doSave}>
                <Save className="h-3.5 w-3.5" /> Create
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="icon" title="Export prompt" onClick={() => exportPrompt(doc.id)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size={pendingImport ? "sm" : "icon"}
                  title={
                    pendingImport
                      ? `"${pendingImport.id}" exists — click again to overwrite`
                      : "Import prompt"
                  }
                  onClick={importClick}
                >
                  <Upload className="h-4 w-4" />
                  {pendingImport && "Overwrite?"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Version history"
                  onClick={() => setShowHistory((s) => !s)}
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size={confirmDelete ? "sm" : "icon"}
                  title={confirmDelete ? "Click again to delete — history stays on disk" : "Delete prompt"}
                  onClick={remove}
                >
                  <Trash2 className="h-4 w-4" />
                  {confirmDelete && "Delete?"}
                </Button>
              </>
            )}
          </header>

          <div className="flex min-h-0 flex-1 flex-col @3xl/lab:flex-row">
            <Editor doc={doc} isNew={isNew} onChange={patch} onIdChange={(id) => patch({ id })} />
            <RunPanel
              doc={doc}
              varValues={varValues[doc.id] ?? {}}
              onVarChange={(name, value) =>
                setVarValues((all) => ({ ...all, [doc.id]: { ...(all[doc.id] ?? {}), [name]: value } }))
              }
              onChange={patch}
            />
            {showHistory && !isNew && (
              <>
                {/* Below @3xl the history panel overlays instead of squeezing a
                    third column into a stacked layout. */}
                <div
                  className="absolute inset-0 z-10 bg-black/40 @3xl/lab:hidden"
                  onClick={() => setShowHistory(false)}
                />
                <HistoryPanel
                  className="absolute inset-y-0 right-0 z-20 shadow-xl @3xl/lab:static @3xl/lab:z-auto @3xl/lab:shadow-none"
                  promptId={doc.id}
                  onRestore={restore}
                  onClose={() => setShowHistory(false)}
                />
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
          <FlaskConical className="h-10 w-10 text-fg-subtle" />
          <p className="max-w-sm text-center text-[13px] text-fg-muted">
            Write, version, and test-run prompts against any configured model. Managed prompts are
            live for the agent via the <code className="font-mono text-[12px]">get_prompt</code> /{" "}
            <code className="font-mono text-[12px]">render_prompt</code> tools.
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={startNew}>New prompt</Button>
            <Button
              variant="ghost"
              title={
                pendingImport
                  ? `"${pendingImport.id}" exists — click again to overwrite`
                  : "Import a .prompt.json file"
              }
              onClick={importClick}
            >
              <Upload className="h-3.5 w-3.5" /> {pendingImport ? "Overwrite?" : "Import"}
            </Button>
            {/* On a narrow panel the sidebar is a drawer, so the empty state needs
                its own way into the prompt list. */}
            <Button variant="ghost" className="@4xl/lab:hidden" onClick={() => setDrawerOpen(true)}>
              <PanelLeft className="h-3.5 w-3.5" /> Browse
            </Button>
          </div>
          {/* Import errors would otherwise be invisible here — the save-status
              slot lives in the editor header, which the empty state doesn't have. */}
          {saveError && <p className="max-w-sm text-center text-[11px] text-error">{saveError}</p>}
        </div>
      )}
    </div>
  );
}
