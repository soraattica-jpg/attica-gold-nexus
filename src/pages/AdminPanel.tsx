import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Clock, Languages, Save, ShieldCheck, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useCallCenter } from "@/contexts/CallCenterContext";
import { agents, allLanguages, allShifts, qcGroups } from "@/data/mockData";

const tabs = [
  { label: "User Management", icon: <Users className="h-4 w-4" /> },
  { label: "Languages", icon: <Languages className="h-4 w-4" /> },
  { label: "QC Groups", icon: <UserCheck className="h-4 w-4" /> },
  { label: "Branches", icon: <Building2 className="h-4 w-4" /> },
  { label: "Shifts", icon: <Clock className="h-4 w-4" /> },
];

export default function AdminPanel({ initialTab = 0 }: { initialTab?: number }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [newBranch, setNewBranch] = useState({ name: "", city: "" });
  const { branches, addBranch, updateBranch } = useCallCenter();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Administration</p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight"><ShieldCheck className="h-6 w-6 text-accent" />Admin Panel</h1>
      </div>

      <div className="surface-panel p-2"><div className="flex flex-wrap gap-2">{tabs.map((tab, i) => <button key={tab.label} onClick={() => setActiveTab(i)} className={activeTab === i ? "action-gold" : "action-outline"}>{tab.icon}{tab.label}</button>)}</div></div>

      {activeTab === 0 && <div className="surface-panel overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/60 text-left text-muted-foreground"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{agents.map((agent) => <tr key={agent.id} className="border-t border-border"><td className="px-4 py-3 font-medium">{agent.name}</td><td className="px-4 py-3">{agent.email}</td><td className="px-4 py-3 capitalize">{agent.role}</td><td className="px-4 py-3"><span className={agent.status === "active" ? "success-badge" : agent.status === "on-break" ? "warning-badge" : "done-badge"}>{agent.status}</span></td><td className="px-4 py-3"><button className="action-outline" onClick={() => toast.success(`${agent.name} saved`)}>Edit</button></td></tr>)}</tbody></table></div>}

      {activeTab === 1 && <div className="surface-panel overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/60 text-left text-muted-foreground"><tr><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Languages</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{agents.filter((agent) => agent.role === "agent").map((agent) => <tr key={agent.id} className="border-t border-border"><td className="px-4 py-3 font-medium">{agent.name}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{allLanguages.slice(0, 6).map((language) => <span key={language} className={agent.languages.includes(language) ? "success-badge" : "done-badge"}>{language}</span>)}</div></td><td className="px-4 py-3"><button className="action-outline" onClick={() => toast.success(`Languages updated for ${agent.name}`)}><Save className="h-4 w-4" />Save</button></td></tr>)}</tbody></table></div>}

      {activeTab === 2 && <div className="grid gap-4 md:grid-cols-2">{qcGroups.map((group) => <div key={group.id} className="surface-panel p-5"><h2 className="text-lg font-semibold">{group.name}</h2><p className="mt-1 text-sm text-muted-foreground">Reviewer: {group.reviewerName} · Target: {group.reviewTarget}/day</p><div className="mt-4 flex flex-wrap gap-2">{group.agentIds.map((id) => <span key={id} className="done-badge">{agents.find((agent) => agent.id === id)?.name}</span>)}</div></div>)}</div>}

      {activeTab === 3 && <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]"><div className="surface-panel p-5"><h2 className="mb-4 text-lg font-semibold">Add Branch</h2><div className="space-y-3"><input className="control-field" placeholder="Branch name" value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} /><input className="control-field" placeholder="City" value={newBranch.city} onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })} /><button className="action-gold w-full justify-center" onClick={() => { addBranch(newBranch.name, newBranch.city); setNewBranch({ name: "", city: "" }); }}><Building2 className="h-4 w-4" />Add Branch</button></div></div><div className="surface-panel overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/60 text-left text-muted-foreground"><tr><th className="px-4 py-3">Branch</th><th className="px-4 py-3">City</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{branches.map((branch) => <tr key={branch.id} className="border-t border-border"><td className="px-4 py-3 font-medium">{branch.name}</td><td className="px-4 py-3">{branch.city}</td><td className="px-4 py-3"><button className="action-outline" onClick={() => updateBranch(branch.id, branch.name, branch.city)}>Save</button></td></tr>)}</tbody></table></div></div>}

      {activeTab === 4 && <div className="surface-panel overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/60 text-left text-muted-foreground"><tr><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Hours</th></tr></thead><tbody>{agents.filter((agent) => agent.role === "agent").map((agent) => <tr key={agent.id} className="border-t border-border"><td className="px-4 py-3 font-medium">{agent.name}</td><td className="px-4 py-3"><select className="control-field max-w-xs" defaultValue={agent.shift} onChange={() => toast.success(`Shift updated for ${agent.name}`)}>{allShifts.map((shift) => <option key={shift}>{shift}</option>)}</select></td><td className="px-4 py-3">{agent.shift}</td></tr>)}</tbody></table></div>}
    </motion.div>
  );
}
