import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, PhoneOff, Trophy, CalendarClock, PhoneCall, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DialerPanel from "@/components/DialerPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { topAgentTalkTime, useCallCenter } from "@/contexts/CallCenterContext";
import { agents } from "@/data/mockData";

export default function DashboardHome() {
  const { user } = useAuth();
  const { calls, hourlyCalls, followUps, prefillDialedNumber, followUpDueCount } = useCallCenter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setLoading(false), 700);
    return () => window.clearTimeout(timeout);
  }, []);

  const todayCalls = useMemo(() => calls.filter((call) => call.date === "2026-03-18"), [calls]);
  const answered = todayCalls.filter((call) => ["answered", "completed"].includes(call.status)).length;
  const missed = todayCalls.filter((call) => call.status === "missed").length;
  const activeCalls = todayCalls.filter((call) => ["active", "on-hold"].includes(call.status));
  const topAgents = agents.filter((agent) => agent.role === "agent").sort((a, b) => b.callsToday - a.callsToday).slice(0, 5);
  const myFollowUps = user?.role === "agent" ? followUps.filter((item) => item.agentId === user.id) : followUps;

  const kpis = [
    { label: "Total Calls Today", value: todayCalls.length },
    { label: "Answered", value: answered },
    { label: "Missed", value: missed },
    { label: "Active Now", value: activeCalls.length },
    { label: "Follow-Ups Due", value: followUpDueCount },
  ];

  if (loading) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Operations Overview</p>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back, {user?.name}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {kpis.map((item, index) => (
          <motion.div key={item.label} className="kpi-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="mt-4 text-4xl font-semibold">{item.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_420px]">
        <div className="surface-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Volume</p>
              <h2 className="text-xl font-semibold">Calls per hour</h2>
            </div>
            <div className="success-badge"><TrendingUp className="h-4 w-4" /> Stable flow</div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hourlyCalls}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 16 }} />
              <Bar dataKey="calls" fill="hsl(var(--accent))" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {user?.role === "agent" ? (
          <DialerPanel />
        ) : (
          <div className="surface-panel p-5">
            <div className="mb-4 flex items-center gap-2"><Trophy className="h-5 w-5 text-accent" /><h2 className="text-xl font-semibold">Top Agents</h2></div>
            <div className="space-y-3">
              {topAgents.map((agent, index) => (
                <div key={agent.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{agent.name}</p>
                    <p className="text-sm text-muted-foreground">{agent.callsToday} calls · {topAgentTalkTime(agent.id)}</p>
                  </div>
                  <div className="done-badge">{agent.avgHandleTime}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="surface-panel p-5">
          <div className="mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-destructive" /><h2 className="text-xl font-semibold">Live Calls Feed</h2></div>
          <div className="space-y-3">
            {activeCalls.map((call) => (
              <div key={call.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="font-medium">{call.customerName ?? call.callerName}</p>
                  <p className="text-sm text-muted-foreground">{call.agentName} · {call.branch}</p>
                </div>
                <div className="inline-flex items-center gap-2 text-sm">
                  <span className={`status-dot ${call.status === "active" ? "status-live" : "status-hold"}`} />
                  {call.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel p-5">
          <div className="mb-4 flex items-center gap-2"><PhoneOff className="h-5 w-5 text-destructive" /><h2 className="text-xl font-semibold">Missed Call Alerts</h2></div>
          <div className="space-y-3">
            {todayCalls.filter((call) => call.status === "missed").map((call) => (
              <div key={call.id} className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{call.customerName ?? call.callerName}</p>
                    <p className="text-sm text-muted-foreground">{call.callerId} · {call.branch}</p>
                  </div>
                  <button className="action-gold" onClick={() => prefillDialedNumber(call.callerId)}>
                    <PhoneCall className="h-4 w-4" />
                    Callback
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel p-5">
          <div className="mb-4 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-accent" /><h2 className="text-xl font-semibold">Today's Follow-Ups</h2></div>
          <div className="space-y-3">
            {myFollowUps.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.customerName}</p>
                    <p className="text-sm text-muted-foreground">{item.branch}</p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">{new Date(item.followUpAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
