import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Languages, UserCheck, Clock, Plus, Edit, Save } from "lucide-react";
import { agents, allLanguages, allShifts, qcGroups, Agent, QCGroup } from "@/data/mockData";
import { toast } from "sonner";

const tabs = [
  { label: "User Management", icon: <Users className="w-4 h-4" /> },
  { label: "Language Assignment", icon: <Languages className="w-4 h-4" /> },
  { label: "QC Groups", icon: <UserCheck className="w-4 h-4" /> },
  { label: "Shift Management", icon: <Clock className="w-4 h-4" /> },
];

interface AdminPanelProps {
  initialTab?: number;
}

export default function AdminPanel({ initialTab = 0 }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [agentData, setAgentData] = useState<Agent[]>([...agents]);

  const handleSave = (msg: string) => toast.success(msg);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>

      <div className="flex gap-1 border-b">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm flex items-center gap-2 transition-colors relative ${
              activeTab === i ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon} {tab.label}
            {activeTab === i && <motion.div layoutId="admin-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-attica-gold" />}
          </button>
        ))}
      </div>

      {/* User Management */}
      {activeTab === 0 && (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <span className="text-sm font-medium">{agentData.length} users</span>
            <button className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg btn-press flex items-center gap-1.5 hover:opacity-90">
              <Plus className="w-3.5 h-3.5" /> Add User
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agentData.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{a.email}</td>
                  <td className="px-4 py-3 capitalize text-xs">{a.role}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      a.status === "active" ? "bg-green-100 text-green-700" : a.status === "on-break" ? "bg-yellow-100 text-yellow-700" : "bg-muted text-muted-foreground"
                    }`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleSave(`${a.name} updated`)} className="p-1.5 rounded hover:bg-muted btn-press text-muted-foreground hover:text-foreground">
                      <Edit className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Language Assignment */}
      {activeTab === 1 && (
        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assigned Languages</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agentData.filter((a) => a.role === "agent").map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {a.languages.map((l) => (
                        <span key={l} className="px-2 py-0.5 text-xs rounded-full bg-attica-gold/10 text-attica-gold border border-attica-gold/20">{l}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleSave(`Languages updated for ${a.name}`)} className="px-3 py-1 text-xs border rounded-md hover:bg-muted btn-press flex items-center gap-1">
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* QC Groups */}
      {activeTab === 2 && (
        <div className="space-y-4">
          {qcGroups.map((g) => (
            <div key={g.id} className="bg-card border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium">{g.name}</h3>
                  <p className="text-sm text-muted-foreground">Reviewer: {g.reviewerName} · Target: {g.reviewTarget} reviews/day</p>
                </div>
                <button onClick={() => handleSave(`${g.name} updated`)} className="p-1.5 rounded hover:bg-muted btn-press text-muted-foreground">
                  <Edit className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.agentIds.map((aid) => {
                  const agent = agents.find((a) => a.id === aid);
                  return agent ? (
                    <span key={aid} className="px-3 py-1 text-xs border rounded-full bg-muted">{agent.name}</span>
                  ) : null;
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shift Management */}
      {activeTab === 3 && (
        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Current Shift</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agentData.filter((a) => a.role === "agent").map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-sm">{a.shift}</td>
                  <td className="px-4 py-3">
                    <select
                      defaultValue={a.shift}
                      onChange={() => handleSave(`Shift updated for ${a.name}`)}
                      className="px-2 py-1 text-xs border rounded-md bg-card focus:outline-none"
                    >
                      {allShifts.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
