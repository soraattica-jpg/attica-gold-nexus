import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Filter, Phone, Play, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter } from "@/contexts/CallCenterContext";

interface CallsPageProps {
  direction: "incoming" | "outgoing";
}

export default function CallsPage({ direction }: CallsPageProps) {
  const { user } = useAuth();
  const { calls, branches, addFollowUp, prefillDialedNumber } = useCallCenter();
  const [filters, setFilters] = useState({ search: "", status: "all", language: "all", branch: "all", date: "2026-03-18", agent: "all" });
  const [playingId, setPlayingId] = useState<string | null>(null);

  const visibleCalls = useMemo(() => {
    let next = calls.filter((call) => call.direction === direction);
    if (user?.role === "agent") next = next.filter((call) => call.agentId === user.id);
    if (filters.search) {
      const term = filters.search.toLowerCase();
      next = next.filter((call) => [call.callerId, call.callerName, call.customerName, call.agentName, call.branch].some((value) => value?.toLowerCase().includes(term)));
    }
    if (filters.status !== "all") next = next.filter((call) => call.status === filters.status);
    if (filters.language !== "all") next = next.filter((call) => call.language === filters.language);
    if (filters.branch !== "all") next = next.filter((call) => call.branch === filters.branch);
    if (filters.agent !== "all") next = next.filter((call) => call.agentName === filters.agent);
    if (filters.date) next = next.filter((call) => call.date === filters.date);
    return next;
  }, [calls, direction, filters, user]);

  const languages = Array.from(new Set(calls.map((call) => call.language)));
  const agents = Array.from(new Set(calls.map((call) => call.agentName)));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Call Management</p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight"><Phone className="h-6 w-6 text-accent" />{direction === "incoming" ? "Incoming Calls" : "Outgoing Calls"}</h1>
      </div>

      <div className="surface-panel p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Filter className="h-4 w-4 text-accent" />Filters</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input className="control-field" placeholder="Search number, customer, branch" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <input className="control-field" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
          <select className="control-field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">All status</option><option value="answered">Answered</option><option value="missed">Missed</option><option value="transferred">Transferred</option><option value="active">Active</option><option value="on-hold">On Hold</option><option value="completed">Completed</option></select>
          <select className="control-field" value={filters.language} onChange={(e) => setFilters({ ...filters, language: e.target.value })}><option value="all">All languages</option>{languages.map((language) => <option key={language}>{language}</option>)}</select>
          <select className="control-field" value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}><option value="all">All branches</option>{branches.map((branch) => <option key={branch.id}>{branch.name}</option>)}</select>
          <select className="control-field" value={filters.agent} onChange={(e) => setFilters({ ...filters, agent: e.target.value })}><option value="all">All agents</option>{agents.map((agent) => <option key={agent}>{agent}</option>)}</select>
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Caller</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Recording</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleCalls.map((call) => (
                <tr key={call.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{call.customerName ?? call.callerName}</div>
                    <div className="text-xs text-muted-foreground">{call.callerId} · {call.purpose}</div>
                  </td>
                  <td className="px-4 py-3">{call.branch}</td>
                  <td className="px-4 py-3">{call.agentName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{call.time}</td>
                  <td className="px-4 py-3 font-mono text-xs">{call.duration}</td>
                  <td className="px-4 py-3"><span className={call.status === "missed" ? "danger-badge" : call.status === "active" ? "live-badge" : call.status === "on-hold" ? "warning-badge" : "done-badge"}>{call.status}</span></td>
                  <td className="px-4 py-3">{call.hasRecording ? <div className="flex gap-2"><button className="action-outline" onClick={() => setPlayingId(playingId === call.id ? null : call.id)}><Play className="h-4 w-4" />Play</button><button className="action-outline"><Download className="h-4 w-4" />Download</button></div> : "—"}</td>
                  <td className="px-4 py-3"><div className="flex gap-2"><button className="action-outline" onClick={() => prefillDialedNumber(call.callerId)}>Callback</button><button className="action-gold" onClick={() => addFollowUp({ customerName: call.customerName ?? call.callerName, phone: call.callerId, branch: call.branch ?? branches[0]?.name ?? "", followUpAt: "2026-03-18T18:00", notes: `Follow-up from ${call.id}`, callId: call.id })}><Plus className="h-4 w-4" />Follow-Up</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {playingId && (
          <div className="border-t border-border bg-muted/30 p-4">
            <div className="mb-2 text-sm font-medium">Recording player · {playingId}</div>
            <div className="flex h-10 items-end gap-1">{Array.from({ length: 48 }).map((_, i) => <div key={i} className="flex-1 rounded-t bg-accent/60" style={{ height: `${12 + ((i * 17) % 70)}%` }} />)}</div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
