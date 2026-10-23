import { basicAuthorization } from "../bitbucket/authorization";
import type { Person } from "../../types/domain";
import { sharedQaTeamSchema, type SharedQaTeam } from "./contracts";

export interface QaTeamClient {
  read: () => Promise<SharedQaTeam>;
  save: (members: Person[], revision: string) => Promise<SharedQaTeam>;
}

export class QaTeamError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "QaTeamError"; }
}

const messages: Record<string, string> = {
  unauthorized: "No se pudo verificar tu cuenta para consultar el equipo. Vuelve a conectar con Bitbucket.",
  forbidden: "Solo Javier Mejías puede modificar el equipo QA.",
  conflict: "El equipo cambió en otra pestaña. Actualiza la lista y revisa el cambio antes de volver a guardarlo.",
  invalid_request: "No se pudo guardar esa selección de personas. Actualiza el directorio y vuelve a intentarlo.",
  not_configured: "El equipo compartido aún no está configurado. Conecta un almacén privado de Vercel Blob al proyecto.",
  unavailable: "No se pudo consultar el equipo compartido. Revisa tu conexión y vuelve a intentarlo.",
};

export function createQaTeamClient(credentials: { email: string; token: string }, session: { signal: AbortSignal; expiresAt: number }): QaTeamClient {
  const authorization = basicAuthorization(credentials);
  const request = async (members?: Person[], revision?: string): Promise<SharedQaTeam> => {
    if (Date.now() >= session.expiresAt || session.signal.aborted) throw new QaTeamError("unauthorized", messages.unauthorized);
    try {
      const response = await fetch("/api/qa-team", {
        method: members === undefined ? "GET" : "PUT",
        headers: { Accept: "application/json", Authorization: authorization, ...(members !== undefined ? { "Content-Type": "application/json", "If-Match": revision! } : {}) },
        ...(members !== undefined ? { body: JSON.stringify({ members }) } : {}),
        credentials: "omit", cache: "no-store", redirect: "error",
        signal: AbortSignal.any([session.signal, AbortSignal.timeout(30000)]),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => undefined);
        const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" && Object.hasOwn(messages, payload.code) ? payload.code : "unavailable";
        throw new QaTeamError(code, messages[code]);
      }
      return sharedQaTeamSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof QaTeamError) throw error;
      throw new QaTeamError("unavailable", members === undefined ? messages.unavailable : "No se pudo confirmar el guardado. Actualiza el equipo antes de volver a intentarlo.");
    }
  };
  return { read: () => request(), save: (members, revision) => request(members, revision) };
}
