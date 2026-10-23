import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { readAllPages, readRepository } from "./reader";
import type { BitbucketApiClient } from "./contracts";
import { BitbucketApiError } from "./contracts";

describe("readAllPages", () => {
  it("follows the next URL for PRs, commits or comments", async () => {
    const get = vi.fn().mockResolvedValueOnce({ values: [1], next: "https://api.bitbucket.org/2.0/page2" }).mockResolvedValueOnce({ values: [2] });
    const client: BitbucketApiClient = { get };
    expect(await readAllPages(client, "/page1", z.number())).toEqual([1, 2]);
    expect(get).toHaveBeenNthCalledWith(2, "https://api.bitbucket.org/2.0/page2", expect.anything());
  });
  it("stops malformed cyclic pagination", async () => {
    const client: BitbucketApiClient = { get: vi.fn().mockResolvedValue({ values: [], next: "/page1" }) };
    await expect(readAllPages(client, "/page1", z.unknown())).rejects.toThrow("Repeated pagination URL");
  });
});

describe("readRepository identity boundaries", () => {
  const repository = { workspace: "kontroller_test", slug: "kontroller_test", name: "Kontroller", label: "Kontroller" };
  const author = { uuid: "{dev}", account_id: "account-dev", display_name: "Diego Cuevas" };
  const summary = (id: number, updated = "2026-10-22T12:00:00Z", state = "OPEN") => ({ id, title: `PR ${id}`, author, state, created_on: "2026-10-20T10:00:00Z", updated_on: updated });

  it("uses default activity pagination and retains review events from every page", async () => {
    const raw = { ...summary(15845), source: { commit: { hash: "abc123" } }, destination: { commit: { hash: "def456" } } };
    const reviewer = { uuid: "{qa}", display_name: "QA" };
    const activityPath = `/repositories/${repository.workspace}/${repository.slug}/pullrequests/${raw.id}/activity`;
    const next = `https://api.bitbucket.org/2.0${activityPath}?page=2`;
    const get = vi.fn().mockImplementation(async (path: string, schema: z.ZodType) => {
      const url = new URL(path, "https://api.bitbucket.org");
      if (url.pathname.endsWith("/activity")) {
        if (url.searchParams.has("pagelen")) throw new BitbucketApiError(400, "Invalid pagelen", "unknown");
        return schema.parse(url.searchParams.get("page") === "2"
          ? { values: [{ approval: { date: "2026-10-22T11:00:00Z", user: reviewer } }] }
          : { values: [{ update: { date: raw.created_on, source: raw.source, destination: raw.destination } }], next });
      }
      const value = path.includes("state=OPEN") ? { values: [raw] }
        : path.endsWith(`/${raw.id}`) ? { ...raw, participants: [{ user: reviewer, approved: true }] }
        : { values: [] };
      return schema.parse(value);
    });
    const progress = vi.fn();
    const result = await readRepository({ get }, repository, [], progress, [reviewer.uuid]);
    expect(result).toHaveLength(1);
    expect(result[0].activity).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "metadata_updated", sourceHash: "abc123", destinationHash: "def456" }),
      expect.objectContaining({ kind: "approval_added", approvalActive: true, actor: expect.objectContaining({ accountId: reviewer.uuid }) }),
    ]));
    expect(result[0].reviewEvidence?.historyComplete).toBe(true);
    expect(get).toHaveBeenCalledWith(activityPath, expect.anything());
    expect(get).toHaveBeenCalledWith(next, expect.anything());
    expect(progress.mock.calls.at(-1)?.[0]).toEqual({ phase: "complete", pagesRead: 6, completed: 1, total: 1 });
  });

  it("deduplicates overlapping pages before fetching details and keeps one comment/commit", async () => {
    const comment = { id: 9, user: author, created_on: "2026-10-22T11:00:00Z", content: { raw: "@{jm} Cambios listos", html: '<a data-account-id="jm">@Javier Mejías</a> Cambios listos' } };
    const commit = { hash: "abc123", message: "Fix retry timeout", date: "2026-10-22T11:30:00Z", author: { user: author } };
    const get = vi.fn().mockImplementation(async (path: string, schema: z.ZodType) => {
      const value = path.includes("state=OPEN") ? { values: [summary(15825)], next: "https://api.bitbucket.org/2.0/page2" }
        : path.endsWith("page2") ? { values: [summary(15825, "2026-10-22T13:00:00Z"), summary(15845)] }
        : path.includes("state=MERGED") ? { values: [] }
        : path.includes("/comments?") ? { values: [comment, comment] } : { values: [commit, commit] };
      return schema.parse(value);
    });
    const progress = vi.fn();
    const result = await readRepository({ get }, repository, [], progress);
    expect(progress.mock.calls[0][0]).toEqual({ phase: "listing", pagesRead: 0, completed: 0 });
    expect(progress.mock.calls.at(-1)?.[0]).toEqual({ phase: "complete", pagesRead: 7, completed: 2, total: 2 });
    const completed = progress.mock.calls.map(([value]) => value.completed);
    expect(completed).toEqual([...completed].sort((a, b) => a - b));
    expect(result.map((pr) => pr.key)).toEqual(["kontroller_test/kontroller_test#15825", "kontroller_test/kontroller_test#15845"]);
    expect(result[0].updatedAt).toBe("2026-10-22T13:00:00Z");
    expect(result[0].comments).toHaveLength(1);
    expect(result[0].comments[0].mentions?.jm).toBe("Javier Mejías");
    expect(result[0].commits).toHaveLength(1);
    expect(result[0].activity.find((event) => event.kind === "commit_added")?.content).toBe("Fix retry timeout");
    expect(get.mock.calls.filter(([path]) => path.includes("15825/comments"))).toHaveLength(1);
    const repeated = await readRepository({ get }, repository, result);
    expect(repeated).toHaveLength(2);
    expect(new Set(repeated.map((pr) => pr.key)).size).toBe(2);
    expect(get.mock.calls.filter(([path]) => path.includes("15825/comments"))).toHaveLength(1);
  });

  it("keeps the newest state when the PR changes between open and finalized requests", async () => {
    const get = vi.fn().mockImplementation(async (path: string, schema: z.ZodType) => schema.parse({ values: path.includes("state=OPEN") ? [summary(15825)] : [summary(15825, "2026-10-22T14:00:00Z", "MERGED")] }));
    const result = await readRepository({ get }, repository, []);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe("MERGED");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("keeps reviewers and participants without comments, including aliases and cached summaries", async () => {
    const reviewer = { uuid: "{qa-reviewer}", display_name: "QA Reviewer", nickname: "reviewer" };
    const participant = { uuid: "{qa-participant}", display_name: "QA Participant" };
    const get = vi.fn().mockImplementation(async (path: string, schema: z.ZodType) => schema.parse({ values: path.includes("state=OPEN") ? [{ ...summary(1), reviewers: [reviewer], participants: [{ user: participant }, { user: reviewer }] }] : [] }));
    const result = await readRepository({ get }, repository, []);
    expect(result[0].participants?.map((person) => person.accountId)).toEqual([reviewer.uuid, participant.uuid]);
    expect(result[0].participants?.[0].nickname).toBe("reviewer");
    const oldSnapshot = { ...result[0], participants: undefined };
    const cached = await readRepository({ get }, repository, [oldSnapshot]);
    expect(cached[0].participants).toEqual(result[0].participants);
    expect(get.mock.calls.filter(([path]) => path.includes("/comments?"))).toHaveLength(1);
  });
});
