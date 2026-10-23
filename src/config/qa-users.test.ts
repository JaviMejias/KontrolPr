import { afterEach, expect, it, vi } from "vitest";
import { defaultPreferences } from "../lib/storage/indexed-db";

afterEach(() => { vi.doUnmock("./qa-team.json"); vi.resetModules(); });

it.each([0, 1, 2, 4])("supports a published team of %i people without requiring named slots", async (count) => {
  const members = Array.from({ length: count }, (_, index) => ({ accountId: `qa-${index}`, displayName: `QA ${index}` }));
  vi.doMock("./qa-team.json", () => ({ default: members }));
  vi.resetModules();
  const { effectiveQaIds } = await import("./qa-users");
  for (const role of ["qa", "developer", "observer"] as const) expect(effectiveQaIds({ ...defaultPreferences, role })).toEqual(members.map((member) => member.accountId));
  expect(effectiveQaIds({ ...defaultPreferences, qaTeamMembers: [] })).toEqual([]);
  expect(effectiveQaIds({ ...defaultPreferences, qaTeamMembers: [{ accountId: "new-qa", uuid: "uuid-qa", displayName: "New QA" }] })).toEqual(["new-qa", "uuid-qa"]);
});
