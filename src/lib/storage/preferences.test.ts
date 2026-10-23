import { describe, expect, it, vi } from "vitest";
import { defaultPreferences, normalizePreferences, readStoredPreferences } from "./preferences";
import { loadPreferences, savePreferences } from "./indexed-db";

describe("versioned preferences and per-field recovery", () => {
  it.each([undefined, null, 12, "broken", [], { role: false, repositories: "bad", notificationsEnabled: "true" }])("recovers defaults from %j", (value) => {
    expect(normalizePreferences(value)).toEqual(defaultPreferences);
  });
  it("retains valid exclusions, read receipts and QA identities when neighboring entries are malformed", () => {
    const value = normalizePreferences({
      ignoredDeveloperIds: ["dev-a", 42, null, "dev-a", ""], ignoredPullRequestKeys: ["r#1", false], ignoredRepositoryDeveloperKeys: ["w/r:dev", {}], lastObservedEventIds: ["event-1", 7],
      qaAccountIds: ["qa-a", null], qaTeamBindings: { javier: { accountId: "{jm}", displayName: "Javier" }, diego: { accountId: 42 }, unknown: { accountId: "wrong", displayName: "Other" } },
      soundEnabled: true, notificationsEnabled: "false", firstSyncCompleted: true,
    });
    expect(value).toMatchObject({ ignoredDeveloperIds: ["dev-a"], ignoredPullRequestKeys: ["r#1"], ignoredRepositoryDeveloperKeys: ["w/r:dev"], lastObservedEventIds: ["event-1"], qaAccountIds: ["qa-a"], qaTeamBindings: { javier: { accountId: "{jm}", displayName: "Javier" } }, notificationsEnabled: false, soundEnabled: true, firstSyncCompleted: true });
    expect(Object.keys(value.qaTeamBindings ?? {})).toEqual(["javier", "unknown"]);
  });
  it("deduplicates repositories, discards invalid entries and respects an explicitly empty list", () => {
    const repo = defaultPreferences.repositories[0];
    expect(normalizePreferences({ repositories: [repo, { ...repo, slug: repo.slug.toUpperCase() }, { ...repo, workspace: "https://evil.example" }, { ...repo, slug: "../escape" }, null] }).repositories).toHaveLength(1);
    expect(normalizePreferences({ repositories: [] }).repositories).toEqual([]);
    expect(normalizePreferences({ repositories: [false, null] }).repositories).toEqual([]);
  });
  it("repairs role views independently and resets deleted repository filters", () => {
    const result = normalizePreferences({ ...defaultPreferences, overviewByRole: {
      qa: { filters: { activity: "new", authors: ["qa", null, "qa"], repository: "removed/repo", status: "inactive" }, allAuthors: true, summary: "bad" },
      observer: { filters: { activity: false } }, developer: { filters: { activity: "all", repository: "kontroller_test/kontroller_test" }, allAuthors: true, summary: "updated" },
    } });
    expect(result.overviewByRole?.qa).toEqual({ filters: { repository: "all", authors: ["qa"], activity: "attention", status: "inactive" }, allAuthors: false, summary: "" });
    expect(result.overviewByRole?.observer?.filters.activity).toBe("all");
    expect(result.overviewByRole?.developer).toMatchObject({ filters: { repository: "kontroller_test/kontroller_test", activity: "all" }, allAuthors: true, summary: "updated" });
    expect(normalizePreferences({ ...result, repositories: [] }).overviewByRole?.developer?.filters.repository).toBe("all");
  });
  it("supports legacy flat values and version-1 envelopes without accepting unknown fields", () => {
    const preferences = { ...defaultPreferences, ignoredDeveloperIds: ["dev-a"], token: "never-store-this" };
    expect(readStoredPreferences(preferences)).toEqual(readStoredPreferences({ version: 1, preferences }));
    expect(readStoredPreferences({ version: 1, preferences })).not.toHaveProperty("token");
    expect(readStoredPreferences({ version: 99, preferences })).toEqual(defaultPreferences);
  });
  it("does not expose mutable defaults between accounts", () => {
    const first = normalizePreferences(undefined);
    first.repositories[0].label = "Changed";
    expect(normalizePreferences(undefined).repositories[0].label).toBe(defaultPreferences.repositories[0].label);
  });
  it("persists an explicitly empty QA team and validates dynamic members individually", async () => {
    const person = { accountId: "qa-a", displayName: "QA A", nickname: "reviewer" };
    const repaired = normalizePreferences({ qaTeamMembers: [person, false, person, { accountId: "qa-b", displayName: "QA B" }], ignoredDeveloperIds: ["dev"] });
    expect(repaired.qaTeamMembers).toHaveLength(2);
    expect(repaired.ignoredDeveloperIds).toEqual(["dev"]);
    await savePreferences({ ...repaired, qaTeamMembers: [] }, "empty-qa-owner");
    expect((await loadPreferences("empty-qa-owner")).qaTeamMembers).toEqual([]);
  });
  it("keeps repaired preferences and role views isolated in the memory-only fallback", async () => {
    vi.stubGlobal("indexedDB", undefined);
    try {
      await savePreferences({ ...defaultPreferences, role: "developer", ignoredDeveloperIds: ["dev-a"], overviewByRole: { developer: { filters: { repository: "all", authors: ["dev-a"], activity: "all", status: "active" }, allAuthors: true, summary: "" } } }, "prefs-owner-a");
      await savePreferences(defaultPreferences, "prefs-owner-b");
      expect((await loadPreferences("prefs-owner-a")).overviewByRole?.developer?.allAuthors).toBe(true);
      expect(await loadPreferences("prefs-owner-b")).toEqual(defaultPreferences);
    } finally { vi.unstubAllGlobals(); }
  });
});
