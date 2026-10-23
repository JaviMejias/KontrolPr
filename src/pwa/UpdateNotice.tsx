import { useSyncExternalStore } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { applyUpdate, getUpdateState, subscribeToUpdates } from "./register-sw";

export function UpdateNotice() {
  const state = useSyncExternalStore(subscribeToUpdates, getUpdateState, getUpdateState);
  if (state.phase === "idle") return null;
  const pending = state.phase === "applying";
  return <aside className="update-notice" aria-label="Actualización de KontrolPR">
    <span className="update-icon">{pending ? <LoaderCircle size={22} className="spin" /> : <Download size={22} />}</span>
    <div role="status"><strong>{pending ? "Preparando la nueva versión…" : "Nueva versión disponible"}</strong><p>{state.message ?? "Actualiza la aplicación sin borrar tu sesión ni tus preferencias. Se recargarán las pestañas abiertas de KontrolPR."}</p></div>
    <Button variant="primary" onClick={() => void applyUpdate()} disabled={pending} aria-busy={pending}><RefreshCw size={15} />{pending ? "Actualizando…" : state.phase === "error" ? "Reintentar" : "Actualizar ahora"}</Button>
  </aside>;
}
