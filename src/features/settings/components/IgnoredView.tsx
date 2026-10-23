import { useState } from "react";
import { Eye, EyeOff, FolderGit2, GitPullRequest, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import type { LocalPreferences, PullRequestViewModel } from "../../../types/domain";
import { Avatar } from "../../../components/ui/Avatar";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";
import { Switch } from "../../../components/ui/Switch";
import { Pagination } from "../../../components/ui/Pagination";
import { ViewSkeleton } from "../../../components/ui/ViewSkeleton";
import { ignoredDevelopers } from "../services/developer-preferences";
import { developerKey } from "../services/tracking";

interface Props {
  preferences: LocalPreferences;
  pullRequests: PullRequestViewModel[];
  onChange: (patch: Partial<LocalPreferences>) => void;
  onOpen: (pullRequest: PullRequestViewModel) => void;
  loading?: boolean;
}

export function IgnoredView({ preferences, pullRequests, onChange, onOpen, loading }: Props) {
  const [tab, setTab] = useState<"pullRequests" | "developers">("pullRequests");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  if (loading) return <ViewSkeleton label="Cargando elementos ignorados" variant="directory" />;
  const byKey = new Map(pullRequests.map((pr) => [pr.key, pr]));
  const prEntries = preferences.ignoredPullRequestKeys.map((key) => ({ key, pullRequest: byKey.get(key) }));
  const developers = ignoredDevelopers(preferences, pullRequests);
  const needle = query.toLocaleLowerCase("es");
  const filteredPrs = prEntries.filter(({ key, pullRequest }) => `${key} ${pullRequest?.title ?? ""} ${pullRequest?.author.displayName ?? ""}`.toLocaleLowerCase("es").includes(needle));
  const filteredDevelopers = developers.filter((entry) => `${entry.person.displayName} ${entry.scope}`.toLocaleLowerCase("es").includes(needle));
  const count = tab === "pullRequests" ? filteredPrs.length : filteredDevelopers.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(count / 10) - 1));
  const start = currentPage * 10;
  return <div className="ignored-view">
    <div className="view-intro settings-intro"><div><span className="eyebrow"><EyeOff size={12} />Tu bandeja, a tu ritmo</span><h2>Fuera de tu radar.</h2><p>Gestiona por separado las personas y los PR que decidiste dejar de revisar.</p></div><span className="ignored-heading-symbol"><EyeOff size={26} /></span></div>
    <nav className="ignored-tabs" aria-label="Tipos de elementos ignorados">
      <button className="tone-blue" aria-current={tab === "pullRequests" ? "page" : undefined} onClick={() => { setTab("pullRequests"); setQuery(""); setPage(0); }}><span className="panel-icon"><GitPullRequest size={21} /></span><span><strong>PR ignorados</strong><small>Exclusiones individuales</small></span><b>{prEntries.length}</b></button>
      <button className="tone-violet" aria-current={tab === "developers" ? "page" : undefined} onClick={() => { setTab("developers"); setQuery(""); setPage(0); }}><span className="panel-icon"><UsersRound size={21} /></span><span><strong>Desarrolladores</strong><small>Todos sus PR quedan fuera</small></span><b>{developers.length}</b></button>
    </nav>
    <section className="settings-card ignored-panel"><div className="ignored-toolbar"><div><h3>{tab === "pullRequests" ? "PR que apartaste individualmente" : "Personas que no estás siguiendo"}</h3><p>{tab === "pullRequests" ? "Aquí aparecen los PR que marcaste expresamente como ignorados." : "Una exclusión por persona y ámbito. Sus PR se ocultan automáticamente del resumen."}</p></div><SearchInput label="Buscar ignorados" placeholder={tab === "pullRequests" ? "Buscar PR o autor…" : "Buscar desarrollador…"} value={query} onChange={(value) => { setQuery(value); setPage(0); }} /></div>
      {count === 0 ? <EmptyState icon={tab === "pullRequests" ? GitPullRequest : UsersRound} title={query ? "No hay coincidencias" : tab === "pullRequests" ? "No tienes PR ignorados." : "Nadie fuera de tu radar"} description={query ? "Prueba con otro nombre o limpia la búsqueda." : tab === "pullRequests" ? "Cuando apartes un PR del resumen, podrás recuperarlo desde aquí." : "Las personas que dejes de seguir aparecerán aquí, sin llenar la lista con sus PR."} action={query ? <Button variant="ghost" onClick={() => setQuery("")}><RotateCcw size={15} />Limpiar búsqueda</Button> : undefined} /> : <>
        {tab === "pullRequests" ? <div className="ignored-entries">{filteredPrs.slice(start, start + 10).map(({ key, pullRequest: pr }) => {
          const authorIgnored = pr && (preferences.ignoredDeveloperIds.includes(pr.author.accountId) || preferences.ignoredRepositoryDeveloperKeys.includes(developerKey(pr.repository, pr.author.accountId)));
          return <article className="ignored-pr-card" key={key}><span className="repository-symbol tone-blue"><GitPullRequest size={23} /></span><div className="ignored-pr-copy"><span className="ignored-pr-overline"><span className="soft-tag tone-coral"><EyeOff size={11} />PR ignorado</span><small>{pr ? `${pr.repository.label} · PR-${pr.id}` : key}</small></span>{pr ? <button className="pr-title" onClick={() => onOpen(pr)}>{pr.title}</button> : <strong>PR fuera de la consulta actual</strong>}<div className="ignored-author">{pr && <><Avatar person={pr.author} size="sm" /><span>{pr.author.displayName}</span></>}{authorIgnored && <span className="soft-tag tone-violet">Autor también ignorado</span>}</div>{authorIgnored && <small className="restore-explanation">Para verlo en Resumen, vuelve a seguir también al autor en Desarrolladores.</small>}</div><Button onClick={() => onChange({ ignoredPullRequestKeys: preferences.ignoredPullRequestKeys.filter((id) => id !== key) })}><RotateCcw size={15} />Volver a revisar este PR</Button></article>;
        })}</div> : <div className="ignored-entries">{filteredDevelopers.slice(start, start + 10).map((entry) => <article className="directory-row ignored-developer" key={entry.key}><div className="developer-identity"><Avatar person={entry.person} size="lg" /><div><strong>{entry.person.displayName}</strong><small><FolderGit2 size={12} />{entry.scope}</small><span className="soft-tag tone-coral"><EyeOff size={11} />Todos sus PR ignorados</span></div></div><Switch label="Desarrollador ignorado" description="Desactiva para volver a seguirlo" tone="coral" checked onCheckedChange={() => onChange(entry.global ? { ignoredDeveloperIds: preferences.ignoredDeveloperIds.filter((id) => id !== entry.preferenceKey) } : { ignoredRepositoryDeveloperKeys: preferences.ignoredRepositoryDeveloperKeys.filter((id) => id !== entry.preferenceKey) })} /></article>)}</div>}
        <Pagination count={count} page={currentPage} onChange={setPage} />
      </>}
      <div className="panel-footnote"><ShieldCheck size={14} /><span>Preferencias de este navegador. Recuperar una persona conserva las exclusiones de PR individuales.</span><Eye size={14} /></div>
    </section>
  </div>;
}
