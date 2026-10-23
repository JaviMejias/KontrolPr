import { describe, expect, it } from "vitest";
import type { FlowState, UserRole } from "../../types/domain";
import { demoDataset } from "../pull-requests/services/fixtures";
import { computePullRequestViewModel } from "../pull-requests/services/qa-state";
import { initialFiltersForRole, requiresAttention } from "./types";

describe("role-aware attention", () => {
  const base = computePullRequestViewModel(demoDataset.pullRequests[0], { isQa: () => false }, new Set());
  const cases: [FlowState, "qa" | "developer" | "none", boolean, boolean][] = [
    ["NEW", "qa", true, false], ["UPDATED", "qa", true, false], ["AUTHOR_RESPONDED", "qa", true, false],
    ["QA_FEEDBACK", "developer", false, true], ["QA_APPROVED", "none", false, false], ["INACTIVE", "none", false, false],
  ];
  it.each(cases)("routes %s to its next owner, while observers can see it", (flowState, nextOwner, qa, developer) => {
    const pr = { ...base, flowState, nextOwner };
    expect(requiresAttention(pr, "qa")).toBe(qa);
    expect(requiresAttention(pr, "developer")).toBe(developer);
    expect(requiresAttention(pr, "observer")).toBe(true);
  });
  it.each<UserRole>(["qa", "developer", "observer"])("starts %s with the appropriate activity filter", (role) => {
    expect(initialFiltersForRole(role).activity).toBe(role === "observer" ? "all" : "attention");
    expect(initialFiltersForRole(role).status).toBe("active");
  });
});
