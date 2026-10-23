import { z } from "zod";
import type { Person, PullRequestSnapshot, RepositoryConfig } from "../../types/domain";
import { BitbucketApiError, type BitbucketApiClient } from "./contracts";
import { normalizeCommit, normalizePerson, normalizePullRequestComment, normalizePullRequestSummary } from "./normalizers";
import { mapConcurrent } from "../map-concurrent";
import { enrichReviewEvidence } from "./review-evidence";
import { qaSignature } from "../review-revision";
import { normalizeReviewActivity, participantSchema, reviewActivitySchema } from "./review-activity";
import { readAllPages } from "./pagination";
import { canReadIncrementally, closedRetentionMs, incrementalOverlapMs, type RepositoryReadOptions, type RepositorySyncStatistics } from "./repository-sync";

export interface RepositoryProgress {
  phase: "listing" | "details" | "complete";
  pagesRead: number;
  completed: number;
  total?: number;
}

const identitySchema = z.object({ account_id: z.string().optional(), uuid: z.string(), display_name: z.string(), nickname: z.string().optional() });
const summarySchema = z.looseObject({ id: z.number(), title: z.string(), state: z.string(), author: identitySchema, created_on: z.iso.datetime({ offset: true }), updated_on: z.iso.datetime({ offset: true }) });
const commentSchema = z.looseObject({ id: z.number(), created_on: z.string(), user: identitySchema, content: z.object({ raw: z.string(), html: z.string().optional() }).optional(), deleted: z.boolean().optional() });
const commitSchema = z.looseObject({ hash: z.string(), message: z.string(), date: z.string() });

export async function getCurrentUser(client: BitbucketApiClient): Promise<Person> {
  return normalizePerson(await client.get("/user", identitySchema));
}

export { readAllPages } from "./pagination";

