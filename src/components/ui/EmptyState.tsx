import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

export function EmptyState({ title, description, icon: Icon = Sparkles, action }: { title: string; description: string; icon?: LucideIcon; action?: ReactNode }) {
  return <section className="empty-state designed-empty">
    <div className="empty-orbit" aria-hidden="true"><span /><span /><span /><div><Icon size={28} strokeWidth={1.5} /></div></div>
    <h3>{title}</h3><p>{description}</p>{action && <div className="empty-action">{action}</div>}
  </section>;
}
