import { useCallback, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Phone,
  PhoneOutgoing,
  BarChart3,
  Users,
  Languages,
  Clock,
  Building2,
  BellRing,
  LogOut,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  PhoneForwarded,
  TrendingUp,
  Globe,
  Megaphone,
  PhoneMissed,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/contexts/AuthContext";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { formatRoleLabel } from "@/lib/roles";

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  roles: UserRole[];
}

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const navItems: NavItem[] = [
    { label: "Dashboard", path: "/", icon: <LayoutDashboard className="h-5 w-5" />, roles: ["admin", "superadmin", "agent", "qc"] },
    { label: "MD Dashboard", path: "/md-dashboard", icon: <BarChart3 className="h-5 w-5" />, roles: ["admin", "superadmin", "seo"] },
    { label: "Incoming Calls", path: "/calls/incoming", icon: <Phone className="h-5 w-5" />, roles: ["admin", "superadmin", "agent", "qc", "seo"] },
    { label: "Outgoing Calls", path: "/calls/outgoing", icon: <PhoneOutgoing className="h-5 w-5" />, roles: ["admin", "superadmin", "agent", "qc", "seo"] },
    { label: "Follow-Ups", path: "/agent/follow-ups", icon: <BellRing className="h-5 w-5" />, roles: ["agent"] },
    { label: "Reports", path: "/reports", icon: <BarChart3 className="h-5 w-5" />, roles: ["admin", "superadmin", "qc", "seo"] },
    { label: "User Management", path: "/admin/users", icon: <Users className="h-5 w-5" />, roles: ["admin", "superadmin"] },
    { label: "Languages", path: "/admin/languages", icon: <Languages className="h-5 w-5" />, roles: ["admin", "superadmin"] },
    { label: "Branch Management", path: "/admin/branches", icon: <Building2 className="h-5 w-5" />, roles: ["admin", "superadmin"] },
    { label: "Branches", path: "/branches", icon: <Building2 className="h-5 w-5" />, roles: ["agent"] },
    { label: "Shift Management", path: "/admin/shifts", icon: <Clock className="h-5 w-5" />, roles: ["admin", "superadmin"] },
    { label: "Incoming Call Queue", path: "/admin/incoming-call-queue", icon: <PhoneCall className="h-5 w-5" />, roles: ["admin", "superadmin"] },
    { label: "Missed Calls", path: "/admin/missed-calls", icon: <PhoneMissed className="h-5 w-5" />, roles: ["admin", "superadmin"] },
    { label: "Auto Dial", path: "/admin/auto-dial", icon: <PhoneCall className="h-5 w-5" />, roles: ["admin", "superadmin"] },
    { label: "Status Follow-Up", path: "/admin/status-follow-ups", icon: <PhoneCall className="h-5 w-5" />, roles: ["admin", "superadmin"] },
    { label: "Customer Data", path: "/admin/customer-data", icon: <TrendingUp className="h-5 w-5" />, roles: ["admin", "superadmin"] },
    { label: "SEO & Marketing", path: "/seo-marketing-leads", icon: <BarChart3 className="h-5 w-5" />, roles: ["superadmin", "seo"] },
    { label: "JustDial Lead", path: "/admin/justdial-leads", icon: <PhoneForwarded className="h-5 w-5" />, roles: ["admin", "superadmin", "seo"] },
    { label: "Website Lead", path: "/admin/website-leads", icon: <Globe className="h-5 w-5" />, roles: ["admin", "superadmin", "seo"] },
    { label: "Google Leads", path: "/admin/google-leads", icon: <TrendingUp className="h-5 w-5" />, roles: ["admin", "superadmin", "seo"] },
    { label: "Meta Leads", path: "/admin/meta-leads", icon: <Megaphone className="h-5 w-5" />, roles: ["admin", "superadmin", "seo"] },
    { label: "Blogs", path: "/admin/blog-leads", icon: <Globe className="h-5 w-5" />, roles: ["admin", "superadmin", "seo"] },
  ];

  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));
  const handleRouteClick = useCallback((event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.altKey
      || event.ctrlKey
      || event.shiftKey
    ) {
      return;
    }

    if (location.pathname === path) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    navigate(path);
  }, [location.pathname, navigate]);

  if (!user) return null;

  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <aside className={`${collapsed ? "w-16" : "w-72"} sticky top-0 flex h-screen min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300`}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 border-b border-sidebar-border px-3 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1">
            <img src={BRAND_LOGO_SRC} alt="Attica Gold" className="h-full w-full rounded-md object-contain" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold text-sidebar-foreground">Attica Gold</p>
              <p className="text-xs text-sidebar-foreground/60">Callcenter Suite</p>
            </div>
          )}
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
          {visibleItems.map((item) => {
            const link = (
              <Link
                key={item.path}
                to={item.path}
                onClick={(event) => {
                  handleRouteClick(event, item.path);
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive(item.path)
                    ? "sidebar-active font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                {!collapsed && (
                  <span className="truncate">{item.label}</span>
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

        <div className="shrink-0 space-y-2 border-t border-sidebar-border p-3">
          {!collapsed && (
            <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-sidebar-primary text-xs font-semibold text-sidebar-primary">
                {user.name.split(" ").map((part) => part[0]).join("")}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-sidebar-foreground">{user.name}</p>
                <p className="truncate text-xs capitalize text-sidebar-foreground/60">{formatRoleLabel(user.role)}</p>
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