export async function readRepository(sourceClient: BitbucketApiClient, repository: RepositoryConfig, previous: PullRequestSnapshot[], onProgress?: (progress: RepositoryProgress) => void, qaAccountIds: string[] = [], options: RepositoryReadOptions = {}): Promise<PullRequestSnapshot[]> {
  const startedAt = options.now ?? Date.now();
  const scope = `${repository.workspace}/${repository.slug}`;
  const signature = qaSignature(qaAccountIds);
  previous = previous.filter((pr) => `${pr.repository.workspace}/${pr.repository.slug}` === scope);
  let incremental = !options.forceFull && canReadIncrementally(options.checkpoint, scope, previous, signature, startedAt);
  const statistics: RepositorySyncStatistics = { mode: incremental ? "incremental" : "full", requests: 0, listed: 0, refreshed: 0, reused: 0, removed: 0 };
  const client: BitbucketApiClient = {
    get: (path, schema, signal) => { statistics.requests += 1; return signal ? sourceClient.get(path, schema, signal) : sourceClient.get(path, schema); },
    ...(sourceClient.getText ? { getText: (path: string, signal?: AbortSignal) => { statistics.requests += 1; return signal ? sourceClient.getText!(path, signal) : sourceClient.getText!(path); } } : {}),
  };
  let progress: RepositoryProgress = { phase: "listing", pagesRead: 0, completed: 0 };
  const onPage = () => { progress = { ...progress, pagesRead: progress.pagesRead + 1 }; onProgress?.(progress); };
  onProgress?.(progress);
  const path = `/repositories/${encodeURIComponent(repository.workspace)}/${encodeURIComponent(repository.slug)}/pullrequests`;
  const since = new Date(startedAt - closedRetentionMs).toISOString();
  const recent = encodeURIComponent(`updated_on >= "${since}"`);
  const fields = encodeURIComponent("next,values.id,values.title,values.description,values.state,values.author,values.created_on,values.updated_on,values.source.branch.name,values.source.commit.hash,values.destination.branch.name,values.destination.commit.hash,values.links.html,values.reviewers,values.participants,values.draft,values.queued");
  const readFull = async () => (await Promise.all([
    readAllPages(client, `${path}?state=OPEN&pagelen=50&sort=-updated_on&fields=${fields}`, summarySchema, onPage),
    readAllPages(client, `${path}?state=MERGED&state=DECLINED&q=${recent}&pagelen=50&sort=-updated_on&fields=${fields}`, summarySchema, onPage),
  ])).flat();
  let listed: z.infer<typeof summarySchema>[];
  if (incremental && options.checkpoint) {
    const after = new Date(Math.max(0, options.checkpoint.cursor - incrementalOverlapMs)).toISOString();
    try {
      listed = await readAllPages(client, `${path}?state=OPEN&state=MERGED&state=DECLINED&q=${encodeURIComponent(`updated_on >= "${after}"`)}&pagelen=50&sort=-updated_on&fields=${fields}`, summarySchema, onPage);
    } catch (error) {
      if (!(error instanceof BitbucketApiError) || error.status !== 400) throw error;
      incremental = false; statistics.mode = "full";
      listed = await readFull();
    }
  } else listed = await readFull();
  const summaries = new Map<number, z.infer<typeof summarySchema>>();
  for (const summary of listed) {
    const existing = summaries.get(summary.id);
    if (!existing || Date.parse(summary.updated_on) >= Date.parse(existing.updated_on)) summaries.set(summary.id, summary);
  }
  const previousById = new Map(previous.map((pr) => [pr.id, pr]));
  statistics.listed = summaries.size;
  const refreshDetails = Boolean(options.forceFull || (options.checkpoint && !incremental));
  progress = { ...progress, phase: "details", total: summaries.size };
  onProgress?.(progress);
  const result = await mapConcurrent([...summaries.values()], 3, async (raw) => {
    const cached = previousById.get(raw.id);
    let pr = normalizePullRequestSummary(raw, repository);
    const needsEvidence = Boolean(pr.sourceHash && pr.destinationHash);
    if (!refreshDetails && cached && cached.updatedAt === raw.updated_on && cached.rawState === raw.state && cached.sourceHash === pr.sourceHash && cached.destinationHash === pr.destinationHash && (!needsEvidence || (cached.reviewEvidence?.version === 2 && cached.reviewEvidence.qaSignature === signature))) {
      statistics.reused += 1;
      progress = { ...progress, completed: progress.completed + 1 }; onProgress?.(progress);
      return { ...cached, repository, title: pr.title, description: pr.description, draft: pr.draft, queued: pr.queued, htmlUrl: pr.htmlUrl, sourceBranch: pr.sourceBranch, destinationBranch: pr.destinationBranch, participants: [...new Map([...(cached.participants ?? []), ...(pr.participants ?? [])].map((person) => [person.accountId, person])).values()] };
    }
    pr.reviewEvidenceLimited = true;
    if (raw.state !== "OPEN" && !cached) {
      progress = { ...progress, completed: progress.completed + 1 }; onProgress?.(progress);
      return pr;
    }
    statistics.refreshed += 1;
    const [comments, commits] = await Promise.all([
      readAllPages(client, `${path}/${raw.id}/comments?pagelen=100`, commentSchema, onPage),
      readAllPages(client, `${path}/${raw.id}/commits?pagelen=100`, commitSchema, onPage),
    ]);
    let reviewEvents: PullRequestSnapshot["activity"] = [];
    if (pr.sourceHash && pr.destinationHash) {
      const [details, activity] = await Promise.all([
        client.get(`${path}/${raw.id}`, summarySchema.extend({ participants: z.array(participantSchema).optional().default([]) })),
        // Activity has a provider-specific page-size limit; use its default and follow next URLs.
        readAllPages(client, `${path}/${raw.id}/activity`, reviewActivitySchema, onPage),
      ]);
      pr = normalizePullRequestSummary(details, repository);
      reviewEvents = normalizeReviewActivity(activity, pr, details.participants);
    }
    pr.comments = [...new Map(comments.map((comment) => [comment.id, comment])).values()].filter((comment) => !comment.deleted).map(normalizePullRequestComment);
    pr.commits = [...new Map(commits.map((commit) => [commit.hash, commit])).values()].map(normalizeCommit);
    pr.activity = [
      { id: `created-${raw.id}`, kind: "pull_request_created", actor: pr.author, createdAt: pr.createdAt, link: pr.htmlUrl },
      ...pr.commits.map((commit) => ({ id: `commit-${commit.hash}`, kind: "commit_added" as const, actor: commit.author, createdAt: commit.committedAt, commitHash: commit.hash, content: commit.message, link: pr.htmlUrl })),
      ...reviewEvents,
    ];
    await enrichReviewEvidence(client, pr, reviewEvents, qaAccountIds, cached, onPage);
    pr.reviewEvidenceLimited = true;
    progress = { ...progress, completed: progress.completed + 1 }; onProgress?.(progress);
    return pr;
  });
  const merged = new Map(incremental ? previous.map((pr) => [pr.id, { ...pr, repository }]) : []);
  for (const pr of result) {
    const cached = merged.get(pr.id);
    if (!cached || Date.parse(pr.updatedAt) >= Date.parse(cached.updatedAt)) merged.set(pr.id, pr);
  }
  const snapshots = [...merged.values()].filter((pr) => pr.rawState === "OPEN" || Date.parse(pr.updatedAt) >= startedAt - closedRetentionMs);
  if (incremental) statistics.reused += snapshots.filter((pr) => !summaries.has(pr.id)).length;
  const ids = new Set(snapshots.map((pr) => pr.id));
  statistics.removed = previous.filter((pr) => !ids.has(pr.id)).length;
  onProgress?.({ ...progress, phase: "complete" });
  options.onComplete?.({ version: 1, repository: scope, cursor: startedAt, fullSyncedAt: incremental && options.checkpoint ? options.checkpoint.fullSyncedAt : startedAt, qaSignature: signature, pullRequestIds: [...ids].sort((a, b) => a - b) }, statistics);
  return snapshots;
}
