import { ReactNode, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Car,
  Headset,
  BarChart3,
  ClipboardList,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Shield,
  Wrench,
  User,
  Briefcase,
} from "lucide-react";
import { useAppStore, UserRole, ROLE_PERMISSIONS } from "@/store/useAppStore";

const NAV_ITEMS = [
  { path: "/", label: "排队工作台", icon: LayoutDashboard, roles: ["车主", "店员", "运维", "运营经理"] as UserRole[] },
  { path: "/queue", label: "车主排队", icon: Car, roles: ["车主", "店员", "运营经理"] as UserRole[] },
  { path: "/staff", label: "店员调度台", icon: Headset, roles: ["店员", "运维", "运营经理"] as UserRole[] },
  { path: "/operations", label: "运营看板", icon: BarChart3, roles: ["运营经理"] as UserRole[] },
  { path: "/orders", label: "订单管理", icon: ClipboardList, roles: ["店员", "运营经理"] as UserRole[] },
];

const ROLES: UserRole[] = ["车主", "店员", "运维", "运营经理"];

const ROLE_ICONS: Record<UserRole, typeof User> = {
  "车主": User,
  "店员": Headset,
  "运维": Wrench,
  "运营经理": Briefcase,
};

function Clock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const fmt = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-mono-num text-sm text-slate-300">
      {fmt(time.getHours())}:{fmt(time.getMinutes())}:{fmt(time.getSeconds())}
    </span>
  );
}

export default function Layout({ children }: { children?: ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, setActiveView, currentRole, setCurrentRole } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [roleOpen, setRoleOpen] = useState(false);

  useEffect(() => {
    setActiveView(location.pathname);
  }, [location.pathname, setActiveView]);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const visibleNav = NAV_ITEMS.filter(item => item.roles.includes(currentRole));
  const perms = ROLE_PERMISSIONS[currentRole];
  const RoleIcon = ROLE_ICONS[currentRole];

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-[var(--color-border)] bg-[var(--color-navy)] transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b border-[var(--color-border)]">
          {!sidebarCollapsed && (
            <span className="text-cyan-accent font-bold text-lg whitespace-nowrap">
              洗车工作台
            </span>
          )}
          {sidebarCollapsed && (
            <Car size={24} className="text-cyan-accent mx-auto" />
          )}
        </div>

        <nav className="flex-1 py-2 space-y-1 px-2">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-colors animate-fade-in-up ${
                  active
                    ? "bg-[var(--color-cyan-accent-dim)] text-cyan-accent"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon size={20} className="shrink-0" />
                {!sidebarCollapsed && (
                  <span className="whitespace-nowrap">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="border-t border-[var(--color-border)] p-3">
            <div className="rounded-lg bg-white/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield size={14} className="text-cyan-accent" />
                <span className="text-xs text-slate-400">当前权限</span>
              </div>
              <div className="text-xs text-slate-300 space-y-0.5 mt-2">
                {perms.canManageQueue && <div>• 叫号/队列管理</div>}
                {perms.canMarkFault && <div>• 标记故障</div>}
                {perms.canResolveFault && <div>• 故障修复确认</div>}
                {perms.canReleaseBay && <div>• 释放车位</div>}
                {perms.canViewOperations && <div>• 查看运营数据</div>}
                {perms.canManageOrders && <div>• 订单管理</div>}
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-[var(--color-border)] p-2">
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center w-full rounded-lg py-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronsRight size={20} />
            ) : (
              <ChevronsLeft size={20} />
            )}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-4 md:px-6 border-b border-[var(--color-border)] bg-[var(--color-navy)] shrink-0">
          <h1 className="text-base font-bold text-slate-100">
            自助洗车工作台
          </h1>
          <div className="flex items-center gap-4">
            <Clock />
            <div className="relative">
              <button
                onClick={() => setRoleOpen(!roleOpen)}
                className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 transition-colors"
              >
                <RoleIcon size={14} />
                {currentRole}
                <ChevronDown size={14} />
              </button>
              {roleOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setRoleOpen(false)}
                  />
                  <ul className="absolute right-0 mt-1 z-20 w-36 rounded-lg bg-[var(--color-navy-light)] border border-[var(--color-border)] shadow-lg py-1">
                    {ROLES.map((r) => {
                      const Icon = ROLE_ICONS[r];
                      return (
                        <li key={r}>
                          <button
                            onClick={() => {
                              setCurrentRole(r);
                              setRoleOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm transition-colors ${
                              r === currentRole
                                ? "text-cyan-accent bg-[var(--color-cyan-accent-dim)]"
                                : "text-slate-300 hover:bg-white/5"
                            }`}
                          >
                            <Icon size={14} />
                            {r}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 shadow-[inset_0_2px_8px_rgba(0,0,0,0.25)]">
          {children ?? <Outlet />}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-around h-14 border-t border-[var(--color-border)] bg-[var(--color-navy)]">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 py-1 text-[10px] transition-colors ${
                active ? "text-cyan-accent" : "text-slate-500"
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
