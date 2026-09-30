import React from "react";

type SectionErrorBoundaryProps = {
  children: React.ReactNode;
  title: string;
  description: string;
  resetKey?: string;
  floating?: boolean;
};

type SectionErrorBoundaryState = {
  hasError: boolean;
};

const CHUNK_RELOAD_KEY = "attica_chunk_reload_attempted";

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

const logFrontendSectionError = (
  props: SectionErrorBoundaryProps,
  error: Error,
  errorInfo: React.ErrorInfo,
) => {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      ...readStoredUserForErrorLog(),
      path: window.location.pathname,
      sectionTitle: props.title,
      errorName: error?.name || "",
      errorMessage: error?.message || String(error || ""),
      componentStack: errorInfo?.componentStack || "",
      userAgent: window.navigator.userAgent,
    };
    void fetch("/api/frontend-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Never let diagnostics create a second render failure.
  }
};

const isChunkLoadError = (error: Error) => {
  const message = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  return (
    message.includes("chunkloaderror") ||
    message.includes("loading chunk") ||
    message.includes("dynamically imported module")
  );
};

export default class SectionErrorBoundary extends React.Component<
SectionErrorBoundaryProps,
SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Dashboard section render failure:", error, errorInfo);
    logFrontendSectionError(this.props, error, errorInfo);
    if (typeof window !== "undefined" && isChunkLoadError(error)) {
      const currentUrl = window.location.href;
      const previousAttempt = window.sessionStorage.getItem(CHUNK_RELOAD_KEY);
      if (previousAttempt !== currentUrl) {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, currentUrl);
        window.location.reload();
      }
    }
  }

  componentDidUpdate(prevProps: SectionErrorBoundaryProps) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.floating) {
      return (
        <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm rounded-2xl border border-amber-500/30 bg-card/95 p-4 shadow-2xl backdrop-blur">
          <p className="text-sm font-semibold text-foreground">{this.props.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{this.props.description}</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="action-gold mt-3 w-full justify-center"
          >
            Retry Section
          </button>
        </div>
      );
    }

    return (
      <div className="surface-panel w-full p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Section Error</p>
        <p className="mt-3 text-lg font-semibold text-foreground">{this.props.title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{this.props.description}</p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="action-gold mt-5 justify-center"
        >
          Retry Section
        </button>
      </div>
    );
  }
}
