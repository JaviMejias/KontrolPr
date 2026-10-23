// @vitest-environment node
import { BlobAccessError, BlobError, BlobPreconditionFailedError, BlobStoreNotFoundError } from "@vercel/blob";
import { Buffer } from "node:buffer";
import type { get, put } from "@vercel/blob";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialQaTeam, soleQaEditorId } from "./initial-qa-team";
import { createBlobQaTeamStore, qaTeamBlobPathname } from "./blob-qa-team-store";
import { maxQaTeamBytes } from "./http";
import { createQaTeamHandler } from "./qa-team";
import type { StoredQaTeam } from "./qa-team-store";

const document: StoredQaTeam = { version: 1, members: initialQaTeam, updatedAt: "2026-10-23T13:00:00.000Z", updatedBy: soleQaEditorId };

function blobResult(body: string, revision = '"v1"'): NonNullable<Awaited<ReturnType<typeof get>>> {
  return {
    statusCode: 200,
    stream: new Response(body).body!,
    headers: new Headers(),
    blob: {
      url: "https://store.private.blob.vercel-storage.com/team.json",
      downloadUrl: "https://store.private.blob.vercel-storage.com/team.json?download=1",
      pathname: qaTeamBlobPathname,
      contentDisposition: "attachment",
      cacheControl: "max-age=60",
      uploadedAt: new Date(document.updatedAt),
      contentType: "application/json",
      size: new TextEncoder().encode(body).byteLength,
      etag: revision,
    },
  };
}

function fixture(token: string | undefined = "private-provider-token") {
  const getBlob = vi.fn<typeof get>().mockImplementation(async () => blobResult(JSON.stringify(document)));
  const putBlob = vi.fn<typeof put>().mockResolvedValue({
    url: "https://store.private.blob.vercel-storage.com/team.json",
    downloadUrl: "https://store.private.blob.vercel-storage.com/team.json?download=1",
    pathname: qaTeamBlobPathname,
    contentType: "application/json",
    contentDisposition: "attachment",
    etag: '"v2"',
  });
  const store = createBlobQaTeamStore({ get: getBlob, put: putBlob, token: () => token });
  return { getBlob, putBlob, store };
}

afterEach(() => vi.useRealTimers());

