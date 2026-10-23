import { useEffect, useState } from "react";
import { Database, GitPullRequest, LoaderCircle } from "lucide-react";
import type { SyncProgress as Progress } from "../../types/domain";

export function SyncProgress({ progress }: { progress: Progress }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const known = progress.pullRequestsTotal !== undefined && progress.pullRequestsTotal > 0;
  const total = progress.pullRequestsTotal ?? 0;
  return <section className="sync-progress" aria-label="Progreso de sincronización">
    <div className="sync-progress-title"><span className="panel-icon tone-blue"><LoaderCircle size={20} className="spin" /></span><div><strong>{known ? "Leyendo comentarios y commits" : "Buscando PR en Bitbucket"}</strong><p>El avance refleja datos procesados, no el tiempo restante.</p></div><span className="sync-elapsed">{Math.max(0, Math.floor((now - progress.startedAt) / 1000))} s</span></div>
    <progress aria-label={known ? "PR procesados" : "Buscando el total de PR"} max={known ? total : undefined} value={known ? progress.pullRequestsCompleted : undefined} />
    <div className="sync-progress-counts"><span><Database size={14} />{progress.repositoriesCompleted}/{progress.repositoriesTotal} repositorios · {progress.pagesRead} páginas leídas</span><span><GitPullRequest size={14} />{progress.pullRequestsCompleted}{known ? `/${total}` : ""} PR procesados</span></div>
  </section>;
}
