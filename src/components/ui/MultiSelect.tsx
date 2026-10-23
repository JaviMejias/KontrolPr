import { useState } from "react";
import type { Person } from "../../types/domain";
import { UsersRound } from "lucide-react";
import { Switch } from "./Switch";
import { FilterPopover } from "./FilterPopover";
import { SearchInput } from "./SearchInput";
import { Avatar } from "./Avatar";

export function MultiSelect({ people, selected, onChange }: { people: Person[]; selected: string[]; onChange: (value: string[]) => void }) {
  const [query, setQuery] = useState("");
  const uniquePeople = [...new Map(people.map((person) => [person.accountId, person])).values()];
  const selectedIds = new Set(selected);
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  const filtered = uniquePeople.filter((person) => normalize(`${person.displayName} ${person.nickname ?? ""}`).includes(normalize(query)));
  return <FilterPopover label="Autores" summary={selected.length ? `${selected.length} autores seleccionados` : "Todos los autores"} searchable><>
    <div className="author-search"><SearchInput label="Buscar autores" value={query} onChange={setQuery} placeholder="Nombre o alias…" /></div>
    <button className="all-authors-option" type="button" onClick={() => { onChange([]); setQuery(""); }}><UsersRound size={15} />Todos los autores<span>{uniquePeople.length}</span></button>
    <div className="author-options">{filtered.map((person) => <div className="author-option" key={person.accountId}><Avatar person={person} size="md" /><Switch label={person.displayName} tone="blue" checked={selectedIds.has(person.accountId)} onCheckedChange={(checked) => onChange(checked ? [...new Set([...selected, person.accountId])] : selected.filter((id) => id !== person.accountId))} /></div>)}{!filtered.length && <p className="author-no-results" role="status">No hay autores que coincidan.</p>}</div>
    <div className="author-selection-count" aria-live="polite">{selected.length ? `${selected.length} seleccionados` : "Todos los autores incluidos"}</div>
  </></FilterPopover>;
}
