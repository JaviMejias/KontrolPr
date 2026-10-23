import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createBlobQaTeamStore } from "./blob-qa-team-store.js";
import { createQaTeamHandler } from "./qa-team.js";

export function qaTeamMiddleware(handler: (request: Request) => Promise<Response>) {
  return (incoming: IncomingMessage, outgoing: ServerResponse, next: () => void) => {
    if (incoming.url?.split("?")[0] !== "/api/qa-team") { next(); return; }
    void (async () => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      incoming.once("aborted", abort);
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
          else if (value !== undefined) headers.set(name, value);
        }
        const method = incoming.method ?? "GET";
        const request = new Request(new URL(incoming.url!, `http://${incoming.headers.host ?? "localhost"}`), {
          method, headers, signal: controller.signal,
          ...(method !== "GET" && method !== "HEAD" ? { body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: "half" } : {}),
        } as RequestInit & { duplex?: string });
        const response = await handler(request);
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        if (!outgoing.headersSent) outgoing.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "private, no-store" });
        outgoing.end(JSON.stringify({ code: "unavailable", message: "El equipo compartido no está disponible." }));
      } finally { incoming.removeListener("aborted", abort); incoming.resume(); }
    })();
  };
}

export function qaTeamApiPlugin(token: string | undefined): Plugin {
  const middleware = qaTeamMiddleware(createQaTeamHandler({ store: createBlobQaTeamStore({ token: () => token }) }));
  return {
    name: "kontrolpr-qa-team-api",
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
