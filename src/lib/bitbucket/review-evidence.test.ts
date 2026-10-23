import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { demoDataset } from "../../features/pull-requests/services/fixtures";
import { computePullRequestViewModel } from "../../features/pull-requests/services/qa-state";
import type { ActivityEvent, Person, PullRequestSnapshot } from "../../types/domain";
import { compareRevision, personMatches } from "../review-revision";
import { enrichReviewEvidence, fingerprintPatch } from "./review-evidence";
import { normalizeReviewActivity } from "./review-activity";
import { readRepository } from "./reader";
import { BitbucketApiError } from "./contracts";

const oldHash = "a".repeat(40), newHash = "b".repeat(40), destinationHash = "c".repeat(40);
const qa = { accountId: "{qa}", uuid: "{qa}", atlassianAccountId: "account-qa", displayName: "QA" };
const resolver = { isQa: (person: Person) => personMatches(person, new Set(["account-qa"])) };
const patch = (value: string, index = "1234567..7654321") => `diff --git a/a.ts b/a.ts\nindex ${index} 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+${value}\n`;
const stats = { values: [{ lines_added: 1, lines_removed: 1, old: { path: "a.ts" }, new: { path: "a.ts" } }] };
const diffstats = vi.fn().mockImplementation(async (_path: string, schema: z.ZodType) => schema.parse(stats));
const base = (): PullRequestSnapshot => ({ ...structuredClone(demoDataset.pullRequests[0]), sourceHash: newHash, destinationHash, reviewEvidenceLimited: true, comments: [{ id: 1, author: qa, createdAt: "2026-10-22T10:00:00Z", content: "Corregir timeout", inline: false, link: "#" }], commits: [], activity: [] });
const revision = (hash: string, at: string): ActivityEvent => ({ id: `rev-${hash}`, kind: "metadata_updated", actor: qa, createdAt: at, sourceHash: hash, destinationHash, link: "#" });
const revisions = () => [revision(oldHash, "2026-10-22T09:00:00Z"), revision(newHash, "2026-10-22T12:00:00Z")];
const approval = (at = "2026-10-22T11:00:00Z", active = true): ActivityEvent => ({ id: "approval", kind: "approval_added", actor: qa, createdAt: at, approvalActive: active, link: "#" });
const model = (pr: PullRequestSnapshot) => computePullRequestViewModel(pr, resolver, new Set());

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-22T14:00:00Z")); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("bounded, conservative content evidence", () => {
  it.each([
    { values: [...stats.values, { ...stats.values[0], old: { path: "missing.ts" }, new: { path: "missing.ts" } }] },
    { values: [{ ...stats.values[0], lines_added: 2 }] },
    { values: [...stats.values, ...stats.values] },
  ])("does not trust a syntactically complete patch whose file/line coverage differs from diffstat", async (statistics) => {
    const pr = base();
    await enrichReviewEvidence({ get: vi.fn().mockImplementation(async (_path: string, schema: z.ZodType) => schema.parse(statistics)), getText: vi.fn(async () => patch("new")) }, pr, revisions(), [qa.accountId]);
    expect(compareRevision(pr, "2026-10-22T10:00:00Z")).toBe("unknown");
  });
  it("ignores object index hashes, but distinguishes actual patch content", async () => {
    const first = await fingerprintPatch(patch("new"));
    expect(first?.changedFiles).toBe(1);
    expect((await fingerprintPatch(patch("new", "aaaaaaa..bbbbbbb")))?.fingerprint).toBe(first?.fingerprint);
    expect((await fingerprintPatch(patch("different")))?.fingerprint).not.toBe(first?.fingerprint);
    expect((await fingerprintPatch(""))?.changedFiles).toBe(0);
  });
  it.each(["<html>error</html>", "diff --git a/a b/a\n", "diff --git a/a b/a\nBinary files a/a and b/a differ\n", patch("new").replace("@@ -1 +1 @@", "@@ -1,3 +1,3 @@"), patch("new").slice(0, -1), patch("new") + "Diff truncated\n"])("does not fingerprint unsupported or incomplete data: %s", async (value) => {
    expect(await fingerprintPatch(value)).toBeUndefined();
  });
  it("preserves CR content and refuses to declare shifted hunks equivalent", async () => {
    expect((await fingerprintPatch(patch("new\r")))?.fingerprint).not.toBe((await fingerprintPatch(patch("new")))?.fingerprint);
    const pr = base();
    await enrichReviewEvidence({ get: diffstats, getText: vi.fn(async (path) => path.includes(oldHash) ? patch("new") : patch("new").replace("@@ -1 +1 @@", "@@ -2 +2 @@")) }, pr, revisions(), [qa.accountId]);
    expect(compareRevision(pr, "2026-10-22T10:00:00Z")).toBe("unknown");
  });
  it("uses source..destination with topic=true and reuses immutable revision fingerprints", async () => {
    const pr = base();
    const getText = vi.fn(async (path: string) => path.includes(oldHash) ? patch("before") : patch("after"));
    await enrichReviewEvidence({ get: diffstats, getText }, pr, revisions(), ["account-qa"]);
    expect(getText).toHaveBeenCalledWith(`/repositories/kontroller_test/kontroller_test/diff/${newHash}..${destinationHash}?topic=true&context=0&binary=true`);
    expect(getText).toHaveBeenCalledTimes(2);
    expect(model(pr).flowState).toBe("UPDATED");
    const next = base();
    await enrichReviewEvidence({ get: diffstats, getText }, next, revisions(), ["account-qa"], pr);
    expect(getText).toHaveBeenCalledTimes(2);
  });
  it("keeps hash-only/rebase changes out of the effective-change claim", async () => {
    const pr = base();
    await enrichReviewEvidence({ get: diffstats, getText: vi.fn(async () => patch("same")) }, pr, revisions(), [qa.accountId]);
    expect(model(pr).flowState).toBe("QA_FEEDBACK");
    expect(model(pr).hasEffectiveCodeChange).toBe(false);
  });
  it("falls back to a verification queue when later commits exist but the diff is unavailable", async () => {
    const pr = base();
    pr.commits = [{ ...demoDataset.pullRequests[0].commits[0], committedAt: "2026-10-22T12:00:00Z" }];
    await enrichReviewEvidence({ get: diffstats, getText: vi.fn().mockRejectedValue(new Error("Unavailable")) }, pr, revisions(), [qa.accountId]);
    expect(model(pr).flowState).toBe("COMMITS_PENDING");
    expect(model(pr).nextOwner).toBe("qa");
    expect(model(pr).hasEffectiveCodeChange).toBe(false);
  });
  it.each([{ events: [] }, { events: [revision(oldHash, "2026-10-22T09:00:00Z")] }, { events: [...revisions(), { ...revision(newHash, "2026-10-22T13:00:00Z"), sourceHash: undefined }] }])("does not infer historical revisions from incomplete activity", async ({ events }) => {
    const pr = base();
    await enrichReviewEvidence({ get: diffstats, getText: vi.fn(async () => patch("same")) }, pr, events, [qa.accountId]);
    expect(compareRevision(pr, "2026-10-22T10:00:00Z")).toBe("unknown");
  });
  it("propagates revoked repository access instead of keeping private evidence", async () => {
    await expect(enrichReviewEvidence({ get: diffstats, getText: vi.fn().mockRejectedValue(new BitbucketApiError(403, "Forbidden", "forbidden")) }, base(), revisions(), [qa.accountId])).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("approvals belong to a reviewed revision", () => {
  it.each([
    { at: "2026-10-22T11:00:00Z", active: true, expected: "UPDATED" },
    { at: "2026-10-22T13:00:00Z", active: true, expected: "QA_APPROVED" },
    { at: "2026-10-22T13:00:00Z", active: false, expected: "UPDATED" },
  ])("$expected for approval at $at, active=$active", async ({ at, active, expected }) => {
    const pr = base(); pr.activity = [...revisions(), approval(at, active)];
    await enrichReviewEvidence({ get: diffstats, getText: vi.fn(async (path) => path.includes(oldHash) ? patch("before") : patch("after")) }, pr, pr.activity, [qa.accountId]);
    expect(model(pr).flowState).toBe(expected);
  });
  it("invalidates old approval even if QA never left a comment", async () => {
    const pr = base(); pr.comments = []; pr.activity = [...revisions(), approval()];
    await enrichReviewEvidence({ get: diffstats, getText: vi.fn(async (path) => path.includes(oldHash) ? patch("before") : patch("after")) }, pr, pr.activity, [qa.accountId]);
    expect(model(pr).flowState).toBe("UPDATED");
  });
  it("does not treat self-review or a same-name person as team QA", async () => {
    const pr = base(); pr.author = qa;
    pr.activity = [...revisions(), approval("2026-10-22T13:00:00Z")];
    await enrichReviewEvidence({ get: vi.fn() }, pr, pr.activity, [qa.accountId]);
    expect(model(pr).flowState).toBe("AUTHOR_RESPONDED");
    expect(personMatches({ accountId: "other", displayName: "QA" }, new Set([qa.accountId]))).toBe(false);
  });
  it("requires current participant approval in addition to historical activity", () => {
    const raw = [{ approval: { date: "2026-10-22T13:00:00Z", user: { uuid: qa.accountId, display_name: qa.displayName } } }];
    expect(normalizeReviewActivity(raw, base(), [])[0].approvalActive).toBe(false);
    expect(normalizeReviewActivity(raw, base(), [{ user: { uuid: qa.accountId, display_name: qa.displayName }, approved: true }])[0].approvalActive).toBe(true);
  });
});

it("ingests live activity and approval, then skips unchanged evidence until QA IDs change", async () => {
  const pr = base();
  const summary = { id: pr.id, title: pr.title, state: "OPEN", author: { uuid: "{dev}", display_name: "Dev" }, created_on: pr.createdAt, updated_on: pr.updatedAt, source: { commit: { hash: newHash } }, destination: { commit: { hash: destinationHash } }, participants: [{ user: { uuid: qa.accountId, display_name: "QA" }, approved: true }] };
  const get = vi.fn().mockImplementation(async (path: string, schema: z.ZodType) => schema.parse(path.includes("state=OPEN") ? { values: [summary] } : path.includes("state=MERGED") || path.includes("/comments?") || path.includes("/commits?") ? { values: [] } : path.endsWith("/activity") ? { values: [{ update: { date: "2026-10-22T09:00:00Z", source: summary.source, destination: summary.destination } }, { approval: { date: "2026-10-22T13:00:00Z", user: { uuid: qa.accountId, display_name: "QA" } } }] } : summary));
  const client = { get, getText: vi.fn(async () => patch("same")) };
  const first = await readRepository(client, pr.repository, [], undefined, [qa.accountId]);
  expect(computePullRequestViewModel(first[0], { isQa: (person) => person.accountId === qa.accountId }, new Set()).flowState).toBe("QA_APPROVED");
  const count = get.mock.calls.length;
  await readRepository(client, pr.repository, first, undefined, [qa.accountId]);
  expect(get).toHaveBeenCalledTimes(count + 2);
  await readRepository(client, pr.repository, first, undefined, ["different-qa"]);
  expect(get).toHaveBeenCalledTimes(count + 8);
});
