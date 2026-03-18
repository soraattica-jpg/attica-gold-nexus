import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard, Phone, PhoneOutgoing, BarChart3, Users,
  Languages, UserCheck, Clock, LogOut, Crown, ChevronLeft, ChevronRight
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: <LayoutDashboard className="w-5 h-5" />, roles: ["admin", "agent", "qc"] },
  { label: "Incoming Calls", path: "/calls/incoming", icon: <Phone className="w-5 h-5" />, roles: ["admin", "agent", "qc"] },
  { label: "Outgoing Calls", path: "/calls/outgoing", icon: <PhoneOutgoing className="w-5 h-5" />, roles: ["admin", "agent"] },
  { label: "Reports", path: "/reports", icon: <BarChart3 className="w-5 h-5" />, roles: ["admin", "qc"] },
  { label: "User Management", path: "/admin/users", icon: <Users className="w-5 h-5" />, roles: ["admin"] },
  { label: "Languages", path: "/admin/languages", icon: <Languages className="w-5 h-5" />, roles: ["admin"] },
  { label: "QC Groups", path: "/admin/qc-groups", icon: <UserCheck className="w-5 h-5" />, roles: ["admin"] },
  { label: "Shift Management", path: "/admin/shifts", icon: <Clock className="w-5 h-5" />, roles: ["admin"] },
];

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return null;

  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-64"} min-h-screen flex flex-col transition-all duration-200`}
      style={{ backgroundColor: "hsl(var(--attica-sidebar))" }}
    >
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-full bg-attica-gold flex items-center justify-center flex-shrink-0">
          <Crown className="w-4 h-4 text-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-semibold text-sidebar-foreground truncate">Attica Gold</div>
            <div className="text-xs text-sidebar-foreground/60 truncate">Callcenter</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm ${
                isActive
                  ? "sidebar-link-active text-attica-gold font-medium"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-attica-gold flex items-center justify-center text-xs font-semibold text-attica-gold flex-shrink-0">
              {user.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div className="overflow-hidden">
              <div className="text-sm text-sidebar-foreground truncate">{user.name}</div>
              <div className="text-xs text-sidebar-foreground/50 capitalize">{user.role}</div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>Sign Out</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
