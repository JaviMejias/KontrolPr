import { useId, useRef } from "react";
import { Search, X } from "lucide-react";

export function SearchInput({ value, onChange, label, placeholder }: { value: string; onChange: (value: string) => void; label: string; placeholder?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return <div className="search-input"><label className="sr-only" htmlFor={id}>{label}</label><Search size={17} aria-hidden="true" /><input id={id} ref={input} value={value} placeholder={placeholder ?? label} onChange={(event) => onChange(event.target.value)} />{value && <button type="button" aria-label={`Limpiar ${label.toLocaleLowerCase("es")}`} onClick={() => { onChange(""); input.current?.focus(); }}><X size={15} /></button>}</div>;
}
