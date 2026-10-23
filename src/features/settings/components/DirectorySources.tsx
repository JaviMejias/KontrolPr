import { FolderGit2, LoaderCircle, RefreshCw, UsersRound } from "lucide-react";
import type { RepositoryDirectory } from "../../../types/domain";
import { Button } from "../../../components/ui/Button";

export function DirectorySources({ entries, loading, error, onRefresh }: { entries: RepositoryDirectory[]; loading: boolean; error?: string; onRefresh: () => void }) {
  return <section className="directory-sources" aria-label="Origen de las personas" aria-busy={loading}>
    <div className="directory-source-heading"><span><UsersRound size={18} />Directorio de Bitbucket</span><Button disabled={loading} aria-busy={loading} onClick={onRefresh}>{loading ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}Actualizar personas</Button></div>
    {loading && <p role="status">Consultando personas, independientemente de los PR…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !entries.length && <p>Añade un repositorio para consultar su directorio.</p>}
    <ul>{entries.map((entry) => <li key={`${entry.repository.workspace}/${entry.repository.slug}`} className={`tone-${entry.source === "repository" ? "lime" : entry.source === "workspace" ? "blue" : "coral"}`}><div><FolderGit2 size={14} /><strong>{entry.repository.label}</strong><span className="soft-tag">{entry.source === "repository" ? "Accesos del repositorio" : entry.source === "workspace" ? "Miembros del workspace" : "Lista parcial de PR"}</span><small>{entry.people.length} cuentas del directorio</small></div>{entry.message && <p>{entry.message}</p>}</li>)}</ul>
  </section>;
}
