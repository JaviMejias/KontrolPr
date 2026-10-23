import { Check, Eye, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import type { UserRole } from "../../../types/domain";

const roles = [
  { id: "qa", label: "QA", description: "Detectar cambios y revisar al equipo", icon: ShieldCheck },
  { id: "developer", label: "Desarrollador", description: "Seguir mis PR y respuestas", icon: UserRound },
  { id: "observer", label: "Observador", description: "Consultar el progreso general", icon: Eye },
] as const;

export function PerspectiveSettings({ value, onChange, disabled, invalid, required }: { value?: UserRole; onChange: (value: UserRole) => void; disabled?: boolean; invalid?: boolean; required?: boolean }) {
  return <section className="perspective-panel"><div className="perspective-heading"><span className="panel-icon tone-violet"><SlidersHorizontal size={19} /></span><div><h3>¿Desde dónde revisas?</h3><p>Elige el foco de tu bandeja. Los permisos los define Bitbucket.</p></div></div>
    <div className="role-options" role="radiogroup" aria-label="Tu perspectiva" aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={invalid ? "connection-error" : undefined}>{roles.map((role) => { const Icon = role.icon; return <label className={`role-card ${value === role.id ? "selected" : ""}`} key={role.id}><input className="sr-only" type="radio" name="perspective" aria-label={role.label} checked={value === role.id} disabled={disabled} onChange={() => onChange(role.id)} /><Icon size={20} /><strong>{role.label}</strong><small>{role.description}</small><span className="role-check"><Check size={12} /></span></label>; })}</div>
  </section>;
}
