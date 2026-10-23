import { Eye, GitPullRequest, Settings2, ShieldCheck, UserRound } from "lucide-react";
import type { UserRole } from "../../types/domain";

interface SidebarProps {
  role: UserRole;
  activeView: "overview" | "ignored" | "settings";
  connected: boolean;
  connectionLabel?: string;
  onViewChange: (view: SidebarProps["activeView"]) => void;
}

const roles: Record<UserRole, { label: string; icon: typeof ShieldCheck }> = { qa: { label: "QA", icon: ShieldCheck }, developer: { label: "Developer", icon: UserRound }, observer: { label: "Observador", icon: Eye } };

export function Sidebar({ role, activeView, onViewChange, connected, connectionLabel }: SidebarProps) {
  const roleData = roles[role];
  const RoleIcon = roleData.icon;
  return <aside className="sidebar">
    <div className="brand-lockup"><span className="brand-mark">K</span><span><strong>KontrolPR</strong><small>Pull Request Monitor</small></span></div>
    {connected && <div className="role-switch"><span className="eyebrow">Vista actual</span><div className="role-current"><RoleIcon size={16} /><span>{roleData.label}</span><span className="connection-dot" /></div></div>}
    {connected && <nav className="main-nav" aria-label="Navegación principal">
      <button className={activeView === "overview" ? "nav-item active" : "nav-item"} onClick={() => onViewChange("overview")}><GitPullRequest size={17} />Resumen</button>
      {role === "qa" && <button className={activeView === "ignored" ? "nav-item active" : "nav-item"} onClick={() => onViewChange("ignored")}><Eye size={17} />Ignorados</button>}
      <button className={activeView === "settings" ? "nav-item active" : "nav-item"} onClick={() => onViewChange("settings")}><Settings2 size={17} />Configuración</button>
    </nav>}
    <div className="sidebar-footer"><div className="connection-state"><span className="connection-dot" />{connectionLabel ?? (connected ? "Bitbucket conectado" : "Inicia sesión para continuar")}</div><span className="mono-caption">LOCAL-FIRST / v0.1</span></div>
  </aside>;
}
