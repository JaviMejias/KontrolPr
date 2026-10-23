import type { ActivityEvent, Commit, FlowState, Person, PullRequestComment, PullRequestSnapshot, PullRequestViewModel } from "../../../types/domain";
import { compareRevision, revisionAt } from "../../../lib/review-revision";

export interface QaIdentityResolver {
  isQa(person: Person): boolean;
}

export function isEffectiveCodeChange(commit: Commit, previousFingerprint: string | undefined): boolean {
  return commit.effectiveDiffFingerprint !== previousFingerprint && commit.changedFiles > 0;
}

function latestByDate<T extends { createdAt: string }>(items: T[]): T | undefined {
  return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

function latestQaComment(comments: PullRequestComment[], resolver: QaIdentityResolver): PullRequestComment | undefined {
  return [...comments].filter((comment) => resolver.isQa(comment.author)).sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt))[0];
}

function latestAuthorComment(comments: PullRequestComment[], pullRequest: PullRequestSnapshot): PullRequestComment | undefined {
  return [...comments].filter((comment) => comment.author.accountId === pullRequest.author.accountId).sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt))[0];
}

function latestApproval(activity: ActivityEvent[], resolver: QaIdentityResolver): ActivityEvent | undefined {
  return latestByDate(activity.filter((event) => event.kind === "approval_added" && event.approvalActive !== false && resolver.isQa(event.actor)));
}

function stateFor(pullRequest: PullRequestSnapshot, resolver: QaIdentityResolver): { state: FlowState; codeChange: boolean } {
  if (pullRequest.state === "MERGED" || pullRequest.state === "DECLINED" || pullRequest.state === "SUPERSEDED") return { state: "INACTIVE", codeChange: false };
  const qaComment = latestQaComment(pullRequest.comments.filter((comment) => comment.author.accountId !== pullRequest.author.accountId), resolver);
  const authorComment = latestAuthorComment(pullRequest.comments, pullRequest);
  const approval = latestApproval(pullRequest.activity.filter((event) => event.actor.accountId !== pullRequest.author.accountId), resolver);
  const feedbackAt = qaComment?.updatedAt ?? qaComment?.createdAt;
  const responseAt = authorComment?.updatedAt ?? authorComment?.createdAt;
  const referenceAt = approval && (!feedbackAt || Date.parse(approval.createdAt) > Date.parse(feedbackAt)) ? approval.createdAt : feedbackAt;
  const commitsAfterFeedback = pullRequest.commits.filter((commit) => referenceAt && Date.parse(commit.committedAt) > Date.parse(referenceAt));
  const comparison = referenceAt ? compareRevision(pullRequest, referenceAt) : "unknown";
  const codeChange = pullRequest.reviewEvidence ? comparison === "changed" : !pullRequest.reviewEvidenceLimited && commitsAfterFeedback.some((commit) => isEffectiveCodeChange(commit, pullRequest.reviewedDiffFingerprint ?? pullRequest.diffFingerprint));
  const approvalVerified = approval && (pullRequest.reviewEvidence ? approval.approvalActive === true && compareRevision(pullRequest, approval.createdAt) === "unchanged" : !pullRequest.reviewEvidenceLimited && !pullRequest.commits.some((commit) => Date.parse(commit.committedAt) > Date.parse(approval.createdAt)));

  if (approval && approvalVerified && (!feedbackAt || Date.parse(approval.createdAt) > Date.parse(feedbackAt))) return { state: "QA_APPROVED", codeChange: false };

  if (codeChange) return { state: "UPDATED", codeChange: true };
  const reference = referenceAt ? revisionAt(pullRequest, referenceAt) : undefined;
  const laterRevision = reference && pullRequest.activity.some((event) => event.sourceHash && event.sourceHash !== reference.sourceHash && referenceAt && Date.parse(event.createdAt) > Date.parse(referenceAt));
  if (referenceAt && pullRequest.reviewEvidenceLimited && comparison === "unknown" && (commitsAfterFeedback.length > 0 || laterRevision)) return { state: "COMMITS_PENDING", codeChange: false };
  if (qaComment && (!responseAt || Date.parse(responseAt) <= Date.parse(feedbackAt!))) return { state: "QA_FEEDBACK", codeChange: false };
  if (authorComment && (!feedbackAt || Date.parse(responseAt!) > Date.parse(feedbackAt))) return { state: "AUTHOR_RESPONDED", codeChange: false };
  return { state: "NEW", codeChange: false };
}

export function computePullRequestViewModel(pullRequest: PullRequestSnapshot, resolver: QaIdentityResolver, observedEventIds: ReadonlySet<string>, now = new Date()): PullRequestViewModel {
  const flow = stateFor(pullRequest, resolver);
  const relevantActivity = [...new Map([...pullRequest.activity.filter((event) => event.kind !== "metadata_updated"), ...pullRequest.comments.map((comment) => ({ id: `comment-${comment.id}`, kind: "comment_added" as const, actor: comment.author, createdAt: comment.updatedAt ?? comment.createdAt, commentId: comment.id, link: comment.link }))].map((event) => [event.id, event])).values()];
  const latest = latestByDate(relevantActivity);
  const qaActors = [...new Map(pullRequest.comments.filter((comment) => resolver.isQa(comment.author)).map((comment) => [comment.author.accountId, comment.author])).values()];
  const newEventCount = relevantActivity.filter((event) => !observedEventIds.has(event.id)).length;
  const stale = now.getTime() - Date.parse(latest?.createdAt ?? pullRequest.updatedAt) > 1000 * 60 * 60 * 24 * 4;
  const labels: Record<FlowState, [string, string, "qa" | "developer" | "none"]> = {
    NEW: ["Nuevo · Requiere revisión", "Pendiente de primera revisión", "qa"],
    QA_FEEDBACK: ["QA dejó comentarios", "Esperando al desarrollador", "developer"],
    AUTHOR_RESPONDED: ["Respuesta recibida", "El desarrollador respondió · Pendiente de seguimiento", "qa"],
    UPDATED: ["Actualizado · Requiere QA", "Existe código efectivo posterior a las observaciones", "qa"],
    COMMITS_PENDING: ["Nuevos commits · Verificar", "Hay commits posteriores a la revisión, pero no se pudo verificar la comparación de contenido", "qa"],
    QA_APPROVED: ["Revisado por QA", "Hay una aprobación verificable para la versión observada", "none"],
    INACTIVE: ["Finalizado", "El PR dejó de estar activo en Bitbucket", "none"],
  };
  const [flowLabel, flowDescription, nextOwner] = labels[flow.state];
  return { ...pullRequest, flowState: flow.state, flowLabel, flowDescription, nextOwner, lastRelevantActivityAt: latest?.createdAt ?? pullRequest.updatedAt, lastRelevantActor: latest?.actor, qaActors, newEventCount, hasEffectiveCodeChange: flow.codeChange, stale };
}

export function eventIdsFor(pullRequest: PullRequestSnapshot): string[] {
  return [...new Set([...pullRequest.activity.map((event) => event.id), ...pullRequest.comments.map((comment) => `comment-${comment.id}`)])];
}
