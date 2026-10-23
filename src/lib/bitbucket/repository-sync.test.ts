import { expect, it, vi } from "vitest";
import { z } from "zod";
import { readRepository } from "./reader";
import { BitbucketApiError } from "./contracts";
import { fullReconciliationIntervalMs, incrementalOverlapMs, type RepositoryCheckpoint, type RepositoryReadOptions } from "./repository-sync";
import type { PullRequestSnapshot, RepositorySyncStatistics } from "../../types/domain";
import { computePullRequestViewModel } from "../../features/pull-requests/services/qa-state";

const repository = { workspace: "team", slug: "app", name: "App", label: "App" };
const startedAt = Date.parse("2026-10-23T12:00:00Z");
const author = { uuid: "developer", display_name: "Developer" };
const reviewer = { uuid: "qa", display_name: "QA" };
type RemotePr = { id: number; title: string; state: string; author: typeof author; created_on: string; updated_on: string; source?: { commit: { hash: string } }; destination?: { commit: { hash: string } }; participants?: { user: typeof reviewer; approved: boolean }[] };
const summary = (id: number, updatedAt = startedAt - 3600000, state = "OPEN"): RemotePr => ({ id, title: `PR ${id}`, state, author, created_on: "2026-10-22T09:00:00Z", updated_on: new Date(updatedAt).toISOString() });

function provider(count = 1) {
  let rows = Array.from({ length: count }, (_, index) => summary(index + 1));
  const comments = new Map<number, unknown[]>();
  const commits = new Map<number, unknown[]>();
  const activity = new Map<number, unknown[]>();
  let fail: ((url: URL) => void) | undefined;
  const get = vi.fn(async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
    const url = new URL(path, "https://api.bitbucket.org");
    fail?.(url);
    if (url.pathname.endsWith("/pullrequests")) {
      const states = url.searchParams.getAll("state");
      const after = /updated_on >= "([^"]+)"/.exec(url.searchParams.get("q") ?? "")?.[1];
      const selected = rows.filter((row) => states.includes(row.state) && (!after || Date.parse(row.updated_on) >= Date.parse(after))).sort((a, b) => Date.parse(b.updated_on) - Date.parse(a.updated_on));
      const page = Number(url.searchParams.get("page") ?? 1);
      const values = selected.slice((page - 1) * 50, page * 50);
      url.searchParams.set("page", String(page + 1));
      return schema.parse({ values, ...(page * 50 < selected.length ? { next: url.href } : {}) });
    }
    const id = Number(/pullrequests\/(\d+)/.exec(url.pathname)?.[1]);
    if (url.pathname.endsWith("/comments")) return schema.parse({ values: comments.get(id) ?? [] });
    if (url.pathname.endsWith("/commits")) return schema.parse({ values: commits.get(id) ?? [] });
    if (url.pathname.endsWith("/activity")) return schema.parse({ values: activity.get(id) ?? [] });
    return schema.parse(rows.find((row) => row.id === id));
  });
  const read = async (previous: PullRequestSnapshot[] = [], options: RepositoryReadOptions = {}, qaIds = [reviewer.uuid]) => {
    let checkpoint: RepositoryCheckpoint | undefined, statistics: RepositorySyncStatistics | undefined;
    const snapshots = await readRepository({ get: async (path, schema) => schema.parse(await get(path, schema)) }, repository, previous, undefined, qaIds, { now: startedAt, ...options, onComplete: (next, metrics) => { checkpoint = next; statistics = metrics; options.onComplete?.(next, metrics); } });
    if (!checkpoint || !statistics) throw new Error("Missing completed synchronization metadata");
    return { snapshots, checkpoint, statistics };
  };
  return { get, read, comments, commits, activity, rows: () => rows, replace: (next: RemotePr[]) => { rows = next; }, fail: (next?: (url: URL) => void) => { fail = next; } };
}

it("reduces unchanged 1,000-PR listing from 21 requests to 1, preserving the entire inventory", async () => {
  const remote = provider(1000);
  const first = await remote.read();
  expect(first.statistics.requests).toBe(2021);
  expect(first.statistics.refreshed).toBe(1000);
  const full = await remote.read(first.snapshots, { now: startedAt + 600000 });
  expect(full.statistics).toMatchObject({ mode: "full", requests: 21, reused: 1000, refreshed: 0 });
  const incremental = await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 600000 });
  expect(incremental.statistics).toEqual({ mode: "incremental", requests: 1, listed: 0, refreshed: 0, reused: 1000, removed: 0 });
  expect(incremental.snapshots).toEqual(first.snapshots);
  const url = new URL(remote.get.mock.calls.at(-1)![0], "https://api.bitbucket.org");
  expect(url.searchParams.getAll("state")).toEqual(["OPEN", "MERGED", "DECLINED"]);
  expect(url.searchParams.get("q")).toBe(`updated_on >= "${new Date(startedAt - incrementalOverlapMs).toISOString()}"`);
  expect(url.searchParams.get("fields")?.split(",")).toContain("next");
});

