import { motion } from "framer-motion";
import { BarChart3, Download } from "lucide-react";
import { agents, callsPerHour, weeklyVolume, callRecords } from "@/data/mockData";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area,
} from "recharts";
import { useState } from "react";
import { toast } from "sonner";

const itemV = {
  hidden: { y: 10, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: "spring" as const, bounce: 0 } },
} as const;

const tabs = ["Agent Performance", "Time Statistics", "User Statistics", "Missed Calls"];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const agentList = agents.filter((a) => a.role === "agent");
  const missedCalls = callRecords.filter((c) => c.status === "missed");

  const handleExport = (format: string) => {
    toast.success(`${tabs[activeTab]} exported as ${format}`);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Reports
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport("PDF")} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted btn-press flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={() => handleExport("CSV")} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted btn-press flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm transition-colors relative ${
              activeTab === i ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
            {activeTab === i && (
              <motion.div layoutId="tab-line" className="absolute bottom-0 left-0 right-0 h-0.5 bg-attica-gold" />
            )}
          </button>
        ))}
      </div>

      {/* Agent Performance */}
      {activeTab === 0 && (
        <motion.div variants={itemV} initial="hidden" animate="visible" className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Calls Today</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Avg Handle Time</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Missed</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Languages</th>
              </tr>
            </thead>
            <tbody>
              {agentList.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 font-mono">{a.callsToday}</td>
                  <td className="px-4 py-3 font-mono">{a.avgHandleTime}</td>
                  <td className="px-4 py-3 font-mono">{a.missedCalls}</td>
                  <td className="px-4 py-3 text-xs">{a.languages.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Time Statistics */}
      {activeTab === 1 && (
        <motion.div variants={itemV} initial="hidden" animate="visible" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border rounded-lg p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Hourly Call Volume</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={callsPerHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} />
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--attica-butterscotch))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--attica-butterscotch))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="calls" stroke="hsl(var(--attica-gold))" fill="url(#areaGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border rounded-lg p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Weekly Volume</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weeklyVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} />
                <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* User Statistics */}
      {activeTab === 2 && (
        <motion.div variants={itemV} initial="hidden" animate="visible" className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Login Time</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Active Duration</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Break Time</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {agentList.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.loginTime}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.activeDuration}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.breakTime}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      a.status === "active" ? "bg-green-100 text-green-700" : a.status === "on-break" ? "bg-yellow-100 text-yellow-700" : "bg-muted text-muted-foreground"
                    }`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Missed Calls */}
      {activeTab === 3 && (
        <motion.div variants={itemV} initial="hidden" animate="visible" className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Caller</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Time</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Language</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Callback</th>
              </tr>
            </thead>
            <tbody>
              {missedCalls.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.callerName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.callerId}</td>
                  <td className="px-4 py-3">{c.agentName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.time}</td>
                  <td className="px-4 py-3 text-xs">{c.language}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-primary">Pending</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </motion.div>
  );
}
