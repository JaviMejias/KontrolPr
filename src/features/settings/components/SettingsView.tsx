import { useState } from "react";
import { BellRing, FolderGit2, Link2, SlidersHorizontal, UsersRound } from "lucide-react";
import type { LocalPreferences, Person, PullRequestSnapshot, UserRole } from "../../../types/domain";
import { ConnectionSettings } from "./ConnectionSettings";
import { RepositorySettings } from "./RepositorySettings";
import { NotificationSettings } from "./NotificationSettings";
import { DeveloperSettings } from "./DeveloperSettings";
import { PerspectiveSettings } from "./PerspectiveSettings";
import type { DirectoryLoader } from "../useDirectory";
import type { QaTeamControls } from "./QaTeamSettings";

interface Props extends QaTeamControls {
  preferences: LocalPreferences;
  onChange: (patch: Partial<LocalPreferences>) => void;
  pullRequests: PullRequestSnapshot[];
  user?: Person;
  connected: boolean;
  requiresLogin?: boolean;
  onConnect: (email: string, token: string, role: UserRole) => Promise<void>;
  onDisconnect: () => void;
  loading?: boolean;
  onLoadDirectory?: DirectoryLoader;
}

const tabs = [
  { id: "connection", label: "Conexión", icon: Link2, tone: "blue" },
  { id: "repositories", label: "Repositorios", icon: FolderGit2, tone: "lime" },
  { id: "developers", label: "Desarrolladores", icon: UsersRound, tone: "violet" },
  { id: "notifications", label: "Avisos", icon: BellRing, tone: "coral" },
];

export function SettingsView(props: Props) {
  const [tab, setTab] = useState("connection");
  const currentTab = !props.connected ? "connection" : tab;
  const { preferences, onChange } = props;
  return <div className="settings-view">
    <div className="view-intro settings-intro"><div><span className="eyebrow"><SlidersHorizontal size={12} />Tu espacio de trabajo</span><h2>Haz tuya la revisión.</h2><p>Tu conexión, tu equipo y las señales que quieres recibir.</p></div><span className={`soft-tag tone-${props.connected ? "lime" : "blue"}`}><span className="status-dot" />{props.connected ? "Cuenta conectada" : props.loading ? "Recuperando sesión…" : "Conexión requerida"}</span></div>
    {props.connected && <nav className="settings-tabs" aria-label="Secciones de configuración">{tabs.map((item) => { const Icon = item.icon; return <button className={`tone-${item.tone}`} key={item.id} aria-current={currentTab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}><Icon size={18} /><span>{item.label}</span>{item.id === "repositories" && <small>{preferences.repositories.length}</small>}</button>; })}</nav>}
    <div className="settings-tab-content" key={currentTab}>
      {currentTab === "connection" && <><ConnectionSettings {...props} />{props.connected && <PerspectiveSettings value={preferences.role} onChange={(role) => onChange({ role })} />}</>}
      {currentTab === "repositories" && <RepositorySettings repositories={preferences.repositories} onChange={(repositories) => onChange({ repositories })} connected={props.connected} />}
      {currentTab === "developers" && <DeveloperSettings preferences={preferences} pullRequests={props.pullRequests} user={props.user} onChange={onChange} loading={props.loading} onLoadDirectory={props.onLoadDirectory} qaTeamState={props.qaTeamState} onSaveQaTeam={props.onSaveQaTeam} onRefreshQaTeam={props.onRefreshQaTeam} />}
      {currentTab === "notifications" && <NotificationSettings preferences={preferences} onChange={onChange} />}
    </div>
  </div>;
}
