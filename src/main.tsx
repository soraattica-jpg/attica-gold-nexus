import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { clearPendingSafeReload, deferReloadUntilSafe, registerDeferredSafeReloadListener } from "@/lib/safeReload";

const CHUNK_RELOAD_KEY = "attica_chunk_reload_attempted";

const resetChunkReloadFlag = () => {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // Ignore storage access failures and continue without persistence.
  }
  clearPendingSafeReload();
};

const reloadForChunkFailure = () => {
  if (deferReloadUntilSafe()) {
    return;
  }

  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") {
      return;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  } catch {
    // Ignore storage access failures and still attempt a single reload.
  }

  window.location.reload();
};

const isChunkLoadFailure = (value: unknown) => {
  if (!value) return false;
  const message = typeof value === "string"
    ? value
    : value instanceof Error
      ? value.message
      : typeof value === "object" && "message" in value && typeof value.message === "string"
        ? value.message
        : "";

  return /Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(message);
};

const getErrorMessage = (value: unknown) => {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message;
  }
  return String(value || "");
};

const getStoredUserForErrorLog = () => {
  try {
    const stored = window.sessionStorage.getItem("attica_user");
    if (!stored) return {};
    const parsed = JSON.parse(stored) as { id?: unknown; name?: unknown; role?: unknown };
    return {
      agentId: typeof parsed.id === "string" ? parsed.id : "",
      agentName: typeof parsed.name === "string" ? parsed.name : "",
      userRole: typeof parsed.role === "string" ? parsed.role : "",
    };
  } catch {
    return {};
  }
};

const logGlobalFrontendError = (source: string, error: unknown) => {
  try {
    const message = getErrorMessage(error);
    if (!message || isChunkLoadFailure(error)) return;
    void fetch("/api/frontend-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...getStoredUserForErrorLog(),
        path: window.location.pathname,
        sectionTitle: "Global frontend runtime",
        errorName: error instanceof Error ? error.name : source,
        errorMessage: message.slice(0, 500),
        componentStack: "",
        userAgent: window.navigator.userAgent,
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Diagnostics must never create a second failure.
  }
};

window.addEventListener("load", resetChunkReloadFlag);
const unregisterDeferredReloadListener = registerDeferredSafeReloadListener();
window.addEventListener("beforeunload", unregisterDeferredReloadListener);

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForChunkFailure();
});

window.addEventListener("error", (event) => {
  if (isChunkLoadFailure(event.error ?? event.message)) {
    reloadForChunkFailure();
    return;
  }
  logGlobalFrontendError("window.error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  if (isChunkLoadFailure(event.reason)) {
    event.preventDefault();
    reloadForChunkFailure();
    return;
  }
  logGlobalFrontendError("unhandledrejection", event.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
