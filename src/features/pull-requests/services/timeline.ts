import type { ActivityKind, Person, PullRequestComment, PullRequestSnapshot } from "../../../types/domain";

export interface TimelineEntry {
  id: string;
  kind: ActivityKind;
  actor: Person;
  createdAt: string;
  title: string;
  content?: string;
  commitHash?: string;
  comment?: PullRequestComment;
}

export function pullRequestTimeline(pullRequest: PullRequestSnapshot): TimelineEntry[] {
  const entries = new Map<string, TimelineEntry>();
  const commits = new Map(pullRequest.commits.map((commit) => [commit.hash, commit]));
  const titles: Record<ActivityKind, string> = {
    pull_request_created: "Creó el pull request",
    metadata_updated: "Actualizó los datos del PR",
    commit_added: "Añadió un commit",
    comment_added: "Dejó un comentario",
    approval_added: "Registró una aprobación",
    change_requested: "Solicitó cambios",
  };
  for (const event of pullRequest.activity) {
    const id = event.kind === "commit_added" && event.commitHash ? `commit-${event.commitHash}` : event.kind === "comment_added" && event.commentId ? `comment-${event.commentId}` : `activity-${event.id}`;
    const commit = event.commitHash ? commits.get(event.commitHash) : undefined;
    entries.set(id, { id, kind: event.kind, actor: event.actor, createdAt: event.createdAt, title: titles[event.kind], content: commit?.message || event.content, commitHash: event.commitHash });
  }
  for (const commit of commits.values()) {
    const id = `commit-${commit.hash}`;
    entries.set(id, { id, kind: "commit_added", actor: commit.author, createdAt: commit.committedAt, title: titles.commit_added, content: commit.message, commitHash: commit.hash });
  }
  for (const comment of pullRequest.comments) {
    const id = `comment-${comment.id}`;
    entries.set(id, { id, kind: "comment_added", actor: comment.author, createdAt: comment.createdAt, title: titles.comment_added, content: comment.content, comment });
  }
  return [...entries.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