describe("createBlobQaTeamStore", () => {
  it("reads the single fixed private pathname without a CDN cache", async () => {
    const { getBlob, store } = fixture();
    expect(await store.read()).toEqual({ document, revision: '"v1"' });
    expect(getBlob).toHaveBeenCalledWith(qaTeamBlobPathname, { access: "private", useCache: false, token: "private-provider-token", abortSignal: expect.any(AbortSignal) });
  });

  it("treats only a genuinely missing blob as absent", async () => {
    const { getBlob, store } = fixture();
    getBlob.mockResolvedValue(null);
    expect(await store.read()).toBeNull();
    for (const failure of [new BlobAccessError(), new BlobStoreNotFoundError(), new Error("private-provider-token")]) {
      getBlob.mockRejectedValue(failure);
      await expect(store.read()).rejects.toMatchObject({ status: 503, code: "unavailable" });
    }
  });

  it("creates the first document atomically without overwrite", async () => {
    const { putBlob, store } = fixture();
    expect(await store.write(document, "initial")).toBe('"v2"');
    expect(putBlob).toHaveBeenCalledWith(qaTeamBlobPathname, JSON.stringify(document), {
      access: "private", token: "private-provider-token", contentType: "application/json", addRandomSuffix: false,
      cacheControlMaxAge: 60, abortSignal: expect.any(AbortSignal), allowOverwrite: false,
    });
    expect(putBlob.mock.calls[0][2]).not.toHaveProperty("ifMatch");
  });

  it("uses the exact revision as the provider CAS precondition", async () => {
    const { putBlob, store } = fixture();
    await store.write(document, '"v1"');
    expect(putBlob).toHaveBeenCalledWith(qaTeamBlobPathname, JSON.stringify(document), expect.objectContaining({ allowOverwrite: true, ifMatch: '"v1"', access: "private", addRandomSuffix: false }));
  });

  it.each(["initial", '"v1"'])("maps provider CAS failures to conflict (%s)", async (revision) => {
    const { putBlob, store } = fixture();
    putBlob.mockRejectedValue(new BlobPreconditionFailedError());
    await expect(store.write(document, revision)).rejects.toMatchObject({ status: 409, code: "conflict" });
  });

  it("maps the installed SDK's generic first-create exists error to conflict", async () => {
    const { putBlob, store } = fixture();
    putBlob.mockRejectedValue(new BlobError('This blob already exists, use "allowOverwrite: true" to overwrite it.'));
    await expect(store.write(document, "initial")).rejects.toMatchObject({ status: 409, code: "conflict" });
    await expect(store.write(document, '"v1"')).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });

  it.each([undefined, "", "   "])("fails closed without a configured token %#", async (token) => {
    const getBlob = vi.fn<typeof get>();
    const putBlob = vi.fn<typeof put>();
    const store = createBlobQaTeamStore({ get: getBlob, put: putBlob, token: () => token });
    expect(store.isConfigured()).toBe(false);
    await expect(store.read()).rejects.toMatchObject({ status: 503, code: "not_configured" });
    await expect(store.write(document, "initial")).rejects.toMatchObject({ status: 503, code: "not_configured" });
    expect(getBlob).not.toHaveBeenCalled();
    expect(putBlob).not.toHaveBeenCalled();
  });

  it("rechecks configuration and never keeps an in-memory fallback", async () => {
    let token: string | undefined = "private-provider-token";
    const { getBlob, putBlob } = fixture();
    const store = createBlobQaTeamStore({ get: getBlob, put: putBlob, token: () => token });
    await store.write(document, "initial");
    token = undefined;
    expect(store.isConfigured()).toBe(false);
    await expect(store.read()).rejects.toMatchObject({ code: "not_configured" });
  });

  it.each([
    "not JSON",
    JSON.stringify({ ...document, version: 2 }),
    JSON.stringify({ ...document, updatedBy: initialQaTeam[1].accountId }),
    JSON.stringify({ ...document, updatedAt: "yesterday" }),
    JSON.stringify({ ...document, members: [initialQaTeam[0], initialQaTeam[0]] }),
    JSON.stringify({ ...document, credentials: "private-provider-token" }),
    JSON.stringify({ members: [] }),
    "x".repeat(maxQaTeamBytes + 1),
  ])("rejects corrupt, unexpected or oversized persisted documents %#", async (body) => {
    const { getBlob, store } = fixture();
    getBlob.mockImplementation(async () => blobResult(body));
    await expect(store.read()).rejects.toMatchObject({ code: "unavailable", status: 503 });
  });

  it("enforces streamed size when provider metadata understates it", async () => {
    const { getBlob, store } = fixture();
    getBlob.mockImplementation(async () => {
      const result = blobResult("x".repeat(maxQaTeamBytes + 1));
      result.blob.size = 1;
      return result;
    });
    await expect(store.read()).rejects.toMatchObject({ code: "unavailable" });
  });

  it.each(["initial", "", "x".repeat(257)])("rejects unusable provider revisions %#", async (revision) => {
    const { getBlob, putBlob, store } = fixture();
    getBlob.mockImplementation(async () => blobResult(JSON.stringify(document), revision));
    await expect(store.read()).rejects.toMatchObject({ code: "unavailable" });
    const result = await putBlob(qaTeamBlobPathname, JSON.stringify(document), { access: "private" });
    putBlob.mockResolvedValue({ ...result, etag: revision });
    await expect(store.write(document, "initial")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("maps provider write failures to safe Spanish errors", async () => {
    const { putBlob, store } = fixture();
    putBlob.mockRejectedValue(new Error("private-provider-token"));
    await expect(store.write(document, "initial")).rejects.toMatchObject({ code: "unavailable", message: "El equipo QA compartido no está disponible. Intenta nuevamente." });
  });

  it("reads a persisted empty roster without injecting the seed", async () => {
    const { getBlob, store } = fixture();
    getBlob.mockImplementation(async () => blobResult(JSON.stringify({ ...document, members: [] })));
    expect(await store.read()).toMatchObject({ document: { members: [] } });
  });

  it("bounds stalled provider requests and response streams", async () => {
    vi.useFakeTimers();
    const { getBlob, putBlob } = fixture();
    const store = createBlobQaTeamStore({ get: getBlob, put: putBlob, token: () => "private-provider-token", timeoutMs: 20 });
    getBlob.mockImplementation(async () => {
      const result = blobResult(JSON.stringify(document));
      result.stream = new ReadableStream();
      return result;
    });
    const read = expect(store.read()).rejects.toMatchObject({ code: "unavailable" });
    await vi.advanceTimersByTimeAsync(21);
    await read;
    expect(getBlob.mock.calls[0][1].abortSignal?.aborted).toBe(true);
    putBlob.mockImplementation(() => new Promise(() => undefined));
    const write = expect(store.write(document, "initial")).rejects.toMatchObject({ code: "unavailable" });
    await vi.advanceTimersByTimeAsync(21);
    await write;
  });

  it.each([false, true])("preserves CAS across independent handlers and Blob adapters (existing=%s)", async (existing) => {
    const { getBlob, putBlob } = fixture();
    let persisted = existing ? JSON.stringify(document) : null;
    let etag = '"before"';
    let sequence = 0;
    let reads = 0;
    let release: () => void = () => undefined;
    const bothRead = new Promise<void>((resolve) => { release = resolve; });
    getBlob.mockImplementation(async () => {
      const snapshot = persisted === null ? null : blobResult(persisted, etag);
      if (++reads === 2) release();
      await bothRead;
      return snapshot;
    });
    const result = await putBlob(qaTeamBlobPathname, "", { access: "private" });
    putBlob.mockImplementation(async (_pathname, body, options) => {
      if (!options.allowOverwrite && persisted !== null) throw new BlobError("This blob already exists.");
      if (options.ifMatch && options.ifMatch !== etag) throw new BlobPreconditionFailedError();
      persisted = String(body);
      etag = `"saved-${++sequence}"`;
      return { ...result, etag };
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ uuid: soleQaEditorId }));
    const makeHandler = () => createQaTeamHandler({ store: createBlobQaTeamStore({ get: getBlob, put: putBlob, token: () => "private-provider-token" }), fetch: fetcher });
    const makeRequest = (members: typeof initialQaTeam) => new Request("https://kontrolpr.example/api/qa-team", {
      method: "PUT",
      headers: {
        Authorization: `Basic ${Buffer.from("javier@example.com:private-bb-token").toString("base64")}`,
        Origin: "https://kontrolpr.example", "Content-Type": "application/json", "If-Match": existing ? '"before"' : "initial",
      },
      body: JSON.stringify({ members }),
    });
    const first = makeHandler();
    const second = makeHandler();
    const responses = await Promise.all([first(makeRequest([])), second(makeRequest(initialQaTeam))]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = responses.find((response) => response.status === 200)!;
    expect(JSON.parse(persisted!).members).toEqual((await winner.json()).members);
    expect(sequence).toBe(1);
    expect(persisted).not.toContain("private-bb-token");
    expect(persisted).not.toContain("private-provider-token");
  });
});
