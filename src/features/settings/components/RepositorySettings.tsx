import { useRef, useState } from "react";
import { ArrowRight, EyeOff, FolderGit2, GitBranch, Plus, Radio, ShieldCheck } from "lucide-react";
import type { RepositoryConfig } from "../../../types/domain";
import { repositoryKey } from "../services/tracking";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PanelHeading } from "../../../components/ui/PanelHeading";

export function RepositorySettings({ repositories, onChange, connected }: { repositories: RepositoryConfig[]; onChange: (repositories: RepositoryConfig[]) => void; connected: boolean }) {
  const [workspace, setWorkspace] = useState("kontroller_test");
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const slugInput = useRef<HTMLInputElement>(null);
  return <section className="settings-card repositories-panel">
    <PanelHeading icon={FolderGit2} title="Donde vive tu código" description="Todos tus repositorios, una sola cola de revisión." tone="blue" accessory={<span className="soft-tag tone-blue"><GitBranch size={13} />{repositories.length} en seguimiento</span>} />
    <div className="repository-composer"><div className="composer-heading"><span className="panel-icon tone-lime"><Plus size={19} /></span><div><h4>Añadir otro repositorio</h4><p>Usa el workspace y el slug que aparecen en su URL de Bitbucket.</p></div></div>
      <form className="repository-form" noValidate onSubmit={(event) => {
        event.preventDefault();
        const next = { workspace: workspace.trim(), slug: slug.trim(), name: slug.trim(), label: label.trim() || slug.trim() };
        if (!/^[a-zA-Z0-9_-]+$/.test(next.workspace) || !/^[a-zA-Z0-9_.-]+$/.test(next.slug)) { setError("Usa los identificadores del workspace y repositorio, sin la URL completa."); slugInput.current?.focus(); return; }
        if (repositories.some((repo) => repositoryKey(repo).toLowerCase() === repositoryKey(next).toLowerCase())) { setError("Este repositorio ya está configurado."); slugInput.current?.focus(); return; }
        onChange([...repositories, next]); setSlug(""); setLabel(""); setError(""); slugInput.current?.focus();
      }}><label>Workspace<input value={workspace} onChange={(event) => setWorkspace(event.target.value)} required /></label><label>Slug del repositorio<input ref={slugInput} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="mi_repositorio" required /></label><label>Nombre visible<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Opcional" /></label><div className="composer-footer"><span><ShieldCheck size={14} />Acceso según los permisos de tu cuenta</span><Button type="submit" variant="primary"><Plus size={16} />Añadir repositorio<ArrowRight size={15} /></Button></div>{error && <p className="form-error" role="alert">{error}</p>}</form>
    </div>
    <div className="repository-list">{repositories.map((repo, index) => <div className="repository-card" key={repositoryKey(repo)}><span className={`repository-symbol tone-${index % 2 ? "violet" : "blue"}`}><FolderGit2 size={25} /></span><div className="repository-copy"><strong>{repo.label}</strong><small>{repositoryKey(repo)}</small><span className={`soft-tag tone-${connected ? "lime" : "blue"}`}><Radio size={11} />{connected ? "En seguimiento" : "Pendiente de conexión"}</span></div><Button variant="ghost" className="quiet-remove" onClick={() => onChange(repositories.filter((item) => repositoryKey(item) !== repositoryKey(repo)))}><EyeOff size={15} />Dejar de seguir</Button></div>)}</div>
    {repositories.length === 0 && <EmptyState icon={FolderGit2} title="Tu próxima revisión empieza aquí" description="Añade un repositorio para reunir los PR de tu equipo." />}
  </section>;
}
