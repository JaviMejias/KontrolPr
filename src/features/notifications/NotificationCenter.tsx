import { Bell, CheckCheck } from "lucide-react";
import type { PullRequestViewModel } from "../../types/domain";

export function NotificationCenter({ items, onOpen, onReadAll }: { items: PullRequestViewModel[]; onOpen: (item: PullRequestViewModel) => void; onReadAll: () => void }) {
  return <details className="notification-center" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
    <summary className="icon-button notification-button" aria-label={`Notificaciones: ${items.length} PR sin leer`}><Bell size={18} />{items.length > 0 && <span className="notification-count">{items.length}</span>}</summary>
    <section className="notification-panel" aria-label="Notificaciones">
      <div className="section-heading"><strong>Notificaciones</strong>{items.length > 0 && <button type="button" onClick={onReadAll}><CheckCheck size={15} />Marcar leídas</button>}</div>
      <p>Un aviso por PR, aunque tenga varios comentarios nuevos.</p>
      {items.length === 0 ? <p role="status">Estás al día. No hay novedades sin leer.</p> : items.map((item) => <button className="notification-item" key={item.key} onClick={(event) => { onOpen(item); event.currentTarget.closest("details")?.removeAttribute("open"); }}><small>{item.repository.label} · PR-{item.id}</small><strong>{item.title}</strong><span>{item.lastRelevantActor?.displayName ?? item.author.displayName} · {item.flowLabel}</span></button>)}
    </section>
  </details>;
}