it("updates only five changed PR out of 1,000: 11 requests instead of 31", async () => {
  const remote = provider(1000); const first = await remote.read();
  remote.replace(remote.rows().map((row) => row.id <= 5 ? { ...row, updated_on: new Date(startedAt + 300000).toISOString() } : row));
  for (let id = 1; id <= 5; id++) remote.comments.set(id, [{ id, user: reviewer, created_on: new Date(startedAt + 300000).toISOString(), content: { raw: "Revisar validación" } }]);
  const baseline = await remote.read(first.snapshots, { now: startedAt + 600000 });
  const updated = await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 600000 });
  expect(baseline.statistics.requests).toBe(31);
  expect(updated.statistics).toMatchObject({ requests: 11, listed: 5, refreshed: 5, reused: 995 });
  expect(updated.snapshots).toEqual(baseline.snapshots);
  const model = computePullRequestViewModel(updated.snapshots[0], { isQa: (person) => person.accountId === reviewer.uuid }, new Set());
  expect(model.nextOwner).toBe("developer"); expect(model.flowState).toBe("QA_FEEDBACK");
});

it("discovers new PR, merges and declines without removing untouched open PR", async () => {
  const remote = provider(3); const first = await remote.read();
  remote.replace([summary(1, startedAt + 1000, "MERGED"), summary(2, startedAt + 1000, "DECLINED"), remote.rows()[2], summary(4, startedAt + 1000)]);
  const next = await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 600000 });
  expect(next.snapshots.map((pr) => [pr.id, pr.state])).toEqual([[1, "MERGED"], [2, "DECLINED"], [3, "OPEN"], [4, "OPEN"]]);
  expect(new Set(next.snapshots.map((pr) => pr.key)).size).toBe(4);
});

it("uses every incremental page and supports a previously empty repository", async () => {
  const remote = provider(0); const empty = await remote.read();
  remote.replace(Array.from({ length: 101 }, (_, index) => summary(index + 1, startedAt + 1000)));
  const next = await remote.read([], { checkpoint: empty.checkpoint, now: startedAt + 600000 });
  expect(next.statistics).toMatchObject({ mode: "incremental", requests: 205, listed: 101, refreshed: 101 });
  expect(next.snapshots).toHaveLength(101);
  expect(next.checkpoint.pullRequestIds).toHaveLength(101);
});

it("rechecks details at the hourly reconciliation, including comments whose PR timestamp did not change", async () => {
  const remote = provider(); const first = await remote.read();
  remote.comments.set(1, [{ id: 50, user: reviewer, created_on: new Date(startedAt + 1000).toISOString(), content: { raw: "Comentario no anunciado" } }]);
  const next = await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + fullReconciliationIntervalMs });
  expect(next.statistics).toMatchObject({ mode: "full", requests: 4, refreshed: 1 });
  expect(next.snapshots[0].comments[0].content).toBe("Comentario no anunciado");
  expect(next.checkpoint.fullSyncedAt).toBe(startedAt + fullReconciliationIntervalMs);
  remote.comments.set(1, []);
  const forced = await remote.read(next.snapshots, { checkpoint: next.checkpoint, now: startedAt + fullReconciliationIntervalMs + 1, forceFull: true });
  expect(forced.snapshots[0].comments).toEqual([]);
});

it("reconciles approval removal and commit changes, without reusing obsolete evidence", async () => {
  const remote = provider();
  const raw = { ...remote.rows()[0], source: { commit: { hash: "a".repeat(12) } }, destination: { commit: { hash: "b".repeat(12) } }, participants: [{ user: reviewer, approved: true }] };
  remote.replace([raw]);
  remote.activity.set(1, [{ approval: { date: "2026-10-23T11:30:00Z", user: reviewer } }]);
  const first = await remote.read();
  expect(first.snapshots[0].activity.some((event) => event.approvalActive)).toBe(true);
  remote.replace([{ ...raw, updated_on: new Date(startedAt + 1000).toISOString(), source: { commit: { hash: "c".repeat(12) } }, participants: [] }]);
  remote.activity.set(1, []);
  remote.commits.set(1, [{ hash: "c".repeat(12), message: "Fix validation", date: new Date(startedAt + 1000).toISOString(), author: { user: author } }]);
  const next = await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 600000 });
  expect(next.snapshots[0].activity.some((event) => event.approvalActive)).toBe(false);
  expect(next.snapshots[0].commits[0].message).toBe("Fix validation");
  expect(next.snapshots[0].sourceHash).toBe("c".repeat(12));
});

it("does not publish a checkpoint after a page or detail failure, and retries the original watermark", async () => {
  const remote = provider(2); const first = await remote.read();
  remote.replace([summary(1, startedAt + 1000), summary(2, startedAt + 1000)]);
  const complete = vi.fn();
  remote.fail((url) => { if (url.pathname.endsWith("/2/comments")) throw new BitbucketApiError(429, "Limited", "rate_limited"); });
  await expect(remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 600000, onComplete: complete })).rejects.toMatchObject({ status: 429 });
  expect(complete).not.toHaveBeenCalled();
  expect(first.snapshots[0].updatedAt).toBe(summary(1).updated_on);
  remote.fail();
  const retried = await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 1200000 });
  expect(retried.statistics.refreshed).toBe(2);
  expect(retried.checkpoint.cursor).toBe(startedAt + 1200000);
});

