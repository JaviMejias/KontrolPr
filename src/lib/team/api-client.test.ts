import { afterEach, expect, it, vi } from "vitest";
import { createQaTeamClient } from "./api-client";
import { initialQaTeam } from "../../../server/initial-qa-team";

afterEach(() => vi.unstubAllGlobals());
const snapshot = { members: initialQaTeam, revision: '"etag"', updatedAt: null, canEdit: false };
function setup() {
  const fetcher = vi.fn().mockResolvedValue(Response.json(snapshot));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const client = createQaTeamClient({ email: "javiér@example.test", token: "synthetic-test-token" }, { signal: controller.signal, expiresAt: Date.now() + 60000 });
  return { fetcher, client, controller };
}
it("uses a fixed same-origin endpoint, UTF-8 Basic auth and no browser caching or cookies", async () => {
  const { fetcher, client } = setup();
  expect(await client.read()).toEqual(snapshot);
  expect(fetcher).toHaveBeenCalledWith("/api/qa-team", expect.objectContaining({ method: "GET", cache: "no-store", credentials: "omit", redirect: "error" }));
  const options = fetcher.mock.calls[0][1];
  expect(new TextDecoder().decode(Uint8Array.from(atob(options.headers.Authorization.slice(6)), (character) => character.charCodeAt(0)))).toBe("javiér@example.test:synthetic-test-token");
  expect(options.body).toBeUndefined();
});
it("saves an empty roster with the last revision, never putting credentials in its body", async () => {
  const { fetcher, client } = setup();
  fetcher.mockResolvedValue(Response.json({ ...snapshot, members: [] }));
  expect((await client.save([], '"etag"')).members).toEqual([]);
  expect(fetcher.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "PUT", body: '{"members":[]}', headers: expect.objectContaining({ "If-Match": '"etag"' }) }));
});
it.each(["forbidden", "unauthorized", "conflict", "not_configured", "invalid_request", "unavailable"])("maps %s to safe localized feedback", async (code) => {
  const { fetcher, client } = setup();
  fetcher.mockResolvedValue(Response.json({ code, message: "secret internal details" }, { status: 503 }));
  await expect(client.read()).rejects.toMatchObject({ code });
  await expect(client.read()).rejects.not.toHaveProperty("message", "secret internal details");
});
it("rejects HTML, corrupt success and unknown errors without exposing response content", async () => {
  const { fetcher, client } = setup();
  fetcher.mockResolvedValueOnce(new Response("private upstream HTML")).mockResolvedValueOnce(Response.json({ members: [] })).mockResolvedValueOnce(Response.json({ code: "unexpected", message: "secret" }, { status: 500 }));
  for (let attempt = 0; attempt < 3; attempt++) await expect(client.read()).rejects.toMatchObject({ code: "unavailable" });
});
it("explains uncertain write completion and never retries a mutation automatically", async () => {
  const { fetcher, client } = setup();
  fetcher.mockRejectedValue(new TypeError("offline"));
  await expect(client.save([], "initial")).rejects.toThrow("No se pudo confirmar el guardado");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not send requests after logout or elapsed session expiry", async () => {
  const { client, fetcher, controller } = setup();
  controller.abort();
  await expect(client.read()).rejects.toMatchObject({ code: "unauthorized" });
  const expired = createQaTeamClient({ email: "x", token: "y" }, { signal: new AbortController().signal, expiresAt: 0 });
  await expect(expired.save([], "initial")).rejects.toMatchObject({ code: "unauthorized" });
  expect(fetcher).not.toHaveBeenCalled();
});
