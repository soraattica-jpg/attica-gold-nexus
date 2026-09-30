import { useState } from "react";
import { motion } from "framer-motion";
import { ClipboardCheck, Headphones, Phone, Shield, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { grantAgentStatusBoardAccess, isAgentStatusBoardCredential } from "@/lib/agentStatusBoardAuth";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { preloadRouteForPath } from "@/lib/routePreload";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [agentId, setAgentId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!agentId || !password) { setError("Enter Agent ID and Password"); return; }
    setLoading(true); setError("");

    if (isAgentStatusBoardCredential(agentId, password)) {
      grantAgentStatusBoardAccess();
      await preloadRouteForPath("/agent-status-board");
      setLoading(false);
      navigate("/agent-status-board");
      return;
    }

    const result = await login(agentId, password);
    if (!result.success) { setError(result.error || "Login failed"); setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--accent)/0.18),transparent_28%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.12),transparent_30%)]" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl lg:grid-cols-[1.1fr_520px]">
        <div className="premium-header header-glow flex flex-col justify-center p-10 text-primary-foreground">
          <div className="flex flex-col items-center text-center">
            <div className="mb-7 flex h-24 w-24 items-center justify-center rounded-2xl bg-white p-2 shadow-lg">
              <img src={BRAND_LOGO_SRC} alt="Attica Gold" className="h-full w-full rounded-xl object-contain" />
            </div>
            <h1 className="text-5xl font-semibold leading-tight">Attica Gold Company</h1>
            <p className="mt-3 text-2xl font-medium text-primary-foreground/85">Callcenter</p>
          </div>
          <div className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-card/20 bg-card/10 px-5 py-4 text-sm">
            <Phone className="h-5 w-5" /> SIP registered calls, gold rates, live queues, and role-based workflows.
          </div>
        </div>

        <div className="p-8 lg:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Secure Login</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to workspace</h2>

          <div className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Agent / Admin ID</label>
              <input value={agentId} onChange={e => setAgentId(e.target.value)}
                placeholder="e.g. AG001, ADMIN01, QC001"
                className="control-field w-full text-lg"
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="control-field w-full text-lg"
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { icon: <Shield className="h-5 w-5" />, label: "Admin", desc: "Full system access" },
              { icon: <Headphones className="h-5 w-5" />, label: "Agent", desc: "Dialer & calls" },
              { icon: <ClipboardCheck className="h-5 w-5" />, label: "QC", desc: "Reports & quality" },
            ].map((role) => (
              <div key={role.label} className="rounded-xl border border-border p-3 text-center">
                <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">{role.icon}</div>
                <div className="text-sm font-semibold">{role.label}</div>
                <div className="text-xs text-muted-foreground">{role.desc}</div>
              </div>
            ))}
          </div>

          {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

          <button onClick={handleLogin} disabled={loading}
            className="action-gold mt-6 w-full justify-center py-3 text-base">
            <LogIn className="h-4 w-4" />
            {loading ? "Connecting..." : "Sign In"}
          </button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Attica Gold Private Limited © 2026 — WebRTC Enabled
          </p>
        </div>
      </motion.div>
    </div>
  );
}
