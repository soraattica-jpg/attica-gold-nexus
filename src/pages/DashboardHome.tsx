import { motion } from "framer-motion";
import { Phone, PhoneOff, Clock, TrendingUp, Activity, Award } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { callRecords, callsPerHour, agents } from "@/data/mockData";
import { useAuth } from "@/contexts/AuthContext";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
} as const;
const itemVariants = {
  hidden: { y: 10, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: "spring" as const, bounce: 0 } },
} as const;

export default function DashboardHome() {
  const { user } = useAuth();
  const todayCalls = callRecords.filter((c) => c.date === "2026-03-18");
  const answered = todayCalls.filter((c) => c.status === "answered" || c.status === "completed").length;
  const missed = todayCalls.filter((c) => c.status === "missed").length;
  const activeCalls = todayCalls.filter((c) => c.status === "active" || c.status === "on-hold");
  const agentList = agents.filter((a) => a.role === "agent");
  const topAgents = [...agentList].sort((a, b) => b.callsToday - a.callsToday).slice(0, 5);
  const missedCallsList = todayCalls.filter((c) => c.status === "missed");

  const kpis = [
    { label: "Total Calls Today", value: todayCalls.length, icon: <Phone className="w-5 h-5" />, pulse: true },
    { label: "Answered", value: answered, icon: <TrendingUp className="w-5 h-5" /> },
    { label: "Missed", value: missed, icon: <PhoneOff className="w-5 h-5" />, alert: missed > 0 },
    { label: "Avg Handle Time", value: "04:22", icon: <Clock className="w-5 h-5" /> },
  ];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-semibold tracking-tight">Operational Overview</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {user?.name}</p>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi-card">
            {kpi.pulse && (
              <div className="absolute top-3 right-3">
                <span className="status-dot bg-attica-gold live-pulse" />
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              {kpi.icon}
              <span className="text-sm">{kpi.label}</span>
            </div>
            <div className={`text-4xl font-medium font-mono ${kpi.alert ? "text-primary" : "text-foreground"}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calls per Hour Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-2 bg-card border rounded-lg p-5">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Calls Per Hour</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={callsPerHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }}
              />
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--attica-butterscotch))" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="hsl(var(--attica-gold))" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <Bar dataKey="calls" fill="url(#barGrad)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Top Agents Leaderboard */}
        <motion.div variants={itemVariants} className="bg-card border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-attica-gold" />
            <h2 className="text-sm font-medium text-muted-foreground">Top Agents</h2>
          </div>
          <div className="space-y-3">
            {topAgents.map((agent, i) => (
              <div key={agent.id} className="flex items-center gap-3">
                <span className="w-5 text-xs font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <div className="w-7 h-7 rounded-full border-2 border-attica-gold flex items-center justify-center text-xs font-semibold text-attica-gold">
                  {agent.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{agent.name}</div>
                  <div className="text-xs text-muted-foreground">{agent.callsToday} calls</div>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{agent.avgHandleTime}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Calls Feed */}
        <motion.div variants={itemVariants} className="bg-card border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-muted-foreground">Live Calls</h2>
            <span className="status-dot bg-green-500 live-pulse ml-1" />
          </div>
          {activeCalls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active calls</p>
          ) : (
            <div className="space-y-2">
              {activeCalls.map((call) => (
                <div key={call.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border">
                  <div>
                    <div className="text-sm font-medium">{call.callerName}</div>
                    <div className="text-xs font-mono text-muted-foreground">{call.callerId}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{call.agentName}</div>
                    <div className="flex items-center gap-1.5">
                      <span className={`status-dot ${call.status === "active" ? "status-active" : "status-hold"}`} />
                      <span className="text-xs capitalize text-muted-foreground">{call.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Missed Call Alerts */}
        <motion.div variants={itemVariants} className="bg-card border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <PhoneOff className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-muted-foreground">Missed Call Alerts</h2>
          </div>
          {missedCallsList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No missed calls</p>
          ) : (
            <div className="space-y-2">
              {missedCallsList.map((call) => (
                <div key={call.id} className="flex items-center justify-between p-3 rounded-md border border-primary/10 bg-primary/5">
                  <div>
                    <div className="text-sm font-medium">{call.callerName}</div>
                    <div className="text-xs font-mono text-muted-foreground">{call.callerId}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">{call.time}</div>
                    <span className="text-xs font-medium text-primary">Callback required</span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-2">{missedCallsList.length} missed calls require callback.</p>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
