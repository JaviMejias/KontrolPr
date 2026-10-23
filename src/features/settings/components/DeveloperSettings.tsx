import { useState } from "react";
import { Eye, EyeOff, FolderGit2, ShieldCheck, UsersRound } from "lucide-react";
import type { LocalPreferences, Person, PullRequestSnapshot } from "../../../types/domain";
import { Avatar } from "../../../components/ui/Avatar";
import { Switch } from "../../../components/ui/Switch";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PanelHeading } from "../../../components/ui/PanelHeading";
import { SearchInput } from "../../../components/ui/SearchInput";
import { Pagination } from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { developerKey, discoverDevelopers, repositoryKey } from "../services/tracking";
import { setDeveloperFollowing } from "../services/developer-preferences";
import { effectiveQaIds } from "../../../config/qa-users";
import { personMatches } from "../../../lib/review-revision";
import { QaTeamSettings } from "./QaTeamSettings";
import type { QaTeamControls } from "./QaTeamSettings";
import { DirectorySources } from "./DirectorySources";
import { useDirectory, type DirectoryLoader } from "../useDirectory";

export function DeveloperSettings({ preferences, pullRequests, onChange, user, loading = false, onLoadDirectory, ...qaTeam }: QaTeamControls & { preferences: LocalPreferences; pullRequests: PullRequestSnapshot[]; onChange: (patch: Partial<LocalPreferences>) => void; user?: Person; loading?: boolean; onLoadDirectory?: DirectoryLoader }) {
  const [query, setQuery] = useState("");
  const [repository, setRepository] = useState("all");
  const [page, setPage] = useState(0);
  const remote = useDirectory(onLoadDirectory, preferences.repositories.map(repositoryKey).sort().join("|"));
  const entries = new Map(remote.entries.flatMap((entry) => entry.people.map((person) => [developerKey(entry.repository, person.accountId), { person, repository: entry.repository, source: entry.source }] as const)));
  for (const entry of discoverDevelopers(pullRequests)) {
    const key = developerKey(entry.repository, entry.person.accountId);
    entries.set(key, { ...entry, source: entries.get(key)?.source === "repository" ? "repository" : "unavailable" });
  }
  const directory = [...entries.values()].sort((a, b) => a.person.displayName.localeCompare(b.person.displayName, "es"));
  const personCount = new Set(directory.map((entry) => entry.person.accountId)).size;
  const people = directory.filter((entry) => (repository === "all" || repositoryKey(entry.repository) === repository) && entry.person.displayName.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")));
  const pageCount = Math.max(1, Math.ceil(people.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  const excludedIds = new Set(preferences.ignoredDeveloperIds);
  const excludedKeys = new Set(preferences.ignoredRepositoryDeveloperKeys);
  const qaIds = new Set(effectiveQaIds(preferences));
  return <>{onLoadDirectory && <DirectorySources entries={remote.entries} loading={remote.loading} error={remote.error} onRefresh={remote.refresh} />}<QaTeamSettings {...qaTeam} people={[...(user ? [user] : []), ...directory.map((entry) => entry.person)]} loading={remote.loading || loading} /><section className="settings-card developer-panel">
    <PanelHeading icon={UsersRound} title="Tu equipo, a tu medida" description="Configura el seguimiento por repositorio. Una persona puede aparecer en varios." tone="violet" accessory={<span className="soft-tag tone-violet"><UsersRound size={13} />{personCount} {personCount === 1 ? "persona" : "personas"}</span>} />
    <div className="directory-filters"><SearchInput label="Buscar persona" placeholder="Buscar por nombre…" value={query} onChange={(value) => { setQuery(value); setPage(0); }} /><label className="repository-filter"><FolderGit2 size={16} /><span className="sr-only">Repositorio del equipo</span><select value={repository} onChange={(event) => { setRepository(event.target.value); setPage(0); }}><option value="all">Todos los repositorios</option>{preferences.repositories.map((repo) => <option value={repositoryKey(repo)} key={repositoryKey(repo)}>{repo.label}</option>)}</select></label></div>
    {(loading || remote.loading) && directory.length === 0 ? <TableSkeleton variant="directory" label="Cargando desarrolladores" /> : people.length === 0 ? <EmptyState icon={UsersRound} title="Todavía no hay personas en esta vista" description={query ? "Prueba con otro nombre o repositorio." : "Consulta el estado del directorio y los permisos de tu token. Los PR también aportan personas a esta lista."} /> : <>
      <ul className="directory-table" aria-label="Desarrolladores por repositorio">{people.slice(currentPage * 10, currentPage * 10 + 10).map(({ person, repository: repo, source }) => {
        const key = developerKey(repo, person.accountId);
        const following = !excludedIds.has(person.accountId) && !excludedKeys.has(key);
        const isQa = personMatches(person, qaIds);
        return <li className={`directory-row developer-row ${following ? "is-following" : "is-ignored"}`} key={key}>
          <div className="developer-identity"><Avatar person={person} size="lg" /><div><strong>{person.displayName}</strong><span className={`soft-tag tone-${source === "workspace" ? "blue" : following ? "lime" : "coral"}`}>{source === "workspace" ? <UsersRound size={11} /> : following ? <Eye size={11} /> : <EyeOff size={11} />}{source === "workspace" ? "Miembro del workspace" : following ? "En seguimiento" : "Ignorado"}</span></div></div>
          <div className="developer-repository"><span className="developer-column-label">Repositorio</span><span className="developer-repository-name tone-blue"><FolderGit2 size={16} /><strong>{repo.label}</strong></span><small>{repositoryKey(repo)}</small>{source === "workspace" && <small className="developer-unverified">Acceso sin verificar</small>}</div>
          <div className="developer-controls">{isQa && <span className="soft-tag tone-blue"><ShieldCheck size={14} />QA del equipo</span>}
            {preferences.role === "qa" && source !== "workspace" && <Switch label="Revisar sus PR" checked={following} onCheckedChange={(checked) => onChange(setDeveloperFollowing(preferences, repo, person.accountId, checked))} />}
            {preferences.role === "qa" && source === "workspace" && <p className="developer-access-note">El seguimiento estará disponible cuando se confirme su acceso a este repositorio.</p>}
          </div>
        </li>;
      })}</ul><Pagination count={people.length} page={currentPage} onChange={setPage} />
    </>}
    <div className="panel-footnote"><ShieldCheck size={14} /><span>El origen del directorio se indica arriba. La actividad en PR complementa la lista; pertenecer al workspace no demuestra acceso a cada repositorio. Tus exclusiones son locales.</span></div>
  </section></>;
}
