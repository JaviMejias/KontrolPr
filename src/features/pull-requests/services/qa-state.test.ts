import { describe, expect, it } from "vitest";
import { computePullRequestViewModel } from "./qa-state";
import type { PullRequestSnapshot, Person } from "../../../types/domain";

const qa: Person = { accountId: "qa-1", displayName: "Javier Mejías" };
const author: Person = { accountId: "dev-1", displayName: "Ana Torres" };
const resolver = { isQa: (person: Person) => person.accountId.startsWith("qa-") };
const base = (overrides: Partial<PullRequestSnapshot> = {}): PullRequestSnapshot => ({
  key: "kontroller_test#42",
  repository: { workspace: "kontroller_test", slug: "kontroller_test", name: "kontroller_test", label: "Kontroller Test" },
  id: 42,
  title: "Improve provider retry handling",
  description: "",
  author,
  sourceBranch: "feature/provider-retries",
  destinationBranch: "main",
  state: "OPEN",
  draft: false,
  queued: false,
  createdAt: "2026-10-20T09:00:00Z",
  updatedAt: "2026-10-22T09:00:00Z",
  htmlUrl: "https://bitbucket.org/kontroller_test/kontroller_test/pull-requests/42",
  rawState: "OPEN",
  comments: [],
  commits: [],
  activity: [],
  diffFingerprint: "diff-a",
  ...overrides,
});

