import { useId } from "react";
import { Check } from "lucide-react";
import { FilterPopover } from "./FilterPopover";

export interface FilterOption<T extends string> { value: T; label: string }

export function FilterSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: FilterOption<T>[]; onChange: (value: T) => void }) {
  const name = useId();
  const selected = options.find((option) => option.value === value);
  return <div className="filter-field"><span className="filter-field-label">{label}</span><FilterPopover label={label} summary={selected?.label ?? label}><fieldset className="filter-radio-options"><legend className="sr-only">{label}</legend>{options.map((option) => <label className="filter-radio-option" key={option.value}><input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span><Check size={14} aria-hidden="true" /></label>)}</fieldset></FilterPopover></div>;
}
