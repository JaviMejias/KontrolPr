import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PanelHeading({ icon: Icon, title, description, tone = "blue", accessory }: { icon: LucideIcon; title: string; description: string; tone?: "lime" | "blue" | "violet" | "coral"; accessory?: ReactNode }) {
  return <div className={`panel-heading tone-${tone}`}><span className="panel-icon"><Icon size={21} strokeWidth={1.75} /></span><div><h3>{title}</h3><p>{description}</p></div>{accessory}</div>;
}
