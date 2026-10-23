import { describe, expect, it } from "vitest";
import { normalizePullRequestComment, normalizePullRequestSummary } from "../../../lib/bitbucket/normalizers";
import { requiresAttention } from "../../filters/types";
import { computePullRequestViewModel } from "./qa-state";

const author = { uuid: "{developer}", display_name: "Desarrollador" };
const qa = { uuid: "{qa}", display_name: "QA" };
const repository = { workspace: "team", slug: "app", label: "App", name: "app" };
const summary = { id: 42, title: "PR real", author, state: "OPEN", created_on: "2026-10-22T09:00:00Z", updated_on: "2026-10-22T13:00:00Z" };
const comment = (id: number, user: typeof author, hour: number) => normalizePullRequestComment({ id, user, created_on: `2026-10-22T${hour}:00:00Z`, content: { raw: "Comentario" } });

describe("normalized Bitbucket comments and role ownership", () => {
  it.each([
    ["new PR", [], "NEW", true, false],
    ["QA feedback", [comment(1, qa, 10)], "QA_FEEDBACK", false, true],
    ["author response", [comment(1, qa, 10), comment(2, author, 11)], "AUTHOR_RESPONDED", true, false],
    ["another QA section after a response", [comment(1, qa, 10), comment(2, author, 11), comment(3, qa, 12)], "QA_FEEDBACK", false, true],
    ["third-party comment", [comment(1, qa, 10), comment(2, { uuid: "{other}", display_name: "Otra persona" }, 12)], "QA_FEEDBACK", false, true],
  ] as const)("routes %s without mixing the two attention lists", (_name, comments, expected, qaAttention, developerAttention) => {
    const pr = { ...normalizePullRequestSummary(summary, repository), comments: [...comments] };
    const model = computePullRequestViewModel(pr, { isQa: (person) => person.accountId === qa.uuid }, new Set());
    expect(model.flowState).toBe(expected);
    expect(requiresAttention(model, "qa")).toBe(qaAttention);
    expect(requiresAttention(model, "developer")).toBe(developerAttention);
    expect(requiresAttention(model, "observer")).toBe(true);
  });
  it("keeps finalized PR out of both action lists", () => {
    const pr = normalizePullRequestSummary({ ...summary, state: "MERGED" }, repository);
    const model = computePullRequestViewModel(pr, { isQa: () => false }, new Set());
    expect(requiresAttention(model, "qa")).toBe(false);
    expect(requiresAttention(model, "developer")).toBe(false);
  });
  it("routes unverified post-review commits to QA without claiming an effective fix", () => {
    const pr = { ...normalizePullRequestSummary(summary, repository), reviewEvidenceLimited: true, comments: [comment(1, qa, 10)], commits: [{ hash: "new", message: "Push", author: { accountId: author.uuid, displayName: author.display_name }, authoredAt: "2026-10-22T12:00:00Z", committedAt: "2026-10-22T12:00:00Z", parents: [], effectiveDiffFingerprint: "hash-only", changedFiles: 0 }] };
    const model = computePullRequestViewModel(pr, { isQa: (person) => person.accountId === qa.uuid }, new Set());
    expect(model.flowState).toBe("COMMITS_PENDING");
    expect(model.hasEffectiveCodeChange).toBe(false);
    expect(requiresAttention(model, "qa")).toBe(true);
    expect(requiresAttention(model, "developer")).toBe(false);
    expect(requiresAttention(model, "observer")).toBe(true);
  });
});
