// @vitest-environment node
import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { qaTeamMembersSchema, sharedQaTeamSchema } from "../src/lib/team/contracts";
import { initialQaTeam, soleQaEditorId } from "./initial-qa-team";
import qaTeamApi, { handler as defaultHandler } from "../api/qa-team";
import { conflict, maxQaTeamBytes } from "./http";
import { createQaTeamHandler } from "./qa-team";
import type { QaTeamStore, StoredQaTeam } from "./qa-team-store";

const authorization = `Basic ${Buffer.from("javier@example.com:private-bb-token").toString("base64")}`;
const updatedAt = "2026-10-23T13:00:00.000Z";
const document: StoredQaTeam = { version: 1, members: initialQaTeam, updatedAt, updatedBy: soleQaEditorId };

function request(method = "GET", body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://kontrolpr.example/api/qa-team", {
    method,
    headers: { Authorization: authorization, ...(method === "PUT" ? { Origin: "https://kontrolpr.example", "If-Match": "initial", "Content-Type": "application/json" } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function fixture(identity = soleQaEditorId, configured = true) {
  let state: { document: StoredQaTeam; revision: string } | null = null;
  let sequence = 0;
  const store: QaTeamStore = {
    isConfigured: vi.fn(() => configured),
    read: vi.fn(async () => structuredClone(state)),
    write: vi.fn(async (next, expected) => {
      if (expected !== (state?.revision ?? "initial")) throw conflict();
      state = { document: structuredClone(next), revision: `"etag-${++sequence}"` };
      return state.revision;
    }),
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ uuid: identity }));
  const handler = createQaTeamHandler({ store, fetch: fetcher, now: () => new Date(updatedAt) });
  return { store, fetcher, handler };
}

afterEach(() => vi.useRealTimers());

describe("shared QA contracts", () => {
  it("seeds the three actual accounts with all matching aliases", () => {
    expect(initialQaTeam).toHaveLength(3);
    expect(initialQaTeam[0].accountId).toBe(soleQaEditorId);
    expect(initialQaTeam.map((person) => person.atlassianAccountId)).toEqual(["5ffcaf3c8332a1010e2170db", "712020:723685b5-9423-45cd-aaa0-91cfc37960e2", "612583d40bbbf90071f031ac"]);
    expect(qaTeamMembersSchema.parse([])).toEqual([]);
    expect(qaTeamMembersSchema.parse(initialQaTeam)).toEqual(initialQaTeam);
  });

  it("canonicalizes stable UUIDs and permits aliases repeated within the same person", () => {
    const person = { ...initialQaTeam[0], accountId: soleQaEditorId.slice(1, -1).toUpperCase() };
    expect(qaTeamMembersSchema.parse([person])[0].accountId).toBe(soleQaEditorId);
  });

  it.each([
    [initialQaTeam[0], initialQaTeam[0]],
    [{ ...initialQaTeam[0], atlassianAccountId: "duplicate" }, { ...initialQaTeam[1], atlassianAccountId: "duplicate" }],
    [{ ...initialQaTeam[0], atlassianAccountId: initialQaTeam[1].accountId.slice(1, -1).toUpperCase() }, initialQaTeam[1]],
    [{ ...initialQaTeam[0], uuid: initialQaTeam[1].uuid }],
    [{ accountId: "nickname", displayName: "QA" }],
    [{ ...initialQaTeam[0], displayName: " " }],
    [{ ...initialQaTeam[0], nickname: "x".repeat(201) }],
    [{ ...initialQaTeam[0], atlassianAccountId: "x".repeat(129) }],
    [{ ...initialQaTeam[0], displayName: "bad\u0000name" }],
    [{ ...initialQaTeam[0], token: "private-bb-token" }],
  ])("rejects invalid or colliding identity data %#", (...members) => {
    expect(qaTeamMembersSchema.safeParse(members).success).toBe(false);
  });
});

describe("createQaTeamHandler", () => {
  it("exposes the standard Request-to-Response entry point", async () => {
    expect(qaTeamApi.fetch).toBe(defaultHandler);
    const response = await qaTeamApi.fetch(new Request("https://kontrolpr.example/api/qa-team"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthorized" });
  });

  it("verifies the identity freshly against a fixed URL for every GET", async () => {
    const { handler, fetcher, store } = fixture();
    for (let index = 0; index < 2; index++) {
      const response = await handler(request());
      expect(response.status).toBe(200);
      expect(sharedQaTeamSchema.parse(await response.json())).toEqual({ members: initialQaTeam, revision: "initial", updatedAt: null, canEdit: true });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith("https://api.bitbucket.org/2.0/user", expect.objectContaining({ method: "GET", headers: { Authorization: authorization, Accept: "application/json" }, cache: "no-store", redirect: "error", credentials: "omit", signal: expect.any(AbortSignal) }));
    expect(store.write).not.toHaveBeenCalled();
  });

  it("allows every authenticated identity to read and derives editing rights solely from the UUID", async () => {
    const { handler, fetcher } = fixture(initialQaTeam[1].accountId);
    fetcher.mockImplementation(async () => Response.json({ uuid: initialQaTeam[1].accountId, display_name: "Javier Mejías", role: "owner", account_id: soleQaEditorId }));
    expect(await (await handler(request())).json()).toMatchObject({ canEdit: false, members: initialQaTeam });
  });

  it("accepts the canonical owner UUID regardless of response casing", async () => {
    const { handler } = fixture(soleQaEditorId.toUpperCase());
    expect(await (await handler(request())).json()).toMatchObject({ canEdit: true });
  });

  it("denies a non-owner despite spoofed roles, names and payload identity", async () => {
    const { handler, store } = fixture(initialQaTeam[1].accountId);
    const response = await handler(request("PUT", { members: [], role: "owner", user: { uuid: soleQaEditorId }, canEdit: true }, { "X-User-Id": soleQaEditorId, "X-Role": "owner" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "forbidden" });
    expect(store.read).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it.each(["", "Bearer token", "Basic !!!", `Basic ${Buffer.from("missing-colon").toString("base64")}`, `Basic ${Buffer.from(":token").toString("base64")}`, `Basic ${Buffer.from("email:").toString("base64")}`, "Basic dTpw=", `Basic ${"a".repeat(8192)}`])("rejects missing or malformed authentication %#", async (header) => {
    const { handler, store, fetcher } = fixture();
    const response = await handler(request("GET", undefined, { Authorization: header }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthorized" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.read).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500, 302])("fails safely when Bitbucket returns %i", async (status) => {
    const { handler, fetcher, store } = fixture();
    fetcher.mockResolvedValue(new Response("secret provider diagnostics", { status }));
    const response = await handler(request());
    expect(response.status).toBe([401, 403].includes(status) ? 401 : 503);
    expect(await response.text()).not.toContain("secret");
    expect(store.read).not.toHaveBeenCalled();
  });

  it.each([
    { role: "owner", display_name: "Javier Mejías", account_id: soleQaEditorId },
    { uuid: "not-a-uuid" },
    "invalid",
  ])("rejects an unverifiable identity %#", async (body) => {
    const { handler, fetcher } = fixture();
    fetcher.mockImplementation(async () => Response.json(body));
    expect((await handler(request())).status).toBe(503);
  });

  it("bounds the identity response body and never exposes provider diagnostics", async () => {
    const { handler, fetcher } = fixture();
    fetcher.mockResolvedValue(new Response("x".repeat(32 * 1024 + 1)));
    expect((await handler(request())).status).toBe(503);
    fetcher.mockRejectedValue(new Error(`network ${authorization} private-bb-token`));
    const response = await handler(request());
    expect(await response.json()).toEqual({ code: "unavailable", message: "El equipo QA compartido no está disponible. Intenta nuevamente." });
  });

  it("bounds authentication including a stalled response stream", async () => {
    vi.useFakeTimers();
    const { store } = fixture();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream()));
    const handler = createQaTeamHandler({ store, fetch: fetcher, authTimeoutMs: 20 });
    const pending = handler(request());
    await vi.advanceTimersByTimeAsync(21);
    expect((await pending).status).toBe(503);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("bounds an authentication fetch that never settles", async () => {
    vi.useFakeTimers();
    const { store } = fixture();
    const handler = createQaTeamHandler({ store, fetch: () => new Promise(() => undefined), authTimeoutMs: 20 });
    const pending = handler(request());
    await vi.advanceTimersByTimeAsync(21);
    expect((await pending).status).toBe(503);
  });

  it.each(["https://foreign.example", "https://kontrolpr.example.evil", "http://kontrolpr.example", "https://kontrolpr.example:443", "null", ""]) ("rejects a non-matching write Origin %#", async (origin) => {
    const { handler, store } = fixture();
    const response = await handler(request("PUT", { members: [] }, { Origin: origin }));
    expect(response.status).toBe(403);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("requires Origin even for the owner and does not trust forwarding headers", async () => {
    const { handler } = fixture();
    const input = request("PUT", { members: [] }, { "X-Forwarded-Host": "foreign.example" });
    input.headers.delete("Origin");
    expect((await handler(input)).status).toBe(403);
    expect((await handler(request("PUT", { members: [] }, { Origin: "https://foreign.example", "X-Forwarded-Host": "foreign.example" }))).status).toBe(403);
  });

  it("returns not_configured without pretending to save or serving a fallback roster", async () => {
    const { handler, store } = fixture(soleQaEditorId, false);
    for (const input of [request(), request("PUT", { members: [] })]) {
      const response = await handler(input);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "not_configured" });
    }
    expect(store.read).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it("saves an empty team, returns the durable revision and does not reinstate the seed", async () => {
    const { handler, store } = fixture();
    const response = await handler(request("PUT", { members: [] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ members: [], revision: '"etag-1"', updatedAt, canEdit: true });
    expect(store.write).toHaveBeenCalledWith({ version: 1, members: [], updatedAt, updatedBy: soleQaEditorId }, "initial");
    expect(await (await handler(request())).json()).toMatchObject({ members: [], revision: '"etag-1"' });
    expect(await (await handler(request("PUT", { members: initialQaTeam }, { "If-Match": '"etag-1"' }))).json()).toMatchObject({ members: initialQaTeam, revision: '"etag-2"' });
  });

  it("allows a variable roster with more than the three seed members", async () => {
    const { handler } = fixture();
    const members = Array.from({ length: 24 }, (_, index) => ({
      accountId: `{00000000-0000-0000-0000-${String(index).padStart(12, "0")}}`,
      displayName: `QA ${index}`,
    }));
    const response = await handler(request("PUT", { members }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ members });
  });

  it("rejects a normalized document that exceeds the storage limit", async () => {
    const { handler, store } = fixture();
    const members = Array.from({ length: 300 }, (_, index) => ({
      accountId: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
      displayName: "x".repeat(200),
    }));
    while (new TextEncoder().encode(JSON.stringify({ members })).byteLength > maxQaTeamBytes) members.pop();
    const body = JSON.stringify({ members });
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(maxQaTeamBytes);
    const response = await handler(request("PUT", { members }));
    expect(response.status).toBe(413);
    expect(store.write).not.toHaveBeenCalled();
  });

  it.each(["", "*", 'W/"etag"', '"etag-1", "etag-2"', "x".repeat(257)])("requires a single concrete If-Match revision %#", async (revision) => {
    const { handler, store } = fixture();
    expect((await handler(request("PUT", { members: [] }, { "If-Match": revision }))).status).toBe(400);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("rejects a missing If-Match header", async () => {
    const { handler } = fixture();
    const input = request("PUT", { members: [] });
    input.headers.delete("If-Match");
    expect((await handler(input)).status).toBe(400);
  });

  it("rejects stale writes without overwriting the persisted team", async () => {
    const { handler } = fixture();
    await handler(request("PUT", { members: [] }));
    const response = await handler(request("PUT", { members: initialQaTeam }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "conflict" });
    expect(await (await handler(request())).json()).toMatchObject({ members: [], revision: '"etag-1"' });
  });

  it.each([null, {}, [], { members: [initialQaTeam[0], initialQaTeam[0]] }, { members: [], role: "owner" }, { members: [], updatedBy: "attacker" }, { members: [], pathname: "other.json" }, { members: [], credentials: authorization }])("rejects malformed or spoofed owner payloads %#", async (body) => {
    const { handler, store } = fixture();
    expect((await handler(request("PUT", body))).status).toBe(400);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("rejects oversized streamed bodies, even with a false Content-Length", async () => {
    const { handler } = fixture();
    const response = await handler(request("PUT", { members: [], extra: "é".repeat(maxQaTeamBytes) }, { "Content-Length": "1" }));
    expect(response.status).toBe(413);
  });

  it("rejects oversized advertised bodies before reading the stream", async () => {
    const { handler } = fixture();
    expect((await handler(request("PUT", { members: [] }, { "Content-Length": String(maxQaTeamBytes + 1) }))).status).toBe(413);
  });

  it("rejects invalid JSON, UTF-8, encodings and unsupported content types", async () => {
    const { handler } = fixture();
    const headers = Object.fromEntries(request("PUT").headers);
    for (const body of ["{", new Uint8Array([0xff])]) {
      expect((await handler(new Request("https://kontrolpr.example/api/qa-team", { method: "PUT", headers, body }))).status).toBe(400);
    }
    expect((await handler(request("PUT", { members: [] }, { "Content-Type": "text/plain" }))).status).toBe(400);
    expect((await handler(request("PUT", { members: [] }, { "Content-Encoding": "gzip" }))).status).toBe(400);
  });

  it("fails closed for unreadable or corrupt storage on both methods", async () => {
    const { handler, store } = fixture();
    for (const failure of [() => Promise.reject(new Error("private-provider-token")), () => Promise.resolve({ document: { ...document, version: 2 }, revision: '"v2"' })]) {
      vi.mocked(store.read).mockImplementation(failure as QaTeamStore["read"]);
      for (const input of [request(), request("PUT", { members: [] })]) {
        const response = await handler(input);
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("private-provider-token");
      }
    }
    expect(store.write).not.toHaveBeenCalled();
  });

  it("does not persist or emit credentials and stores only the validated versioned document", async () => {
    const { handler, store } = fixture();
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    try {
      const response = await handler(request("PUT", { members: initialQaTeam }));
      expect(await response.text()).not.toContain("private-bb-token");
      const persisted = vi.mocked(store.write).mock.calls[0][0];
      expect(Object.keys(persisted).sort()).toEqual(["members", "updatedAt", "updatedBy", "version"]);
      expect(JSON.stringify(persisted)).not.toContain(authorization);
      expect(JSON.stringify(persisted)).not.toContain("private-bb-token");
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it.each(["POST", "PATCH", "DELETE", "OPTIONS", "HEAD"])("rejects unsupported method %s", async (method) => {
    const { handler, fetcher } = fixture();
    const response = await handler(request(method));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, PUT");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([false, true])("allows only one of two concurrent owner clients to save (existing=%s)", async (existing) => {
    const { store, fetcher } = fixture();
    if (existing) await store.write(document, "initial");
    const snapshot = await store.read();
    let release: () => void = () => undefined;
    const bothRead = new Promise<void>((resolve) => { release = resolve; });
    let reads = 0;
    vi.mocked(store.read).mockImplementation(async () => {
      if (++reads === 2) release();
      await bothRead;
      return structuredClone(snapshot);
    });
    const first = createQaTeamHandler({ store, fetch: fetcher });
    const second = createQaTeamHandler({ store, fetch: fetcher });
    const responses = await Promise.all([
      first(request("PUT", { members: [] }, { "If-Match": snapshot?.revision ?? "initial" })),
      second(request("PUT", { members: initialQaTeam }, { "If-Match": snapshot?.revision ?? "initial" })),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });
});
