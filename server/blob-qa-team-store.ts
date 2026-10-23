import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { sharedQaTeamSchema } from "../src/lib/team/contracts";
import { conflict, maxQaTeamBytes, QaTeamError, readJsonLimited, unavailable, withDeadline } from "./http";
import { storedQaTeamSchema } from "./qa-team-store";
import type { QaTeamStore } from "./qa-team-store";

export const qaTeamBlobPathname = "kontrolpr/shared-qa-team-v1.json";

export interface BlobStoreOptions {
  get?: typeof get;
  put?: typeof put;
  token?: () => string | undefined;
  timeoutMs?: number;
}

export function createBlobQaTeamStore(options: BlobStoreOptions = {}): QaTeamStore {
  const getBlob = options.get ?? get;
  const putBlob = options.put ?? put;
  const token = options.token ?? (() => process.env.BLOB_READ_WRITE_TOKEN);
  const timeoutMs = options.timeoutMs ?? 8000;
  const requireToken = () => {
    const value = token()?.trim();
    if (!value) throw new QaTeamError(503, "not_configured", "El equipo QA compartido aún no está configurado.");
    return value;
  };

  return {
    isConfigured: () => Boolean(token()?.trim()),
    async read() {
      const credential = requireToken();
      try {
        return await withDeadline(timeoutMs, async (signal) => {
          const result = await getBlob(qaTeamBlobPathname, { access: "private", useCache: false, token: credential, abortSignal: signal });
          if (result === null) return null;
          if (result.statusCode !== 200) throw unavailable();
          const raw = await readJsonLimited(result.stream, maxQaTeamBytes, signal, String(result.blob.size));
          const document = storedQaTeamSchema.parse(raw);
          const revision = sharedQaTeamSchema.shape.revision.parse(result.blob.etag);
          if (revision === "initial") throw unavailable();
          return { document, revision };
        });
      } catch {
        throw unavailable();
      }
    },
    async write(document, expectedRevision) {
      const credential = requireToken();
      try {
        const body = JSON.stringify(storedQaTeamSchema.parse(document));
        if (new TextEncoder().encode(body).byteLength > maxQaTeamBytes) throw unavailable();
        const result = await withDeadline(timeoutMs, (signal) => putBlob(qaTeamBlobPathname, body, {
          access: "private",
          token: credential,
          addRandomSuffix: false,
          contentType: "application/json",
          cacheControlMaxAge: 60,
          abortSignal: signal,
          ...(expectedRevision === "initial" ? { allowOverwrite: false } : { allowOverwrite: true, ifMatch: expectedRevision }),
        }));
        const revision = sharedQaTeamSchema.shape.revision.parse(result.etag);
        if (revision === "initial") throw unavailable();
        return revision;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) throw conflict();
        // The SDK exposes an existing first-create pathname as a generic BlobError.
        if (expectedRevision === "initial" && error instanceof BlobError && /already exists/i.test(error.message)) throw conflict();
        throw unavailable();
      }
    },
  };
}
