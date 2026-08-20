import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { PromptDoc, PromptSummary } from "./types";

// Host-free, like the pytest suite: every network-touching export is faked so
// the component tree mounts without a protoAgent host behind it.
vi.mock("./api", () => ({
  listPrompts: vi.fn(() => Promise.resolve(SUMMARIES)),
  getPrompt: vi.fn((id: string) => Promise.resolve({ ...DOC, id })),
  savePrompt: vi.fn(),
  deletePrompt: vi.fn(),
  listVersions: vi.fn(() => Promise.resolve([])),
  readVersion: vi.fn(),
  restoreVersion: vi.fn(),
  availableModels: vi.fn(() => Promise.resolve({ lanes: [], options: [] })),
  runStream: vi.fn(),
}));

const SUMMARIES: PromptSummary[] = [
  {
    id: "greeting",
    name: "Greeting",
    description: "",
    tags: [],
    model: "",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: "test",
  },
];

const DOC: PromptDoc = {
  id: "greeting",
  name: "Greeting",
  description: "",
  tags: [],
  messages: [{ role: "system", content: "hi" }],
  model: "",
  params: {},
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: "test",
};

afterEach(cleanup);

// jsdom doesn't lay out container queries, so "drawer open" is observable as a
// second Sidebar instance (the static one is always in the DOM, just
// CSS-hidden below @4xl). Count its search inputs to tell one from two.
const sidebarCount = () => screen.getAllByPlaceholderText("Search prompts").length;

async function openPrompt() {
  const utils = render(<App />);
  // Static sidebar lists the prompt once the mocked listPrompts resolves.
  fireEvent.click(await screen.findByText("Greeting"));
  // Header appears once the doc loads; the name button is the drawer toggle.
  const toggle = await screen.findByTitle("Switch prompt");
  return { ...utils, toggle };
}

describe("mobile prompt switcher (header name toggle)", () => {
  it("opens the drawer when the header prompt name is tapped", async () => {
    const { toggle } = await openPrompt();
    expect(sidebarCount()).toBe(1);
    fireEvent.click(toggle);
    expect(sidebarCount()).toBe(2);
  });

  it("shows a chevron-down indicator next to the prompt name", async () => {
    const { toggle } = await openPrompt();
    expect(toggle.querySelector("svg.lucide-chevron-down")).toBeTruthy();
    expect(toggle.textContent).toContain("Greeting");
  });

  it("scopes the toggle to below @4xl and keeps a plain heading for the static-sidebar range", async () => {
    const { toggle, container } = await openPrompt();
    // The tappable heading disappears at @4xl+ (static sidebar takes over)...
    expect(toggle.closest("h2")?.classList.contains("@4xl/lab:hidden")).toBe(true);
    // ...and the @4xl+ heading is inert text, not a button.
    const headings = Array.from(container.querySelectorAll("header h2"));
    const desktop = headings.find((h) => h.classList.contains("@4xl/lab:block"));
    expect(desktop?.classList.contains("hidden")).toBe(true);
    expect(desktop?.querySelector("button")).toBeNull();
    expect(desktop?.textContent).toBe("Greeting");
  });

  it("has no standalone PanelLeft drawer button in the header", async () => {
    const { container } = await openPrompt();
    expect(container.querySelector("header svg.lucide-panel-left")).toBeNull();
  });

  it("closes the drawer on backdrop tap", async () => {
    const { toggle, container } = await openPrompt();
    fireEvent.click(toggle);
    const backdrop = container.querySelector('div[class*="bg-black/40"]');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(sidebarCount()).toBe(1);
  });

  it("closes the drawer when a prompt is selected from it", async () => {
    const { toggle } = await openPrompt();
    fireEvent.click(toggle);
    // Two "Greeting" rows now: static sidebar + drawer. Pick the drawer's.
    const rows = screen.getAllByText("Greeting", { selector: "nav button span" });
    expect(rows.length).toBe(2);
    fireEvent.click(rows[1]);
    await waitFor(() => expect(sidebarCount()).toBe(1));
  });

  it("still opens the drawer from the empty state's Browse button", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Browse/ }));
    expect(sidebarCount()).toBe(2);
  });
});
