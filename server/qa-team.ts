import { z } from "zod";
import { qaTeamMembersSchema, sharedQaTeamSchema } from "../src/lib/team/contracts.js";
import { initialQaTeam, soleQaEditorId } from "./initial-qa-team.js";
import { authenticateBitbucket } from "./bitbucket-auth.js";
import { conflict, invalidRequest, jsonResponse, maxQaTeamBytes, QaTeamError, readJsonLimited, unavailable, withDeadline } from "./http.js";
import { storedQaTeamSchema } from "./qa-team-store.js";
import type { QaTeamStore } from "./qa-team-store.js";

export interface QaTeamHandlerOptions {
  store: QaTeamStore;
  fetch?: typeof fetch;
  now?: () => Date;
  authTimeoutMs?: number;
}

const writeSchema = z.strictObject({ members: qaTeamMembersSchema });

export function createQaTeamHandler(options: QaTeamHandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      if (request.method !== "GET" && request.method !== "PUT") return jsonResponse({ code: "method_not_allowed", message: "Este método no está permitido." }, 405, { Allow: "GET, PUT" });
      const identity = await authenticateBitbucket(request, options.fetch ?? fetch, options.authTimeoutMs ?? 5000);
      const canEdit = identity === soleQaEditorId;
      if (request.method === "PUT" && (!canEdit || request.headers.get("Origin") !== new URL(request.url).origin)) throw new QaTeamError(403, "forbidden", "No tienes permiso para modificar el equipo QA.");
      if (!options.store.isConfigured()) throw new QaTeamError(503, "not_configured", "El equipo QA compartido aún no está configurado.");
      let members;
      let expectedRevision;
      if (request.method === "PUT") {
        expectedRevision = request.headers.get("If-Match");
        if (!expectedRevision || !sharedQaTeamSchema.shape.revision.safeParse(expectedRevision).success || expectedRevision === "*" || expectedRevision.startsWith("W/") || expectedRevision.includes(",")) throw invalidRequest();
        if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json" || request.headers.has("Content-Encoding")) throw invalidRequest();
        const raw = await withDeadline(5000, (signal) => readJsonLimited(request.body, maxQaTeamBytes, signal, request.headers.get("Content-Length")));
        const parsed = writeSchema.safeParse(raw);
        if (!parsed.success) throw invalidRequest();
        members = parsed.data.members;
      }
      const stored = await options.store.read();
      const current = stored ? {
        ...storedQaTeamSchema.parse(stored.document),
        revision: sharedQaTeamSchema.shape.revision.parse(stored.revision),
      } : { members: qaTeamMembersSchema.parse(initialQaTeam), updatedAt: null, revision: "initial" };
      if (request.method === "GET") return jsonResponse(sharedQaTeamSchema.parse({ members: current.members, revision: current.revision, updatedAt: current.updatedAt, canEdit }));
      if (expectedRevision !== current.revision) throw conflict();
      const document = storedQaTeamSchema.parse({ version: 1, members, updatedAt: (options.now?.() ?? new Date()).toISOString(), updatedBy: soleQaEditorId });
      if (new TextEncoder().encode(JSON.stringify(document)).byteLength > maxQaTeamBytes) throw new QaTeamError(413, "invalid_request", "La solicitud supera el tamaño permitido.");
      const revision = await options.store.write(document, expectedRevision);
      return jsonResponse(sharedQaTeamSchema.parse({ members: document.members, revision, updatedAt: document.updatedAt, canEdit }));
    } catch (error) {
      const safeError = error instanceof QaTeamError ? error : unavailable();
      return jsonResponse({ code: safeError.code, message: safeError.message }, safeError.status);
    }
  };
}
