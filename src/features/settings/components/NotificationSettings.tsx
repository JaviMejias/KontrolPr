import { useState } from "react";
import { AlertTriangle, BellRing, CircleCheck, Clock3, Play, Sparkles, Volume2 } from "lucide-react";
import type { LocalPreferences } from "../../../types/domain";
import { enableSound, playNotificationSound, showSystemNotification } from "../../notifications/service";
import { Button } from "../../../components/ui/Button";
import { Switch } from "../../../components/ui/Switch";
import { PanelHeading } from "../../../components/ui/PanelHeading";

export function NotificationSettings({ preferences, onChange }: { preferences: LocalPreferences; onChange: (patch: Partial<LocalPreferences>) => void }) {
  const [feedback, setFeedback] = useState<{ message: string; warning: boolean }>();
  const setStatus = (message: string, warning = false) => setFeedback({ message, warning });
  const [pending, setPending] = useState<"notifications" | "sound" | "test">();
  const changeNotifications = async (enabled: boolean) => {
    if (!enabled) { onChange({ notificationsEnabled: false }); setStatus("Notificaciones desactivadas."); return; }
    if (!("Notification" in window) || !window.isSecureContext) { setStatus("Este navegador necesita HTTPS o localhost para activar notificaciones.", true); return; }
    setPending("notifications");
    try { const permission = await Notification.requestPermission(); onChange({ notificationsEnabled: permission === "granted" }); setStatus(permission === "granted" ? "Notificaciones activadas." : "Permiso no concedido. Puedes cambiarlo en los ajustes del navegador.", permission !== "granted"); } catch { setStatus("El navegador no permitió activar notificaciones. En iPhone puede requerir instalar la app en la pantalla de inicio.", true); } finally { setPending(undefined); }
  };
  const changeSound = async (enabled: boolean) => {
    if (!enabled) { onChange({ soundEnabled: false }); setStatus("Sonido desactivado."); return; }
    setPending("sound");
    try { await enableSound(); onChange({ soundEnabled: true }); playNotificationSound(); setStatus("Sonido activado para esta sesión."); } catch { setStatus("El navegador no permitió activar el sonido.", true); } finally { setPending(undefined); }
  };
  return <section className="settings-card notifications-panel"><PanelHeading icon={BellRing} title="Enterarte, sin el ruido" description="Un aviso por PR, aunque lleguen varios comentarios. Tú eliges cómo recibirlo." tone="coral" />
    <div className="notification-options"><div className={`notification-option ${preferences.notificationsEnabled ? "is-enabled" : ""}`}><span className="panel-icon tone-blue"><BellRing size={23} /></span><div><h4>Notificaciones del navegador</h4><p>Una señal cuando tus PR tengan novedades.</p><span className={`soft-tag tone-${preferences.notificationsEnabled ? "lime" : "blue"}`}><span className="status-dot" />{preferences.notificationsEnabled ? "Activadas" : "A tu elección"}</span></div><Switch label="Notificaciones del navegador" checked={preferences.notificationsEnabled} tone="blue" busy={pending === "notifications"} disabled={Boolean(pending)} onCheckedChange={(value) => void changeNotifications(value)} /></div>
      <div className={`notification-option ${preferences.soundEnabled ? "is-enabled" : ""}`}><span className="panel-icon tone-violet"><Volume2 size={23} /></span><div><h4>Un sonido discreto</h4><p>Un toque breve al detectar cambios nuevos.</p><span className={`soft-tag tone-${preferences.soundEnabled ? "violet" : "blue"}`}><span className="status-dot" />{preferences.soundEnabled ? "Activado" : "Silenciado"}</span></div><Switch label="Sonido de notificaciones" checked={preferences.soundEnabled} tone="violet" busy={pending === "sound"} disabled={Boolean(pending)} onCheckedChange={(value) => void changeSound(value)} /></div></div>
    <div className="notification-preview"><span className="preview-bell"><BellRing size={23} /></span><div><span className="eyebrow">Así se siente una novedad</span><strong>Un pequeño aviso. Todo bajo control.</strong><p>Prueba el sonido y, si diste permiso, la notificación del navegador.</p></div><Button disabled={Boolean(pending)} onClick={async () => { setPending("test"); try { await enableSound(); playNotificationSound(); await showSystemNotification(1); setStatus("Prueba enviada. La notificación del sistema requiere permiso del navegador."); } catch { setStatus("No se pudo emitir la prueba en este navegador.", true); } finally { setPending(undefined); } }}><Play size={15} />Probar aviso y sonido</Button></div>
    <div className={`notification-feedback ${feedback?.warning ? "is-warning" : ""}`} role="status">{feedback ? <>{feedback.warning ? <AlertTriangle size={16} /> : <CircleCheck size={16} />}{feedback.message}</> : <><Sparkles size={16} />Los avisos sin leer siempre estarán en la campana.</>}</div>
    <div className="panel-footnote"><Clock3 size={15} /><span>Se consulta cada diez minutos o al volver a la app. El navegador puede pausarla en segundo plano y pedir reactivar el sonido al recargar.</span></div>
  </section>;
}
