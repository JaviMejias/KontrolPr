import type { Commit, Person, PullRequestComment, PullRequestSnapshot, RepositoryConfig } from "../../types/domain";
import { extractMentionNames } from "./mentions";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? value as UnknownRecord : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

export function normalizePerson(value: unknown): Person {
  const raw = record(value);
  const displayName = stringValue(raw.display_name, stringValue(raw.nickname, "Usuario sin nombre"));
  const accountId = stringValue(raw.uuid, stringValue(raw.account_id));
  return { accountId, displayName, nickname: stringValue(raw.nickname) || undefined, uuid: stringValue(raw.uuid) || undefined, atlassianAccountId: stringValue(raw.account_id) || undefined };
}

export function normalizePullRequestSummary(value: unknown, repository: RepositoryConfig): PullRequestSnapshot {
  const raw = record(value);
  const source = record(raw.source);
  const destination = record(raw.destination);
  const sourceBranch = record(source.branch);
  const destinationBranch = record(destination.branch);
  const links = record(raw.links);
  const html = record(links.html);
  const id = numberValue(raw.id);
  return {
    key: `${repository.workspace}/${repository.slug}#${id}`,
    repository,
    id,
    title: stringValue(raw.title, "Sin título"),
    description: stringValue(raw.description),
    author: normalizePerson(raw.author),
    sourceBranch: stringValue(sourceBranch.name, "rama desconocida"),
    destinationBranch: stringValue(destinationBranch.name, "rama desconocida"),
    state: raw.state === "MERGED" || raw.state === "DECLINED" || raw.state === "SUPERSEDED" ? raw.state : raw.state === "OPEN" ? "OPEN" : "UNKNOWN",
    draft: raw.draft === true,
    queued: raw.queued === true,
    createdAt: stringValue(raw.created_on),
    updatedAt: stringValue(raw.updated_on),
    htmlUrl: stringValue(html.href),
    rawState: stringValue(raw.state, "UNKNOWN"),
    participants: [...new Map([
      ...(Array.isArray(raw.reviewers) ? raw.reviewers.map(normalizePerson) : []),
      ...(Array.isArray(raw.participants) ? raw.participants.map((participant) => normalizePerson(record(participant).user)) : []),
    ].filter((person) => person.accountId).map((person) => [person.accountId, person])).values()],
    sourceHash: stringValue(record(source.commit).hash) || undefined,
    destinationHash: stringValue(record(destination.commit).hash) || undefined,
    comments: [],
    commits: [],
    activity: [],
    diffFingerprint: "Sin evidencia de contenido",
  };
}

export function normalizePullRequestComment(value: unknown): PullRequestComment {
  const raw = record(value);
  const content = record(raw.content);
  const links = record(raw.links);
  const html = record(links.html);
  const parent = record(raw.parent);
  return {
    id: numberValue(raw.id),
    author: normalizePerson(raw.user),
    createdAt: stringValue(raw.created_on),
    updatedAt: stringValue(raw.updated_on) || undefined,
    content: stringValue(content.raw),
    mentions: extractMentionNames(stringValue(content.raw), stringValue(content.html)),
    parentId: numberValue(parent.id) || undefined,
    inline: typeof raw.inline === "object" && raw.inline !== null,
    resolved: typeof raw.resolved === "boolean" ? raw.resolved : undefined,
    link: stringValue(html.href),
  };
}

export function normalizeCommit(value: unknown): Commit {
  const raw = record(value);
  const parents = Array.isArray(raw.parents) ? raw.parents.map((parent) => stringValue(record(parent).hash)).filter(Boolean) : [];
  const hash = stringValue(raw.hash, "unresolved-commit");
  const committedAt = stringValue(raw.date);
  return { hash, message: stringValue(raw.message), author: normalizePerson(record(raw.author).user ?? raw.author), authoredAt: committedAt, committedAt, parents, effectiveDiffFingerprint: hash, changedFiles: 0 };
}
