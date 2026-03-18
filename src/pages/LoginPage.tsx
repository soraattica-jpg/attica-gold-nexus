import { useState } from "react";
import { motion } from "framer-motion";
import { ClipboardCheck, Crown, Headphones, Phone, Shield } from "lucide-react";
import { useAuth, type UserRole } from "@/contexts/AuthContext";

const roles: { value: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "admin", label: "Admin", icon: <Shield className="h-6 w-6" />, desc: "Full access to operations, users, branches, and reports" },
  { value: "agent", label: "Agent", icon: <Headphones className="h-6 w-6" />, desc: "Own calls, dialer, incoming forms, recordings, and follow-ups" },
  { value: "qc", label: "QC", icon: <ClipboardCheck className="h-6 w-6" />, desc: "Recordings, quality scoring, and agent reporting" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>("admin");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--accent)/0.18),transparent_28%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.12),transparent_30%)]" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl lg:grid-cols-[1.1fr_520px]">
        <div className="premium-header header-glow flex flex-col justify-between p-10 text-primary-foreground">
          <div>
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-card/20 bg-card/10 px-4 py-2 text-sm">
              <Crown className="h-4 w-4" /> Attica Gold Callcenter
            </div>
            <h1 className="max-w-lg text-5xl font-semibold leading-tight">Premium financial call-center command for gold, silver, and branch enquiries.</h1>
            <p className="mt-4 max-w-xl text-base text-primary-foreground/80">Live operations, dialer controls, recordings, follow-ups, reporting, and branch performance in one polished workspace.</p>
          </div>
          <div className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-card/20 bg-card/10 px-5 py-4 text-sm">
            <Phone className="h-5 w-5" /> Gold rates, silver rates, live call queues, and role-based workflows.
          </div>
        </div>

        <div className="p-8 lg:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Role Login</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Select your workspace</h2>
          <div className="mt-8 space-y-4">
            {roles.map((role) => (
              <button key={role.value} onClick={() => setSelectedRole(role.value)} className={`w-full rounded-2xl border p-5 text-left transition ${selectedRole === role.value ? "border-accent bg-accent/10 shadow-[0_0_0_1px_hsl(var(--accent)/0.3)]" : "border-border hover:bg-muted/50"}`}>
                <div className="flex items-start gap-4">
                  <div className={`rounded-xl p-3 ${selectedRole === role.value ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"}`}>{role.icon}</div>
                  <div>
                    <div className="text-lg font-semibold">{role.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{role.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => login(selectedRole)} className="action-gold mt-8 w-full justify-center py-3 text-base">Sign In</button>
        </div>
      </motion.div>
    </div>
  );
}
