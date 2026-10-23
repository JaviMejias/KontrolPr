import { Buffer } from "node:buffer";
import { z } from "zod";
import { QaTeamError, readJsonLimited, unavailable, withDeadline } from "./http.js";

const identitySchema = z.object({ uuid: z.string().regex(/^\{[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\}$/i).transform((value) => value.toLowerCase()) });
const unauthorized = () => new QaTeamError(401, "unauthorized", "Inicia sesión con una cuenta válida de Bitbucket.");

export async function authenticateBitbucket(request: Request, fetcher: typeof fetch, timeoutMs: number): Promise<string> {
  const authorization = request.headers.get("Authorization");
  if (!authorization || authorization.length > 8192 || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(authorization)) throw unauthorized();
  const encoded = authorization.slice(6);
  const credentials = Buffer.from(encoded, "base64");
  const separator = credentials.indexOf(58);
  if (credentials.toString("base64") !== encoded || separator < 1 || separator === credentials.length - 1) throw unauthorized();
  try {
    return await withDeadline(timeoutMs, async (signal) => {
      const response = await fetcher("https://api.bitbucket.org/2.0/user", {
        method: "GET",
        headers: { Authorization: authorization, Accept: "application/json" },
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        if (response.status === 401 || response.status === 403) throw unauthorized();
        throw unavailable();
      }
      const identity = identitySchema.safeParse(await readJsonLimited(response.body, 32 * 1024, signal, response.headers.get("Content-Length")));
      if (!identity.success) throw unavailable();
      return identity.data.uuid;
    });
  } catch (error) {
    if (error instanceof QaTeamError && error.code === "unauthorized") throw error;
    throw unavailable();
  }
}
