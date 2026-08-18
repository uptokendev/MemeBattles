/**
 * Application Entry Point
 * Initializes and mounts the React application to the DOM
 */

import "./polyfills";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/mwz-hud.css";
import "./styles/tactical-command-ui.css";
import "./styles/page-density-fixes.css";
import "./styles/card-cleanup.css";
import "./styles/prepare-title-fix.css";
import "./styles/prepare-auth-ux.css";

/**
 * After a Netlify deploy, open tabs may still hold an old main bundle that
 * dynamic-imports deleted /assets/* chunks. SPA fallback used to return HTML
 * (MIME error). One hard reload recovers; guard against loops.
 */
const CHUNK_RELOAD_KEY = "mwz:chunk-reload";
function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg)
  );
}
function reloadOnceForStaleChunk(reason: string) {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    console.warn("[mwz] stale deploy chunk - reloading once:", reason);
    window.location.reload();
  } catch {
    window.location.reload();
  }
}
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForStaleChunk("vite:preloadError");
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[mwz boot rejection]", event.reason || event);
  if (isChunkLoadError(event.reason)) {
    event.preventDefault();
    reloadOnceForStaleChunk(String(event.reason));
  }
});
window.addEventListener("error", (event) => {
  console.error("[mwz boot error]", event.error || event.message || event);
});
// Clear the one-shot guard after a successful boot.
try {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
} catch {
  /* ignore */
}

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: String((error as { message?: string })?.message || error || "Unknown error"),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[mwz root render failed]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "#010600",
            color: "#39ff4f",
            fontFamily: "Pixeboy, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
            textAlign: "center",
          }}
        >
          <div>
            <p style={{ fontSize: "20px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              MemeWarzone failed to boot
            </p>
            <p style={{ marginTop: "12px", fontSize: "14px", opacity: 0.82, letterSpacing: "0.04em" }}>
              {this.state.message}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root mount element.");
}

rootElement.style.minHeight = "100vh";
rootElement.style.background = "#010600";

if (!rootElement.hasChildNodes()) {
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#010600;color:#39ff4f;font-family:Pixeboy,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;text-align:center;letter-spacing:0.12em;text-transform:uppercase;">
      Booting MemeWarzone...
    </div>
  `;
}

createRoot(rootElement).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