describe("computePullRequestViewModel", () => {
  it("detects a new PR once through local event observation", () => {
    const pullRequest = base({ activity: [{ id: "created-42", kind: "pull_request_created", actor: author, createdAt: "2026-10-20T09:00:00Z", link: "#" }] });
    expect(computePullRequestViewModel(pullRequest, resolver, new Set()).newEventCount).toBe(1);
    expect(computePullRequestViewModel(pullRequest, resolver, new Set(["created-42"])).newEventCount).toBe(0);
  });

  it("does not transition on title or description changes", () => {
    const pullRequest = base({ title: "Renamed", description: "Updated context" });
    expect(computePullRequestViewModel(pullRequest, resolver, new Set()).flowState).toBe("NEW");
  });

  it("waits for the developer after QA feedback", () => {
    const pullRequest = base({ comments: [{ id: 1, author: qa, createdAt: "2026-10-22T10:00:00Z", content: "Please handle timeout", inline: true, link: "#" }] });
    expect(computePullRequestViewModel(pullRequest, resolver, new Set()).flowState).toBe("QA_FEEDBACK");
  });

  it("recognizes a developer response without treating it as code change", () => {
    const pullRequest = base({ comments: [{ id: 1, author: qa, createdAt: "2026-10-22T10:00:00Z", content: "Please handle timeout", inline: true, link: "#" }, { id: 2, author, createdAt: "2026-10-22T11:00:00Z", content: "I will review this", parentId: 1, inline: false, link: "#" }] });
    const result = computePullRequestViewModel(pullRequest, resolver, new Set());
    expect(result.flowState).toBe("AUTHOR_RESPONDED");
    expect(result.hasEffectiveCodeChange).toBe(false);
  });

  it("requires QA after an effective commit following feedback", () => {
    const pullRequest = base({ comments: [{ id: 1, author: qa, createdAt: "2026-10-22T10:00:00Z", content: "Please handle timeout", inline: true, link: "#" }], commits: [{ hash: "h1", message: "Fix timeout", author, authoredAt: "2026-10-22T12:00:00Z", committedAt: "2026-10-22T12:00:00Z", parents: ["p1"], effectiveDiffFingerprint: "diff-b", changedFiles: 1 }] });
    expect(computePullRequestViewModel(pullRequest, resolver, new Set()).flowState).toBe("UPDATED");
  });

  it("does not require QA for a hash-only or no-file merge commit", () => {
    const pullRequest = base({ comments: [{ id: 1, author: qa, createdAt: "2026-10-22T10:00:00Z", content: "Please handle timeout", inline: true, link: "#" }], commits: [{ hash: "merge-hash", message: "Merge branch main", author, authoredAt: "2026-10-22T12:00:00Z", committedAt: "2026-10-22T12:00:00Z", parents: ["p1", "p2"], effectiveDiffFingerprint: "diff-a", changedFiles: 0 }] });
    expect(computePullRequestViewModel(pullRequest, resolver, new Set()).flowState).toBe("QA_FEEDBACK");
  });

  it("keeps merged PRs inactive regardless of activity", () => {
    expect(computePullRequestViewModel(base({ state: "MERGED" }), resolver, new Set()).flowState).toBe("INACTIVE");
  });

  it("does not create a new review for a rebase with the same effective fingerprint", () => {
    const pullRequest = base({ reviewedDiffFingerprint: "diff-a", comments: [{ id: 1, author: qa, createdAt: "2026-10-22T10:00:00Z", content: "Please check the timeout", inline: true, link: "#" }], commits: [{ hash: "rebased-hash", message: "Rebase branch", author, authoredAt: "2026-10-22T12:00:00Z", committedAt: "2026-10-22T12:00:00Z", parents: ["new-parent"], effectiveDiffFingerprint: "diff-a", changedFiles: 2 }] });
    expect(computePullRequestViewModel(pullRequest, resolver, new Set()).flowState).toBe("QA_FEEDBACK");
  });

  it("detects a force push when its effective fingerprint changes", () => {
    const pullRequest = base({ reviewedDiffFingerprint: "diff-a", comments: [{ id: 1, author: qa, createdAt: "2026-10-22T10:00:00Z", content: "Please check the timeout", inline: true, link: "#" }], commits: [{ hash: "force-pushed-hash", message: "Fix timeout", author, authoredAt: "2026-10-22T12:00:00Z", committedAt: "2026-10-22T12:00:00Z", parents: ["new-parent"], effectiveDiffFingerprint: "diff-c", changedFiles: 1 }] });
    expect(computePullRequestViewModel(pullRequest, resolver, new Set()).flowState).toBe("UPDATED");
  });

  it("uses a verified approval only for the current review sequence", () => {
    const pullRequest = base({ comments: [{ id: 1, author: qa, createdAt: "2026-10-22T10:00:00Z", content: "Looks good", inline: false, link: "#" }], activity: [{ id: "approval-1", kind: "approval_added", actor: qa, createdAt: "2026-10-22T11:00:00Z", link: "#" }] });
    expect(computePullRequestViewModel(pullRequest, resolver, new Set()).flowState).toBe("QA_APPROVED");
  });

  it("marks an old active PR as stale without changing its flow state", () => {
    const pullRequest = base({ updatedAt: "2026-10-10T09:00:00Z" });
    const result = computePullRequestViewModel(pullRequest, resolver, new Set(), new Date("2026-10-22T09:00:00Z"));
    expect(result.stale).toBe(true);
    expect(result.flowState).toBe("NEW");
  });

  it("deduplicates an event returned by two consecutive sync responses", () => {
    const event = { id: "same-event", kind: "pull_request_created" as const, actor: author, createdAt: "2026-10-20T09:00:00Z", link: "#" };
    const pullRequest = base({ activity: [event, event] });
    expect(computePullRequestViewModel(pullRequest, resolver, new Set()).newEventCount).toBe(1);
  });

  it("keeps local novelty independent from the flow state", () => {
    const pullRequest = base({ comments: [{ id: 1, author: qa, createdAt: "2026-10-22T10:00:00Z", content: "Please check the timeout", inline: true, link: "#" }] });
    const result = computePullRequestViewModel(pullRequest, resolver, new Set(["comment-1"]));
    expect(result.flowState).toBe("QA_FEEDBACK");
    expect(result.newEventCount).toBe(0);
  });
});
