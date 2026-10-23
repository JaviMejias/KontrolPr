import { useId } from "react";
import { Check, LoaderCircle } from "lucide-react";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  tone?: "lime" | "blue" | "violet" | "coral";
  disabled?: boolean;
  busy?: boolean;
}

export function Switch({ checked, onCheckedChange, label, description, tone = "lime", disabled, busy }: SwitchProps) {
  const id = useId();
  return <div className={`switch-field tone-${tone}`}>
    <button type="button" className="switch-control" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-description` : undefined} aria-busy={busy || undefined} disabled={disabled || busy} onClick={() => onCheckedChange(!checked)}>
      <span className="switch-thumb" aria-hidden="true">{busy ? <LoaderCircle size={12} className="spin" /> : <Check size={12} />}</span>
    </button>
    <span className="switch-copy"><span id={`${id}-label`}>{label}</span>{description && <small id={`${id}-description`}>{description}</small>}</span>
  </div>;
}
