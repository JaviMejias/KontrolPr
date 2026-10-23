import { expect, it } from "vitest";
import { demoDataset } from "../../pull-requests/services/fixtures";
import { discoverDevelopers } from "./tracking";

it("discovers stable identities from reviewers, comments, commits and review activity without duplicating people", () => {
  const pr = structuredClone(demoDataset.pullRequests[0]);
  pr.comments = [];
  pr.participants = [{ accountId: "reviewer", displayName: "Reviewer" }, { accountId: "", displayName: "Anonymous" }];
  pr.activity = [{ id: "approval", kind: "approval_added", actor: { accountId: "qa-activity", displayName: "QA with no comments" }, createdAt: pr.updatedAt, link: pr.htmlUrl }];
  pr.commits = [{ hash: "hash", message: "Fix", author: pr.participants[0], authoredAt: pr.createdAt, committedAt: pr.createdAt, parents: [], effectiveDiffFingerprint: "", changedFiles: 0 }];
  expect(discoverDevelopers([pr, pr]).map(({ person }) => person.accountId).sort()).toEqual([pr.author.accountId, "qa-activity", "reviewer"].sort());
});
