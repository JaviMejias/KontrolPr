import { expect, it, vi } from "vitest";
import { z } from "zod";
import { listPullRequestActivity } from "./activity";

it("requests an activity page without overriding the provider page size", async () => {
  const next = "https://api.bitbucket.org/2.0/repositories/team/repo/pullrequests/42/activity?page=2";
  const get = vi.fn().mockImplementation(async (path: string, schema: z.ZodType) => {
    expect(new URL(path, "https://api.bitbucket.org").searchParams.has("pagelen")).toBe(false);
    return schema.parse({ values: [{ approval: { date: "2026-10-22T11:00:00Z", user: { display_name: "QA" } } }], next });
  });
  const result = await listPullRequestActivity({ get }, "team", "repo", 42);
  expect(get).toHaveBeenCalledWith("/repositories/team/repo/pullrequests/42/activity", expect.anything());
  expect(result.values).toHaveLength(1);
  expect(result.next).toBe(next);
});
