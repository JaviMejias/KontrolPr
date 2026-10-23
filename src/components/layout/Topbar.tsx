import { RefreshCw, Search } from "lucide-react";
import { useId } from "react";
import { Button } from "../ui/Button";
import { SyncStatus } from "../ui/SyncStatus";
import type { PullRequestViewModel, SyncState } from "../../types/domain";
import { NotificationCenter } from "../../features/notifications/NotificationCenter";
import { useSearchShortcut } from "./useSearchShortcut";

export function Topbar({ syncState, syncEnabled = true, onSync, query, onQueryChange, notifications, onOpenNotification, onReadAll, onSearchActivate, disabled, searchDisabled }: { syncState: SyncState; syncEnabled?: boolean; onSync: () => void; query: string; onQueryChange: (value: string) => void; notifications: PullRequestViewModel[]; onOpenNotification: (item: PullRequestViewModel) => void; onReadAll: () => void; onSearchActivate: () => void; disabled?: boolean; searchDisabled?: boolean }) {
  const search = useSearchShortcut();
  const searchId = useId();
  return <header className="topbar">
    <div className="topbar-title"><h1>Monitor de PR</h1></div>
    <div className="topbar-actions">
      <div className="search-field"><Search size={16} aria-hidden="true" /><label className="sr-only" htmlFor={searchId}>Buscar por título o PR</label><input id={searchId} ref={search} value={query} onFocus={onSearchActivate} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar PR..." disabled={searchDisabled} aria-keyshortcuts="Control+k Control+Alt+k" aria-describedby={`${searchId}-help`} /><kbd className="search-shortcut" aria-hidden="true" title="Alternativa: Ctrl + Alt + K">Ctrl + K</kbd><span id={`${searchId}-help`} className="sr-only">Buscar en Resumen con Ctrl + K. Alternativa: Ctrl + Alt + K, con el foco dentro de la página.</span>{query && <button type="button" aria-label="Limpiar búsqueda" className="search-clear" disabled={searchDisabled} onClick={() => { onQueryChange(""); search.current?.focus(); }}>×</button>}</div>
      <NotificationCenter items={notifications} onOpen={onOpenNotification} onReadAll={onReadAll} />
      <Button onClick={onSync} disabled={disabled || !syncEnabled || syncState.status === "syncing"} aria-busy={syncState.status === "syncing"}><RefreshCw size={16} className={syncState.status === "syncing" ? "spin" : ""} />{syncState.status === "syncing" ? "Sincronizando" : "Sincronizar"}</Button>
    </div>
    <SyncStatus state={syncState} enabled={syncEnabled} />
  </header>;
}
