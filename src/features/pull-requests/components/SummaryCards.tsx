import { ArrowDownLeft, CircleAlert, Clock3, MessageSquare, Sparkles } from "lucide-react";
import type { PullRequestViewModel, SummaryFilter, UserRole } from "../../../types/domain";

export function SummaryCards({ pullRequests, role, selected = "", onSelect }: { pullRequests: PullRequestViewModel[]; role: UserRole; selected?: SummaryFilter; onSelect: (state: SummaryFilter) => void }) {
  const active = pullRequests.filter((pullRequest) => pullRequest.flowState !== "INACTIVE");
  const needsQa = active.filter((pullRequest) => pullRequest.nextOwner === "qa").length;
  const needsDeveloper = active.filter((pullRequest) => pullRequest.nextOwner === "developer").length;
  const stale = active.filter((pullRequest) => pullRequest.stale).length;
  const cards = role === "observer" ? [
    { label: "En curso", value: active.length, note: "PR activos", icon: Sparkles, tone: "signal", state: "active" },
    { label: "Esperando a QA", value: needsQa, note: "Código pendiente de revisión", icon: CircleAlert, tone: "warning", state: "qa" },
    { label: "Esperando al autor", value: needsDeveloper, note: "Observaciones abiertas", icon: MessageSquare, tone: "coral", state: "developer" },
    { label: "Sin avance", value: stale, note: "Más de 4 días", icon: Clock3, tone: "muted", state: "stale" },
  ] as const : [
    { label: role === "qa" ? "Requieren revisión" : "Requieren tu respuesta", value: role === "qa" ? needsQa : needsDeveloper, note: "La siguiente acción es tuya", icon: CircleAlert, tone: "warning", state: role === "qa" ? "qa" : "developer" },
    { label: "Actualizados", value: active.filter((pullRequest) => pullRequest.flowState === "UPDATED").length, note: "Cambio efectivo detectado", icon: ArrowDownLeft, tone: "blue", state: "updated" },
    { label: role === "developer" ? "Respondiste a QA" : "Respuestas del autor", value: active.filter((pullRequest) => pullRequest.flowState === "AUTHOR_RESPONDED").length, note: "Pendiente de seguimiento de QA", icon: MessageSquare, tone: "coral", state: "response" },
    { label: "En curso", value: active.length, note: "Todos los PR activos", icon: Sparkles, tone: "signal", state: "active" },
  ] as const;
  return <section className="summary-grid">{cards.map((card) => { const Icon = card.icon; return <button className={`summary-card summary-${card.tone}`} key={card.label} aria-pressed={selected === card.state} onClick={() => onSelect(selected === card.state ? "" : card.state)}><div className="summary-icon"><Icon size={18} /></div><div className="summary-copy"><span>{card.label}</span><strong>{card.value.toString().padStart(2, "0")}</strong><small>{card.note}</small></div><span className="summary-arrow" aria-hidden="true">↗</span></button>; })}</section>;
}
