import { useState } from "react";
import { motion } from "framer-motion";
import { callRecords } from "@/data/mockData";
import { useAuth } from "@/contexts/AuthContext";
import { Phone, Play, Download, Search } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
};
const itemVariants = {
  hidden: { y: 8, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: "spring", bounce: 0 } },
};

const statusColors: Record<string, string> = {
  answered: "bg-green-100 text-green-700",
  missed: "bg-red-100 text-red-700",
  transferred: "bg-yellow-100 text-yellow-700",
  active: "bg-blue-100 text-blue-700",
  "on-hold": "bg-orange-100 text-orange-700",
  completed: "bg-muted text-muted-foreground",
};

interface CallsPageProps {
  direction: "incoming" | "outgoing";
}

export default function CallsPage({ direction }: CallsPageProps) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [playingId, setPlayingId] = useState<string | null>(null);

  let calls = callRecords.filter((c) => c.direction === direction);
  if (user?.role === "agent") calls = calls.filter((c) => c.agentId === user.id);
  if (search) {
    const s = search.toLowerCase();
    calls = calls.filter((c) => c.callerName.toLowerCase().includes(s) || c.callerId.includes(s) || c.agentName.toLowerCase().includes(s));
  }
  if (statusFilter !== "all") calls = calls.filter((c) => c.status === statusFilter);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Phone className="w-6 h-6 text-primary" />
          {direction === "incoming" ? "Incoming Calls" : "Outgoing Calls"}
        </h1>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search caller, agent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-attica-gold/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-attica-gold/50"
        >
          <option value="all">All Status</option>
          <option value="answered">Answered</option>
          <option value="missed">Missed</option>
          <option value="transferred">Transferred</option>
          <option value="active">Active</option>
          <option value="on-hold">On Hold</option>
          <option value="completed">Completed</option>
        </select>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants} className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Caller</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Time</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Duration</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Language</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Recording</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{call.callerName}</div>
                    <div className="text-xs font-mono text-muted-foreground">{call.callerId}</div>
                  </td>
                  <td className="px-4 py-3">{call.agentName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{call.time}</td>
                  <td className="px-4 py-3 font-mono text-xs">{call.duration}</td>
                  <td className="px-4 py-3 text-xs">{call.language}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[call.status] || ""}`}>
                      {(call.status === "active" || call.status === "on-hold") && (
                        <span className={`status-dot ${call.status === "active" ? "status-active" : "status-hold"} live-pulse`} />
                      )}
                      {call.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {call.hasRecording ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPlayingId(playingId === call.id ? null : call.id)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors btn-press text-primary"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-muted transition-colors btn-press text-muted-foreground">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No calls found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Inline Audio Player */}
        {playingId && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t p-4 bg-muted/30"
          >
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Playing: {playingId}</span>
              <div className="flex-1 flex items-end gap-0.5 h-8">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-attica-gold/60 rounded-t-sm"
                    style={{ height: `${Math.random() * 100}%`, minHeight: 2 }}
                  />
                ))}
              </div>
              <span className="text-xs font-mono text-muted-foreground">02:15 / 04:32</span>
              <button
                onClick={() => setPlayingId(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
