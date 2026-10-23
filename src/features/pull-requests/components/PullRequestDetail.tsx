import { useEffect, useRef } from "react";
import { ArrowUpRight, CheckCheck, Clock3, GitBranch, GitCommitHorizontal, GitPullRequest, MessageCircle, ShieldCheck, UserRound, X } from "lucide-react";
import type { Person, PullRequestViewModel } from "../../../types/domain";
import { formatDateTime, formatRelativeTime } from "../../../lib/formatting";
import { Avatar } from "../../../components/ui/Avatar";
import { BitbucketBadge, FlowBadge } from "../../../components/ui/StatusBadge";
import { MentionText } from "../../../components/ui/MentionText";
import { mentionNamesFor } from "../../../lib/bitbucket/mentions";
import { pullRequestTimeline } from "../services/timeline";
import { DetailNavigation, type DetailNavigationProps } from "./DetailNavigation";
import { ReviewEvidenceCard } from "./ReviewEvidenceCard";

interface Props extends DetailNavigationProps { pullRequest: PullRequestViewModel; onClose: () => void; people?: Person[]; returnFocusTo?: HTMLElement }

export function PullRequestDetail({ pullRequest, onClose, people = [], returnFocusTo, ...navigation }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = returnFocusTo ?? document.activeElement;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, [returnFocusTo]);
  const events = pullRequestTimeline(pullRequest);
  const names = mentionNamesFor([...people, pullRequest.author, ...events.map((event) => event.actor)]);
  const NextOwnerIcon = pullRequest.nextOwner === "qa" ? ShieldCheck : pullRequest.nextOwner === "developer" ? UserRound : CheckCheck;
  const comments = events.filter((event) => event.kind === "comment_added").length;
  const commits = events.filter((event) => event.kind === "commit_added").length;
  return <dialog className="drawer-shell" ref={dialogRef} aria-labelledby="detail-title" onCancel={onClose}>
    <button className="drawer-backdrop" tabIndex={-1} aria-label="Cerrar detalle" onClick={onClose} />
    <aside className="detail-drawer">
      <div className="drawer-header"><span className="detail-header-icon"><GitPullRequest size={22} /></span><div><span className="eyebrow">{pullRequest.repository.label} · PR-{pullRequest.id}</span><h2 id="detail-title">Detalle de seguimiento</h2></div><button className="icon-button" aria-label="Cerrar detalle" onClick={onClose} autoFocus><X size={18} /></button></div>
      <DetailNavigation {...navigation} />
      <div className="drawer-content">
        <div className="detail-heading"><div className="detail-badges"><FlowBadge state={pullRequest.flowState} label={pullRequest.flowLabel} /><BitbucketBadge state={pullRequest.state} draft={pullRequest.draft} queued={pullRequest.queued} /></div><h3>{pullRequest.title}</h3><p><MentionText text={pullRequest.description || "Este PR no tiene descripción."} names={names} /></p><a href={pullRequest.htmlUrl} target="_blank" rel="noreferrer" className="text-link">Abrir en Bitbucket <ArrowUpRight size={15} /></a></div>
        <div className={`detail-next-owner ${pullRequest.nextOwner === "developer" ? "tone-coral" : "tone-lime"}`}><NextOwnerIcon size={20} /><div><span>La siguiente acción</span><strong>{pullRequest.nextOwner === "qa" ? "Le toca a QA" : pullRequest.nextOwner === "developer" ? "Le toca al desarrollador" : "Sin acción pendiente"}</strong><p>{pullRequest.flowDescription}</p></div></div>
        <div className="detail-grid">
          <div><span className="detail-label"><UserRound size={12} />Autor</span><div className="detail-person"><Avatar person={pullRequest.author} /><span>{pullRequest.author.displayName}</span></div></div>
          <div><span className="detail-label"><Clock3 size={12} />Última actividad</span><strong>{formatDateTime(pullRequest.lastRelevantActivityAt)}</strong><small>{formatRelativeTime(pullRequest.lastRelevantActivityAt)}</small></div>
          <div><span className="detail-label">Ramas</span><strong className="branch-line"><GitBranch size={14} />{pullRequest.sourceBranch}</strong><span className="branch-target">→ {pullRequest.destinationBranch}</span></div>
          <ReviewEvidenceCard pullRequest={pullRequest} />
        </div>
        <div className="activity-section"><div className="section-heading"><span>Comentarios y cambios</span><small>{events.length} eventos</small></div><div className="detail-event-counts"><span><MessageCircle size={14} />{comments} comentarios</span><span><GitCommitHorizontal size={14} />{commits} commits</span></div>
          <div className="timeline">{events.map((event) => {
            const Icon = event.kind === "commit_added" ? GitCommitHorizontal : event.kind === "comment_added" ? MessageCircle : event.kind === "approval_added" ? ShieldCheck : GitPullRequest;
            const tone = event.kind === "commit_added" ? "blue" : event.kind === "comment_added" ? "coral" : "lime";
            return <article className={`timeline-item tone-${tone}`} key={event.id}><span className="timeline-dot"><Icon size={15} /></span><div className="timeline-card"><div className="timeline-meta"><Avatar person={event.actor} size="sm" /><strong>{event.actor.displayName}</strong><time dateTime={event.createdAt} title={formatDateTime(event.createdAt)}>{formatRelativeTime(event.createdAt)}</time></div><div className="timeline-event-label"><span>{event.title}</span>{event.comment?.inline && <small>En el código</small>}{event.comment?.parentId && <small>Respuesta</small>}</div>{event.content && <p><MentionText text={event.content} names={{ ...names, ...event.comment?.mentions }} /></p>}{event.commitHash && <a className="commit-reference" href={`https://bitbucket.org/${encodeURIComponent(pullRequest.repository.workspace)}/${encodeURIComponent(pullRequest.repository.slug)}/commits/${encodeURIComponent(event.commitHash)}`} target="_blank" rel="noreferrer"><GitCommitHorizontal size={13} /><code>{event.commitHash.slice(0, 10)}</code><ArrowUpRight size={12} /></a>}{event.comment?.updatedAt && event.comment.updatedAt !== event.comment.createdAt && <small className="comment-edited">Editado · {formatDateTime(event.comment.updatedAt)}</small>}</div></article>;
          })}</div>
        </div>
      </div>
    </aside>
  </dialog>;
}
