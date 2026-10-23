import { Filter, RotateCcw } from "lucide-react";
import type { Person, RepositoryConfig, UserRole } from "../../../types/domain";
import { MultiSelect } from "../../../components/ui/MultiSelect";
import { FilterSelect } from "../../../components/ui/FilterSelect";
import { repositoryKey } from "../../settings/services/tracking";
import { Button } from "../../../components/ui/Button";
import { initialFiltersForRole, type FilterState } from "../types";

export function FilterBar({ filters, onChange, onReset, repositories, authors, role }: { filters: FilterState; onChange: (filters: FilterState) => void; onReset?: () => void; repositories: RepositoryConfig[]; authors: Person[]; role: UserRole }) {
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) => onChange({ ...filters, [key]: value });
  return <section className="filter-bar" aria-label="Filtros de pull requests">
    <div className="filter-label"><Filter size={15} /><span>Filtrar vista</span><small>{role === "observer" ? "Lectura general" : role === "qa" ? "Cola de QA" : "Mis revisiones"}</small></div>
    <FilterSelect label="Repositorio" value={filters.repository} onChange={(value) => update("repository", value)} options={[{ value: "all", label: "Todos los repositorios" }, ...repositories.map((repository) => ({ value: repositoryKey(repository), label: repository.label }))]} />
    <div className="filter-field"><span className="filter-field-label">Autores</span><MultiSelect people={authors} selected={filters.authors} onChange={(value) => update("authors", value)} /></div>
    <FilterSelect<FilterState["activity"]> label="Actividad" value={filters.activity} onChange={(value) => update("activity", value)} options={[{ value: "all", label: "Cualquier actividad" }, { value: "attention", label: "Requiere atención" }, { value: "stale", label: "Sin actividad · 4+ días" }]} />
    <FilterSelect<FilterState["status"]> label="Estado" value={filters.status} onChange={(value) => update("status", value)} options={[{ value: "active", label: "Activos" }, { value: "all", label: "Todos los consultados" }, { value: "inactive", label: "Finalizados · 30 días" }]} />
    <Button variant="ghost" onClick={onReset ?? (() => onChange(initialFiltersForRole(role)))}><RotateCcw size={14} />Limpiar</Button>
  </section>;
}
