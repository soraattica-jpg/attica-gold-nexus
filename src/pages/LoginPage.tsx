import { useState } from "react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Phone, Crown, Shield, Headphones, ClipboardCheck } from "lucide-react";

const roles: { value: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "admin", label: "Admin", icon: <Shield className="w-6 h-6" />, desc: "Full access to all modules" },
  { value: "agent", label: "Agent", icon: <Headphones className="w-6 h-6" />, desc: "Call logs, stats & recordings" },
  { value: "qc", label: "Quality Control", icon: <ClipboardCheck className="w-6 h-6" />, desc: "Recordings, scoring & reports" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>("admin");

  const handleLogin = () => login(selectedRole);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-full bg-attica-gold flex items-center justify-center">
              <Crown className="w-5 h-5 text-foreground" />
            </div>
            <Phone className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Attica Gold Callcenter</h1>
          <p className="text-muted-foreground mt-1 text-sm">Select your role to continue</p>
        </div>

        <div className="bg-card border rounded-lg p-6 shadow-sm">
          <div className="space-y-3 mb-6">
            {roles.map((r) => (
              <button
                key={r.value}
                onClick={() => setSelectedRole(r.value)}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all btn-press ${
                  selectedRole === r.value
                    ? "border-attica-gold bg-attica-gold/5"
                    : "border-border hover:border-attica-butterscotch/50"
                }`}
              >
                <div className={`${selectedRole === r.value ? "text-attica-gold" : "text-muted-foreground"}`}>
                  {r.icon}
                </div>
                <div className="text-left">
                  <div className="font-medium text-foreground">{r.label}</div>
                  <div className="text-sm text-muted-foreground">{r.desc}</div>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={handleLogin}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium btn-press hover:opacity-90 transition-opacity"
          >
            Sign In
          </button>
        </div>
      </motion.div>
    </div>
  );
}
