// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function setup() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(new Response("offline shell")) };
  const caches = { open: vi.fn().mockResolvedValue(cache), keys: vi.fn().mockResolvedValue(["unrelated-app", "kontrolpr-static-old", "kontrolpr-static-test"]), delete: vi.fn().mockResolvedValue(true) };
  const self = { location: { origin: "https://kontrolpr.test" }, addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => listeners.set(name, handler), skipWaiting: vi.fn().mockResolvedValue(undefined), clients: { claim: vi.fn().mockResolvedValue(undefined) } };
  const fetch = vi.fn().mockResolvedValue(new Response("new shell"));
  class LocalRequest extends Request { constructor(input: string | Request, init?: RequestInit) { super(typeof input === "string" ? new URL(input, self.location.origin) : input, init); } }
  const source = readFileSync("public/sw.js", "utf8").replace("__BUILD_VERSION__", "test").replace("__PRECACHE_ASSETS__", JSON.stringify(["/index.html", "/assets/app-hash.js"]));
  runInNewContext(source, { self, caches, fetch, Request: LocalRequest, Response, URL });
  return { listeners, caches, cache, self, fetch };
}

describe("service worker cache boundaries", () => {
  it("parses and installs a complete shell without activating an update automatically", async () => {
    const { listeners, cache, self } = setup();
    let completion: Promise<void> | undefined;
    listeners.get("install")!({ waitUntil: (promise: Promise<void>) => { completion = promise; } });
    await completion;
    expect(cache.addAll).toHaveBeenCalledTimes(1); expect(self.skipWaiting).not.toHaveBeenCalled();
    listeners.get("message")!({ data: { type: "SKIP_WAITING" }, waitUntil: () => {} });
    expect(self.skipWaiting).toHaveBeenCalledTimes(1);
  });
  it("cleans only its own obsolete static caches", async () => {
    const { listeners, caches } = setup();
    let completion: Promise<void> | undefined;
    listeners.get("activate")!({ waitUntil: (promise: Promise<void>) => { completion = promise; } });
    await completion;
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith("kontrolpr-static-old");
  });
  it("does not intercept API, unknown asset or authenticated requests", () => {
    const { listeners } = setup();
    for (const request of [new Request("https://api.bitbucket.org/2.0/user"), new Request("https://kontrolpr.test/api/private"), new Request("https://kontrolpr.test/api/qa-team", { headers: { Authorization: "test-only" } }), new Request("https://kontrolpr.test/api/qa-team", { method: "PUT", body: '{"members":[]}', headers: { Authorization: "test-only", "Content-Type": "application/json" } }), new Request("https://kontrolpr.test/unknown.js"), new Request("https://kontrolpr.test/index.html", { headers: { Authorization: "test-only" } })]) {
      const respondWith = vi.fn(); listeners.get("fetch")!({ request, respondWith }); expect(respondWith).not.toHaveBeenCalled();
    }
  });
  it("loads navigation without HTTP cache and falls back only to its own shell offline", async () => {
    const { listeners, fetch } = setup();
    const request = { url: "https://kontrolpr.test/", method: "GET", mode: "navigate", headers: new Headers() };
    // Native Request cannot construct navigate mode; proxy its getter for this worker harness.
    const native = new Request(request.url);
    Object.defineProperty(native, "mode", { value: "navigate" });
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({ request: native, respondWith: (promise: Promise<Response>) => { response = promise; } });
    expect(await (await response)!.text()).toBe("new shell");
    expect(fetch.mock.calls[0][0].cache).toBe("no-store");
    fetch.mockRejectedValueOnce(new Error("offline"));
    listeners.get("fetch")!({ request: native, respondWith: (promise: Promise<Response>) => { response = promise; } });
    expect(await (await response)!.text()).toBe("offline shell");
  });
});
