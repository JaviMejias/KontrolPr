import { ExternalLink, GitCommitHorizontal, MessageCircle, EyeOff } from "lucide-react";
import type { PullRequestViewModel } from "../../../types/domain";
import { formatRelativeTime } from "../../../lib/formatting";
import { Avatar } from "../../../components/ui/Avatar";
import { BitbucketBadge, FlowBadge } from "../../../components/ui/StatusBadge";

export function PullRequestRow({ pullRequest, onOpen, onIgnore, showIgnore }: { pullRequest: PullRequestViewModel; onOpen: () => void; onIgnore?: () => void; showIgnore: boolean }) {
  return <div className={`pr-row ${pullRequest.newEventCount > 0 ? "is-new" : ""}`}>
    <div className="pr-main"><div className="pr-overline"><span className="repo-label">{pullRequest.repository.label}</span><span className="pr-number">PR-{pullRequest.id}</span><BitbucketBadge state={pullRequest.state} draft={pullRequest.draft} queued={pullRequest.queued} /></div><button className="pr-title" onClick={onOpen}>{pullRequest.title}</button><div className="pr-branches"><code>{pullRequest.sourceBranch}</code><span>→</span><code>{pullRequest.destinationBranch}</code></div></div>
    <div className="pr-author"><Avatar person={pullRequest.author} size="sm" /><span>{pullRequest.author.displayName}</span></div>
    <div className="pr-flow"><FlowBadge state={pullRequest.flowState} label={pullRequest.flowLabel} /><small>{pullRequest.nextOwner === "qa" ? "Tu revisión" : pullRequest.nextOwner === "developer" ? "Acción del autor" : pullRequest.flowDescription}</small></div>
    <div className="pr-activity"><div><MessageCircle size={15} />{pullRequest.comments.length}<span className="activity-separator" /><GitCommitHorizontal size={15} />{pullRequest.commits.length}</div><span>{formatRelativeTime(pullRequest.lastRelevantActivityAt)}</span></div>
    <div className="pr-actions"><a href={pullRequest.htmlUrl} target="_blank" rel="noreferrer" aria-label={`Abrir PR ${pullRequest.id} en Bitbucket`} className="icon-button"><ExternalLink size={16} /></a>{showIgnore && <button className="icon-button" title="No revisar este PR" aria-label={`No revisar PR ${pullRequest.id}`} onClick={onIgnore}><EyeOff size={17} /></button>}</div>
    {pullRequest.newEventCount > 0 && <span className="new-marker">nuevo</span>}
  </div>;
}
