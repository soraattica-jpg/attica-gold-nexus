import { useMemo, useState } from "react";
import AgentStatusBoardPage from "@/pages/AgentStatusBoardPage";
import StatusDashboardPage from "@/pages/StatusDashboardPage";

type BoardMode = "live-display" | "old-board";

const STORAGE_KEY = "attica_agent_status_board_mode";

function readInitialMode(): BoardMode {
  if (typeof window === "undefined") return "live-display";
  return window.sessionStorage.getItem(STORAGE_KEY) === "old-board" ? "old-board" : "live-display";
}

export default function AgentStatusBoardSwitcherPage() {
  const [mode, setMode] = useState<BoardMode>(() => readInitialMode());

  const buttons = useMemo(() => ([
    { key: "live-display" as const, label: "Live Display" },
    { key: "old-board" as const, label: "Old Board" },
  ]), []);

  const setBoardMode = (nextMode: BoardMode) => {
    setMode(nextMode);
    window.sessionStorage.setItem(STORAGE_KEY, nextMode);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <div className="absolute right-4 top-4 z-50 inline-flex rounded-full border border-white/15 bg-slate-950/85 p-1 shadow-xl backdrop-blur">
        {buttons.map((button) => (
          <button
            key={button.key}
            type="button"
            onClick={() => setBoardMode(button.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === button.key
                ? "bg-amber-400 text-slate-950"
                : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
          >
            {button.label}
          </button>
        ))}
      </div>

      <div className="h-full w-full overflow-hidden">
        {mode === "live-display" ? <StatusDashboardPage /> : <AgentStatusBoardPage />}
      </div>
    </div>
  );
}
