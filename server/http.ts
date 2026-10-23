export class QaTeamError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export const invalidRequest = () => new QaTeamError(400, "invalid_request", "La solicitud no es válida.");
export const unavailable = () => new QaTeamError(503, "unavailable", "El equipo QA compartido no está disponible. Intenta nuevamente.");
export const conflict = () => new QaTeamError(409, "conflict", "El equipo QA cambió. Actualiza los datos antes de guardar.");
export const maxQaTeamBytes = 64 * 1024;

export async function withDeadline<T>(milliseconds: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(unavailable());
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readJsonLimited(stream: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal, contentLength?: string | null): Promise<unknown> {
  if (contentLength && !/^\d+$/.test(contentLength)) throw invalidRequest();
  if (contentLength && Number(contentLength) > limit) {
    void stream?.cancel().catch(() => undefined);
    throw new QaTeamError(413, "invalid_request", "La solicitud supera el tamaño permitido.");
  }
  if (!stream || signal.aborted) throw invalidRequest();
  const reader = stream.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw invalidRequest();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new QaTeamError(413, "invalid_request", "La solicitud supera el tamaño permitido.");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    cancel();
    if (error instanceof QaTeamError) throw error;
    throw invalidRequest();
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Authorization");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers });
}
