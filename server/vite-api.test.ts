// @vitest-environment node
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, it, vi } from "vitest";
import { qaTeamMiddleware } from "./vite-api";

function fixture(method = "GET", url = "/api/qa-team") {
  const incoming = Object.assign(new PassThrough(), { method, url, headers: { host: "localhost:5173", authorization: "Basic c3ludGhldGljOnRlc3Q=", origin: "http://localhost:5173", "content-type": "application/json" } });
  let complete!: () => void;
  const finished = new Promise<void>((resolve) => { complete = resolve; });
  const outgoing = { headersSent: false, writeHead: vi.fn(), end: vi.fn((body?: string | Buffer) => { void body; complete(); }) };
  return { incoming, outgoing, finished, request: incoming as unknown as IncomingMessage, response: outgoing as unknown as ServerResponse };
}
it("leaves unrelated frontend requests untouched", () => {
  const { request, response } = fixture("GET", "/assets/app.js");
  const handler = vi.fn(); const next = vi.fn();
  qaTeamMiddleware(handler)(request, response, next);
  expect(next).toHaveBeenCalledOnce(); expect(handler).not.toHaveBeenCalled();
});
it("adapts same-origin headers, streaming PUT body, status and private cache headers", async () => {
  const test = fixture("PUT");
  const handler = vi.fn(async (request: Request) => {
    expect(request.url).toBe("http://localhost:5173/api/qa-team");
    expect(request.headers.get("Origin")).toBe("http://localhost:5173");
    expect(request.headers.get("Authorization")).toBe("Basic c3ludGhldGljOnRlc3Q=");
    expect(await request.json()).toEqual({ members: [] });
    return Response.json({ code: "conflict" }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  });
  qaTeamMiddleware(handler)(test.request, test.response, vi.fn());
  test.incoming.end('{"members":[]}');
  await test.finished;
  expect(test.outgoing.writeHead).toHaveBeenCalledWith(409, expect.objectContaining({ "cache-control": "private, no-store" }));
  expect(test.outgoing.end.mock.calls[0][0]?.toString()).toBe('{"code":"conflict"}');
});
it("does not leak adapter exceptions or credentials", async () => {
  const test = fixture();
  qaTeamMiddleware(async () => { throw new Error("private credentials"); })(test.request, test.response, vi.fn());
  await test.finished;
  expect(test.outgoing.writeHead).toHaveBeenCalledWith(503, expect.objectContaining({ "Cache-Control": "private, no-store" }));
  expect(test.outgoing.end.mock.calls[0][0]).not.toContain("credentials");
});
