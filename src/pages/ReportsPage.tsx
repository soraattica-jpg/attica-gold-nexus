import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, FileBarChart } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useCallCenter } from "@/contexts/CallCenterContext";
import { agents, weeklyVolume } from "@/data/mockData";

const tabs = ["Agent Performance", "Time Statistics", "User Statistics", "Missed Calls", "Branch Enquiry"];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const { calls, heatmap } = useCallCenter();
  const missedCalls = calls.filter((call) => call.status === "missed");
  const branchData = useMemo(() => Object.entries(calls.reduce<Record<string, number>>((acc, call) => { acc[call.branch ?? "Unknown"] = (acc[call.branch ?? "Unknown"] ?? 0) + 1; return acc; }, {})).map(([branch, total]) => ({ branch, total })), [calls]);
  const exportFile = (type: string) => toast.success(`${tabs[activeTab]} exported as ${type}`);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Reporting Suite</p>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight"><FileBarChart className="h-6 w-6 text-accent" />Reports</h1>
        </div>
        <div className="flex gap-2"><button className="action-outline" onClick={() => exportFile("PDF")}><Download className="h-4 w-4" />PDF</button><button className="action-gold" onClick={() => exportFile("CSV")}><Download className="h-4 w-4" />CSV</button></div>
      </div>

      <div className="surface-panel p-2"><div className="flex flex-wrap gap-2">{tabs.map((tab, i) => <button key={tab} onClick={() => setActiveTab(i)} className={activeTab === i ? "action-gold" : "action-outline"}>{tab}</button>)}</div></div>

      {activeTab === 0 && <div className="surface-panel overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/60 text-left text-muted-foreground"><tr><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Calls</th><th className="px-4 py-3">Avg Handle</th><th className="px-4 py-3">Missed</th><th className="px-4 py-3">Talk Time</th></tr></thead><tbody>{agents.filter((a) => a.role === "agent").map((agent) => <tr key={agent.id} className="border-t border-border"><td className="px-4 py-3 font-medium">{agent.name}</td><td className="px-4 py-3">{agent.callsToday}</td><td className="px-4 py-3">{agent.avgHandleTime}</td><td className="px-4 py-3">{agent.missedCalls}</td><td className="px-4 py-3">{agent.activeDuration}</td></tr>)}</tbody></table></div>}

      {activeTab === 1 && <div className="grid gap-6 xl:grid-cols-2"><div className="surface-panel p-5"><h2 className="mb-4 text-xl font-semibold">Weekly Line Chart</h2><ResponsiveContainer width="100%" height={260}><LineChart data={weeklyVolume}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" /><YAxis stroke="hsl(var(--muted-foreground))" /><Tooltip /><Line type="monotone" dataKey="calls" stroke="hsl(var(--primary))" strokeWidth={3} /></LineChart></ResponsiveContainer></div><div className="surface-panel p-5"><h2 className="mb-4 text-xl font-semibold">Daily Heatmap</h2><div className="space-y-2">{heatmap.map((row) => <div key={row.slot} className="grid grid-cols-8 gap-2 text-xs"><div className="flex items-center text-muted-foreground">{row.slot}</div>{(["mon","tue","wed","thu","fri","sat","sun"] as const).map((day) => <div key={day} className="flex h-10 items-center justify-center rounded-lg" style={{ background: `hsl(var(--accent) / ${0.12 + row[day] * 0.08})` }}>{row[day]}</div>)}</div>)}</div></div></div>}

      {activeTab === 2 && <div className="surface-panel overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/60 text-left text-muted-foreground"><tr><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Login</th><th className="px-4 py-3">Active Duration</th><th className="px-4 py-3">Break</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{agents.filter((a) => a.role === "agent").map((agent) => <tr key={agent.id} className="border-t border-border"><td className="px-4 py-3 font-medium">{agent.name}</td><td className="px-4 py-3">{agent.loginTime}</td><td className="px-4 py-3">{agent.activeDuration}</td><td className="px-4 py-3">{agent.breakTime}</td><td className="px-4 py-3"><span className={agent.status === "active" ? "success-badge" : agent.status === "on-break" ? "warning-badge" : "done-badge"}>{agent.status}</span></td></tr>)}</tbody></table></div>}

      {activeTab === 3 && <div className="surface-panel overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/60 text-left text-muted-foreground"><tr><th className="px-4 py-3">Caller</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Callback</th><th className="px-4 py-3">Follow-Up</th></tr></thead><tbody>{missedCalls.map((call) => <tr key={call.id} className="border-t border-border"><td className="px-4 py-3 font-medium">{call.customerName ?? call.callerName}</td><td className="px-4 py-3">{call.callerId}</td><td className="px-4 py-3">{call.branch}</td><td className="px-4 py-3">{call.callbackStatus}</td><td className="px-4 py-3">{call.followUpFlag ? "Flagged" : "—"}</td></tr>)}</tbody></table></div>}

      {activeTab === 4 && <div className="surface-panel p-5"><h2 className="mb-4 text-xl font-semibold">Branch-wise Enquiry Report</h2><ResponsiveContainer width="100%" height={300}><AreaChart data={branchData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="branch" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} /><YAxis stroke="hsl(var(--muted-foreground))" /><Tooltip /><Area type="monotone" dataKey="total" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.2)" strokeWidth={3} /></AreaChart></ResponsiveContainer><div className="mt-6 grid gap-4 md:grid-cols-2">{branchData.map((item) => <div key={item.branch} className="rounded-xl border border-border p-4"><div className="text-sm text-muted-foreground">{item.branch}</div><div className="mt-2 text-3xl font-semibold">{item.total}</div></div>)}</div></div>}
    </motion.div>
  );
}
