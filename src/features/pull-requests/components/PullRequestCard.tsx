import { ExternalLink, GitCommitHorizontal, MessageCircle } from "lucide-react";
import type { PullRequestViewModel } from "../../../types/domain";
import { formatRelativeTime } from "../../../lib/formatting";
import { Avatar } from "../../../components/ui/Avatar";
import { BitbucketBadge, FlowBadge } from "../../../components/ui/StatusBadge";

export function PullRequestCard({ pullRequest, onOpen, onIgnore }: { pullRequest: PullRequestViewModel; onOpen: () => void; onIgnore?: () => void }) {
  return <article className={`pr-card ${pullRequest.newEventCount > 0 ? "is-new" : ""}`}><div className="pr-card-top"><span className="repo-label">{pullRequest.repository.label} · PR-{pullRequest.id}</span><BitbucketBadge state={pullRequest.state} draft={pullRequest.draft} queued={pullRequest.queued} /></div><button className="pr-title" onClick={onOpen}>{pullRequest.title}</button><div className="pr-card-meta"><Avatar person={pullRequest.author} size="sm" /><span>{pullRequest.author.displayName}</span><span>·</span><span>{formatRelativeTime(pullRequest.lastRelevantActivityAt)}</span></div><FlowBadge state={pullRequest.flowState} label={pullRequest.flowLabel} /><div className="pr-card-footer"><span><MessageCircle size={14} />{pullRequest.comments.length}</span><span><GitCommitHorizontal size={14} />{pullRequest.commits.length}</span>{onIgnore && <button className="button button-ghost" onClick={onIgnore}>No revisar PR {pullRequest.id}</button>}<a href={pullRequest.htmlUrl} target="_blank" rel="noreferrer" aria-label={`Abrir PR ${pullRequest.id} en Bitbucket`}><ExternalLink size={15} /></a></div></article>;
}
