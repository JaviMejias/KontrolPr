import { useEffect, useState } from "react";
import type { RepositoryDirectory } from "../../types/domain";

export type DirectoryLoader = (signal: AbortSignal) => Promise<RepositoryDirectory[]>;

export function useDirectory(load: DirectoryLoader | undefined, scope: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ load: DirectoryLoader; scope: string; attempt: number; entries: RepositoryDirectory[]; error?: string }>();
  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    void load(controller.signal).then((entries) => {
      if (!controller.signal.aborted) setResult({ load, scope, attempt, entries });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ load, scope, attempt, entries: [], error: "No se pudo cargar el directorio. Revisa tu conexión y pulsa Actualizar personas." });
    });
    return () => controller.abort();
  }, [load, scope, attempt]);
  const current = result?.load === load && result?.scope === scope ? result : undefined;
  return { entries: current?.entries ?? [], error: current?.attempt === attempt ? current.error : undefined, loading: Boolean(load && current?.attempt !== attempt), refresh: () => setAttempt((value) => value + 1) };
}