it("does not process a partial incremental page set or mark it synchronized", async () => {
  const remote = provider(0); const first = await remote.read();
  remote.replace(Array.from({ length: 51 }, (_, index) => summary(index + 1, startedAt + 1000)));
  const complete = vi.fn();
  remote.fail((url) => { if (url.searchParams.get("page") === "2") throw new BitbucketApiError(undefined, "offline", "network"); });
  await expect(remote.read([], { checkpoint: first.checkpoint, now: startedAt + 600000, onComplete: complete })).rejects.toMatchObject({ code: "network" });
  expect(complete).not.toHaveBeenCalled();
  expect(remote.get.mock.calls.some(([path]) => path.includes("/comments"))).toBe(false);
  remote.fail();
  expect((await remote.read([], { checkpoint: first.checkpoint, now: startedAt + 1200000 })).snapshots).toHaveLength(51);
});

it("does not reuse cached detail when commit hashes change without a timestamp change", async () => {
  const remote = provider();
  const raw = { ...remote.rows()[0], source: { commit: { hash: "a".repeat(12) } }, destination: { commit: { hash: "b".repeat(12) } } };
  remote.replace([raw]); const first = await remote.read();
  remote.replace([{ ...raw, source: { commit: { hash: "c".repeat(12) } } }]);
  const next = await remote.read(first.snapshots);
  expect(next.statistics.refreshed).toBe(1);
  expect(next.snapshots[0].sourceHash).toBe("c".repeat(12));
});

it("revokes unannounced cached approvals during periodic detail reconciliation", async () => {
  const remote = provider();
  const raw = { ...remote.rows()[0], source: { commit: { hash: "a".repeat(12) } }, destination: { commit: { hash: "b".repeat(12) } }, participants: [{ user: reviewer, approved: true }] };
  remote.replace([raw]); remote.activity.set(1, [{ approval: { date: "2026-10-23T11:30:00Z", user: reviewer } }]);
  const first = await remote.read();
  expect(first.snapshots[0].activity.some((event) => event.approvalActive)).toBe(true);
  remote.replace([{ ...raw, participants: [] }]); remote.activity.set(1, []);
  const next = await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + fullReconciliationIntervalMs });
  expect(next.snapshots[0].activity.some((event) => event.approvalActive)).toBe(false);
});

it("falls back to full reading only for unsupported incremental filters, never for authorization failures", async () => {
  const remote = provider(); const first = await remote.read();
  remote.fail((url) => { if (url.searchParams.getAll("state").length === 3) throw new BitbucketApiError(400, "Invalid filter", "unknown"); });
  const fallback = await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 600000 });
  expect(fallback.statistics).toMatchObject({ mode: "full", requests: 5, refreshed: 1 });
  remote.get.mockClear();
  remote.fail(() => { throw new BitbucketApiError(403, "Forbidden", "forbidden"); });
  await expect(remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 600000 })).rejects.toMatchObject({ code: "forbidden" });
  expect(remote.get).toHaveBeenCalledTimes(1);
});

it("removes deleted/missing PR on reconciliation and prunes expired finalized items during deltas", async () => {
  const remote = provider(2); const first = await remote.read();
  remote.replace([summary(2, startedAt + 1000, "MERGED")]);
  const merged = await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 600000 });
  expect(merged.snapshots).toHaveLength(2);
  const reconciled = await remote.read(merged.snapshots, { checkpoint: merged.checkpoint, now: startedAt + fullReconciliationIntervalMs });
  expect(reconciled.snapshots.map((pr) => pr.id)).toEqual([2]);
  expect(reconciled.statistics.removed).toBe(1);
  const oldClosed = { ...reconciled.snapshots[0], updatedAt: "2026-09-01T00:00:00Z" };
  const expired = await remote.read([oldClosed], { checkpoint: reconciled.checkpoint, now: startedAt + fullReconciliationIntervalMs + 1 });
  expect(expired.snapshots).toEqual([]);
  expect(expired.statistics.removed).toBe(1);
});

it("invalidates deltas on QA changes, inventory loss, wrong repository or future checkpoint", async () => {
  const remote = provider(2); const first = await remote.read();
  for (const checkpoint of [
    { ...first.checkpoint, repository: "other/app" },
    { ...first.checkpoint, cursor: startedAt + 9999999 },
    { ...first.checkpoint, pullRequestIds: [1] },
  ]) {
    expect((await remote.read(first.snapshots, { checkpoint, now: startedAt + 600000 })).statistics.mode).toBe("full");
  }
  expect((await remote.read(first.snapshots, { checkpoint: first.checkpoint, now: startedAt + 600000 }, ["other-qa"])).statistics.mode).toBe("full");
});
