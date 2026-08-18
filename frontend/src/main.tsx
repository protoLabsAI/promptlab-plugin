import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Forward unhandled chords to the console (#1457) so host shortcuts (⌘K palette,
// surface switching) still work while this iframe has focus.
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") return; // ours (save)
  const combo = [
    e.metaKey || e.ctrlKey ? "mod" : "",
    e.shiftKey ? "shift" : "",
    e.altKey ? "alt" : "",
    e.key.toLowerCase(),
  ]
    .filter(Boolean)
    .join("+");
  const el = document.activeElement as HTMLElement | null;
  const editable =
    !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  window.parent?.postMessage({ type: "protoagent:keydown", combo, editable }, "*");
});
