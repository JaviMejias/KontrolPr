import { Clock3, PauseCircle, WifiOff } from "lucide-react";
import type { SyncState } from "../../types/domain";
import { formatDateTime } from "../../lib/formatting";

const clock = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" });

export function SyncStatus({ state, enabled = true }: { state: SyncState; enabled?: boolean }) {
  if (!enabled) return <div className="sync-strip" role="status"><PauseCircle size={13} aria-hidden="true" />Sin repositorios. Añade uno en Configuración para activar la sincronización.</div>;
  const next = state.nextSyncAt ? new Date(state.nextSyncAt) : undefined;
  const scheduled = next && Number.isFinite(next.getTime()) && state.status !== "syncing";
  return <div className="sync-strip" role="status">
    <span className="sync-result">{state.status === "error" ? <><WifiOff size={14} aria-hidden="true" />Actualización incompleta · {state.message}</> : <><span className="sync-live-dot" />{state.status === "syncing" ? "Consultando Bitbucket" : state.source === "cache" ? "Datos recuperados de este navegador" : "Última consulta"}: {formatDateTime(state.lastSyncedAt)} · Solo lectura{state.message && ` · ${state.message}`}</>}</span>
    {scheduled && <span className="sync-schedule" title="Hora local. La consulta automática se realiza con la app visible; si está cerrada o suspendida, se consulta al volver."><Clock3 size={12} aria-hidden="true" />{state.status === "error" ? "Próximo intento" : "Próxima consulta"}: <time dateTime={next.toISOString()}>{clock.format(next)}</time><span className="sync-schedule-note">· app visible</span></span>}
  </div>;
}
