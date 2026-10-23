import { describe, expect, it, vi } from "vitest";
import { createBitbucketApiClient, maxDiffBytes } from "./api-client";
import { z } from "zod";

const schema = z.object({ ok: z.boolean() });

describe("createBitbucketApiClient", () => {
  it("reads text diffs without changing the read-only credential boundary", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("patch", { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await createBitbucketApiClient("token").getText!("/repositories/w/r/diff/a..b")).toBe("patch");
    expect(fetchMock).toHaveBeenCalledWith("https://api.bitbucket.org/2.0/repositories/w/r/diff/a..b", expect.objectContaining({ headers: expect.objectContaining({ Accept: "text/plain" }), redirect: "error", credentials: "omit" }));
    await expect(createBitbucketApiClient("token").getText!("https://evil.example/diff")).rejects.toThrow("Untrusted API URL");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized, HTML and invalid UTF-8 diffs", async () => {
    const client = createBitbucketApiClient("token");
    for (const response of [new Response("x".repeat(maxDiffBytes + 1), { headers: { "Content-Type": "text/plain" } }), new Response("error", { headers: { "Content-Type": "text/html" } }), new Response(new Uint8Array([0xff]), { headers: { "Content-Type": "text/plain" } })]) {
      vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
      await expect(client.getText!("/repositories/w/r/diff/a..b")).rejects.toThrow();
    }
  });
  it("uses account email and API token with Basic authentication", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createBitbucketApiClient({ email: "qa@example.com", token: "test-token" }).get("/user", schema);
    expect(fetchMock).toHaveBeenCalledWith("https://api.bitbucket.org/2.0/user", expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Basic ${btoa("qa@example.com:test-token")}` }), credentials: "omit", redirect: "error" }));
  });

  it("never forwards credentials to an untrusted pagination host", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createBitbucketApiClient("token").get("https://other.example/2.0/user", schema)).rejects.toThrow("Untrusted API URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send requests after the local session deadline", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const client = createBitbucketApiClient({ email: "qa@example.com", token: "test-token" }, { signal: new AbortController().signal, expiresAt: Date.now() - 1 });
    await expect(client.get("/user", schema)).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts in-flight requests when the session is closed", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createBitbucketApiClient("test-token", { signal: controller.signal, expiresAt: Date.now() + 60000 });
    const request = client.get("/user", schema);
    controller.abort();
    await expect(request).rejects.toMatchObject({ code: "network" });
  });
  it("sends a bearer token to the Bitbucket API host", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createBitbucketApiClient("token").get("/user", schema);
    expect(fetchMock).toHaveBeenCalledWith("https://api.bitbucket.org/2.0/user", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token" }) }));
  });

  it("classifies authorization failures", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 401 })));
    await expect(createBitbucketApiClient("token").get("/user", schema)).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });

  it("classifies permission failures", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 403 })));
    await expect(createBitbucketApiClient("token").get("/user", schema)).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  it("classifies rate limits", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 429 })));
    await expect(createBitbucketApiClient("token").get("/user", schema)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("rejects malformed successful payloads", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: "yes" }), { status: 200 })));
    await expect(createBitbucketApiClient("token").get("/user", schema)).rejects.toMatchObject({ code: "unknown", status: 200 });
  });

  it("classifies network errors", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));
    await expect(createBitbucketApiClient("token").get("/user", schema)).rejects.toMatchObject({ code: "network" });
  });
});
