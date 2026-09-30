import React from "react";
import {
  clearSessionStorageKeysByPrefix,
  removeSessionStorageItem,
} from "@/lib/browserStorage";
const RECOVERY_SESSION_KEYS = [
  "attica_break",
  "attica_followup",
  "attica_chunk_reload_attempted",
  "attica_intake_save_in_progress",
  "attica_intake_save_pending_reload",
];
const RECOVERY_SESSION_PREFIXES = [
  "attica_intake_draft:",
];

const readStoredUserForErrorLog = () => {
  if (typeof window === "undefined") return {};
  try {
    const storedUser = window.sessionStorage.getItem("attica_user");
    if (!storedUser) return {};
    const parsed = JSON.parse(storedUser) as {
      id?: unknown;
      name?: unknown;
      role?: unknown;
    };
    return {
      agentId: typeof parsed.id === "string" ? parsed.id : "",
      agentName: typeof parsed.name === "string" ? parsed.name : "",
      userRole: typeof parsed.role === "string" ? parsed.role : "",
    };
  } catch {
    return {};
  }
};

const logAppRenderError = (error: Error, errorInfo: React.ErrorInfo) => {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/frontend-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...readStoredUserForErrorLog(),
        path: window.location.pathname,
        sectionTitle: "Application render failure",
        errorName: error?.name || "",
        errorMessage: error?.message || String(error || ""),
        componentStack: errorInfo?.componentStack || "",
        userAgent: window.navigator.userAgent,
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Never let diagnostics create another render failure.
  }
};

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export default class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidMount() {
    this.clearRecoveryFlagIfHealthy();
  }

  componentDidUpdate() {
    this.clearRecoveryFlagIfHealthy();
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Application render failure:", error, errorInfo);
    logAppRenderError(error, errorInfo);
    this.clearRecoverableState();
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  handleResetAndRetry = () => {
    this.clearRecoverableState();
    this.setState({ hasError: false });
  };

  clearRecoveryFlagIfHealthy() {
    if (this.state.hasError) return;
  }

  clearRecoverableState() {
    RECOVERY_SESSION_KEYS.forEach((key) => {
      removeSessionStorageItem(key);
    });
    clearSessionStorageKeysByPrefix(RECOVERY_SESSION_PREFIXES);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Application Error</p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">Something broke on this screen.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Recoverable local state was cleared. Try rendering the app again, and only clear the local session if this screen still comes back.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={this.handleRetry}
              className="action-gold w-full justify-center"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleResetAndRetry}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent hover:text-accent-foreground"
            >
              Clear Local Session
            </button>
          </div>
        </div>
      </div>
    );
  }
}
