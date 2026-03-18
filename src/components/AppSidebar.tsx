import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Phone,
  PhoneOutgoing,
  BarChart3,
  Users,
  Languages,
  UserCheck,
  Clock,
  Building2,
  BellRing,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Crown,
  PhoneCall,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter } from "@/contexts/CallCenterContext";

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  roles: Array<"admin" | "agent" | "qc">;
  badge?: number;
}

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const { followUps } = useCallCenter();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const pendingForAgent = user ? followUps.filter((item) => item.agentId === user.id && item.status === "Pending").length : 0;

  const navItems: NavItem[] = [
    { label: "Dashboard", path: "/", icon: <LayoutDashboard className="h-5 w-5" />, roles: ["admin", "agent", "qc"] },
    { label: "Incoming Calls", path: "/calls/incoming", icon: <Phone className="h-5 w-5" />, roles: ["admin", "agent", "qc"] },
    { label: "Outgoing Calls", path: "/calls/outgoing", icon: <PhoneOutgoing className="h-5 w-5" />, roles: ["admin", "agent", "qc"] },
    { label: "Follow-Ups", path: "/agent/follow-ups", icon: <BellRing className="h-5 w-5" />, roles: ["agent"], badge: pendingForAgent },
    { label: "Reports", path: "/reports", icon: <BarChart3 className="h-5 w-5" />, roles: ["admin", "qc"] },
    { label: "User Management", path: "/admin/users", icon: <Users className="h-5 w-5" />, roles: ["admin"] },
    { label: "Languages", path: "/admin/languages", icon: <Languages className="h-5 w-5" />, roles: ["admin"] },
    { label: "QC Groups", path: "/admin/qc-groups", icon: <UserCheck className="h-5 w-5" />, roles: ["admin"] },
    { label: "Branch Management", path: "/admin/branches", icon: <Building2 className="h-5 w-5" />, roles: ["admin"] },
    { label: "Shift Management", path: "/admin/shifts", icon: <Clock className="h-5 w-5" />, roles: ["admin"] },
  ];

  if (!user) return null;

  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));
  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));

  return (
    <aside className={`${collapsed ? "w-16" : "w-72"} min-h-screen border-r border-sidebar-border bg-sidebar transition-all duration-300`}>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Crown className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold text-sidebar-foreground">Attica Gold</p>
              <p className="text-xs text-sidebar-foreground/60">Callcenter Suite</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {visibleItems.map((item) => {
            const link = (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive(item.path)
                    ? "sidebar-active font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.badge ? <span className="live-badge ml-auto">{item.badge}</span> : null}
                  </>
                )}
              </Link>
            );

            return collapsed ? (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-sidebar-border p-4">
          {!collapsed && (
            <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-sidebar-primary text-xs font-semibold text-sidebar-primary">
                {user.name.split(" ").map((part) => part[0]).join("")}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-sidebar-foreground">{user.name}</p>
                <p className="truncate text-xs capitalize text-sidebar-foreground/60">{user.role}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={logout} className="inline-flex items-center gap-2 text-sm text-sidebar-foreground/70 transition hover:text-sidebar-primary">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </button>
            <button onClick={() => setCollapsed((prev) => !prev)} className="text-sidebar-foreground/60 transition hover:text-sidebar-primary" aria-label="Toggle sidebar">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {!collapsed && (
            <div className="inline-flex items-center gap-1 text-xs text-sidebar-foreground/55">
              <PhoneCall className="h-3.5 w-3.5" />
              Premium center operations
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
