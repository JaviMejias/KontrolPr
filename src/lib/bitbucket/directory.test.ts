import { expect, it, vi } from "vitest";
import { z } from "zod";
import { readTeamDirectory } from "./directory";
import { BitbucketApiError } from "./contracts";
import { repositories } from "../../config/repositories";

const user = { uuid: "{qa-a}", account_id: "qa-account", display_name: "QA A", nickname: "reviewer" };
const parsed = (value: unknown, schema: z.ZodType) => schema.parse(value);

it("paginates effective repository users, deduplicates, and preserves IDs without reading PR or emails", async () => {
  const get = vi.fn().mockImplementation(async (path: string, schema: z.ZodType) => parsed(path.includes("page=2") ? { values: [{ user }, { user: { account_id: "qa-b", display_name: "QA B" } }] } : { values: [{ user }], next: "https://api.bitbucket.org/2.0/workspaces/w/permissions/repositories/r?page=2" }, schema));
  const [entry] = await readTeamDirectory({ get }, [repositories[0]]);
  expect(entry.source).toBe("repository");
  expect(entry.people).toHaveLength(2);
  expect(entry.people[0]).toMatchObject({ accountId: user.uuid, atlassianAccountId: "qa-account", nickname: "reviewer" });
  expect(get).toHaveBeenCalledTimes(2);
  expect(get.mock.calls.every(([path]) => !path.includes("pullrequests") && !path.includes("email"))).toBe(true);
});

it("falls back to one shared paginated workspace request for repositories without admin access", async () => {
  const get = vi.fn().mockImplementation(async (path: string, schema: z.ZodType) => {
    if (path.includes("permissions/repositories")) throw new BitbucketApiError(403, "Forbidden", "forbidden");
    return parsed({ values: [{ user }] }, schema);
  });
  const result = await readTeamDirectory({ get }, repositories);
  expect(result.map((entry) => entry.source)).toEqual(["workspace", "workspace"]);
  expect(result.every((entry) => entry.message?.includes("no permitió verificar"))).toBe(true);
  expect(get.mock.calls.filter(([path]) => path.includes("/members"))).toHaveLength(1);
});

it("distinguishes empty success from missing scopes and never promotes a partial page to a complete directory", async () => {
  const empty = { get: vi.fn().mockImplementation(async (_path: string, schema: z.ZodType) => parsed({ values: [] }, schema)) };
  expect((await readTeamDirectory(empty, [repositories[0]]))[0]).toMatchObject({ source: "repository", people: [] });
  const get = vi.fn().mockImplementation(async (path: string, schema: z.ZodType) => {
    if (path.includes("permissions/repositories")) throw new BitbucketApiError(403, "Forbidden", "forbidden");
    if (path.includes("page=2")) throw new BitbucketApiError(403, "Missing scope", "forbidden");
    return parsed({ values: [{ user }], next: "https://api.bitbucket.org/2.0/workspaces/w/members?page=2" }, schema);
  });
  expect((await readTeamDirectory({ get }, [repositories[0]]))[0]).toMatchObject({ source: "unavailable", people: [], message: expect.stringContaining("read:workspace:bitbucket") });
});

it.each([[429, "rate_limited", "limitó"], [undefined, "network", "conexión"]] as const)("reports %s without expanding fallback requests", async (status, code, message) => {
  const get = vi.fn().mockRejectedValue(new BitbucketApiError(status, "Failed", code));
  expect((await readTeamDirectory({ get }, [repositories[0]]))[0].message).toContain(message);
  expect(get).toHaveBeenCalledTimes(1);
});

it("aborts directory pagination without falling back or retaining cancelled results", async () => {
  const controller = new AbortController();
  const get = vi.fn().mockImplementation(async (_path: string, schema: z.ZodType) => { controller.abort(); return parsed({ values: [{ user }], next: "/next" }, schema); });
  await expect(readTeamDirectory({ get }, [repositories[0]], controller.signal)).rejects.toThrow();
  expect(get).toHaveBeenCalledTimes(1);
});
