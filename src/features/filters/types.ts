import type { OverviewPreferences, PullRequestFilters, PullRequestViewModel, UserRole } from "../../types/domain";

export type FilterState = PullRequestFilters;

export function initialFiltersForRole(role: UserRole): FilterState {
  return { repository: "all", authors: [], activity: role === "observer" ? "all" : "attention", status: "active" };
}

export function initialOverviewForRole(role: UserRole): OverviewPreferences {
  return { filters: initialFiltersForRole(role), allAuthors: false, summary: "" };
}

export function requiresAttention(pullRequest: PullRequestViewModel, role: UserRole): boolean {
  return role === "observer" || pullRequest.nextOwner === (role === "qa" ? "qa" : "developer");
}
