import { useId, useState } from "react";
import { Check, LoaderCircle, UserRound } from "lucide-react";
import type { Person } from "../../types/domain";
import { Avatar } from "./Avatar";
import { FilterPopover } from "./FilterPopover";
import { SearchInput } from "./SearchInput";

interface Props {
  label: string;
  people: Person[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
}

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

export function PersonSelect({ label, people, value, onChange, loading = false }: Props) {
  const name = useId();
  const [query, setQuery] = useState("");
  const profiles = [...new Map(people.filter((person) => person.accountId).map((person) => [person.accountId, person])).values()];
  const selected = profiles.find((person) => person.accountId === value);
  const filtered = profiles.filter((person) => normalize(`${person.displayName} ${person.nickname ?? ""} ${person.accountId}`).includes(normalize(query.trim())));

  return <div className="person-select"><FilterPopover label={label} summary={selected?.displayName ?? "Selecciona una cuenta"} searchable matchTriggerWidth leading={selected ? <Avatar person={selected} /> : <UserRound size={17} aria-hidden="true" />}>
    <div className="author-search"><SearchInput label={`Buscar cuenta para ${label}`} placeholder="Buscar por nombre o alias…" value={query} onChange={setQuery} /></div>
    <fieldset className="filter-radio-options person-options"><legend className="sr-only">Cuenta de Bitbucket para {label}</legend>
      <label className="filter-radio-option person-option"><input type="radio" name={name} value="" checked={!value} onChange={() => onChange("")} /><UserRound size={18} aria-hidden="true" /><span>Sin vincular</span><Check size={15} aria-hidden="true" /></label>
      {filtered.map((person) => <label className="filter-radio-option person-option" key={person.accountId}><input type="radio" name={name} value={person.accountId} checked={value === person.accountId} onChange={() => onChange(person.accountId)} /><Avatar person={person} /><span><strong>{person.displayName}</strong><small>{person.nickname ? `@${person.nickname}` : "Cuenta de Bitbucket"}</small></span><Check size={15} aria-hidden="true" /></label>)}
    </fieldset>
    {!filtered.length && <p className="author-no-results" role="status">{query ? "No hay cuentas que coincidan con tu búsqueda." : loading ? "Buscando personas en los PR…" : "No hay cuentas cargadas. Sincroniza tus repositorios."}</p>}
    <div className="author-selection-count" role="status">{loading ? <><LoaderCircle size={13} className="spin" aria-hidden="true" />Cargando personas…</> : `${profiles.length} cuentas disponibles`}</div>
  </FilterPopover></div>;
}
