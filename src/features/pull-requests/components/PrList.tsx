import { Inbox, LayoutList, LoaderCircle } from "lucide-react";
import type { PullRequestViewModel } from "../../../types/domain";
import { EmptyState } from "../../../components/ui/EmptyState";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { PullRequestCard } from "./PullRequestCard";
import { PullRequestRow } from "./PullRequestRow";

interface Props {
  pullRequests: PullRequestViewModel[];
  onOpen: (pullRequest: PullRequestViewModel) => void;
  onIgnore?: (key: string) => void;
  showIgnore: boolean;
  loading?: boolean;
  refreshing?: boolean;
}

export function PrList({ pullRequests, onOpen, onIgnore, showIgnore, loading, refreshing }: Props) {
  if (loading) return <TableSkeleton />;
  if (pullRequests.length === 0) return <EmptyState icon={Inbox} title="No hay PR que mostrar" description="Prueba con otros filtros o limpia la búsqueda para volver a la vista completa." />;
  return <section className="pr-list" aria-busy={refreshing || undefined}>
    <div className="list-heading"><div><span className="eyebrow">Cola de seguimiento</span><strong>{pullRequests.length} pull requests</strong></div><span className="list-view-label">{refreshing ? <><LoaderCircle size={15} className="spin" />Actualizando…</> : <><LayoutList size={15} />Ordenados por última actividad</>}</span></div>
    <div className="desktop-table"><div className="table-head"><span>Pull request</span><span>Autor</span><span>Estado de seguimiento</span><span>Actividad</span><span /></div>{pullRequests.map((pullRequest) => <PullRequestRow key={pullRequest.key} pullRequest={pullRequest} onOpen={() => onOpen(pullRequest)} onIgnore={() => onIgnore?.(pullRequest.key)} showIgnore={showIgnore} />)}</div>
    <div className="mobile-cards">{pullRequests.map((pullRequest) => <PullRequestCard key={pullRequest.key} pullRequest={pullRequest} onOpen={() => onOpen(pullRequest)} onIgnore={showIgnore ? () => onIgnore?.(pullRequest.key) : undefined} />)}</div>
  </section>;
}
