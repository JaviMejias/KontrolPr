import { useCallback, useEffect, useRef, useState } from "react";
import type { Person } from "../../types/domain";
import type { SharedQaTeam } from "../../lib/team/contracts";
import { QaTeamError, type QaTeamClient } from "../../lib/team/api-client";

export interface QaTeamState {
  status: "idle" | "loading" | "ready" | "refreshing" | "saving" | "error";
  snapshot?: SharedQaTeam;
  message?: string;
  errorCode?: string;
}

export function useSharedQaTeam() {
  const [state, setState] = useState<QaTeamState>({ status: "idle" });
  const client = useRef<QaTeamClient | undefined>(undefined);
  const snapshot = useRef<SharedQaTeam | undefined>(undefined);
  const epoch = useRef(0);
  const reading = useRef<Promise<SharedQaTeam | undefined> | undefined>(undefined);
  const writing = useRef<Promise<boolean> | undefined>(undefined);
  const onUnauthorized = useRef<(() => void) | undefined>(undefined);

  useEffect(() => () => {
    epoch.current += 1; client.current = undefined; snapshot.current = undefined;
    reading.current = undefined; writing.current = undefined; onUnauthorized.current = undefined;
  }, []);

  const close = useCallback(() => {
    epoch.current += 1; client.current = undefined; snapshot.current = undefined; onUnauthorized.current = undefined;
    reading.current = undefined; writing.current = undefined;
    setState({ status: "idle" });
  }, []);

  const refresh = useCallback(async function refreshTeam(): Promise<SharedQaTeam | undefined> {
    const active = client.current;
    if (!active) return undefined;
    if (writing.current) { await writing.current; return client.current === active ? refreshTeam() : undefined; }
    if (reading.current) return reading.current;
    const operation = ++epoch.current;
    setState((old) => ({ snapshot: old.snapshot, status: old.snapshot ? "refreshing" : "loading" }));
    const pending = active.read().then((value) => {
      if (client.current !== active || epoch.current !== operation) return snapshot.current;
      snapshot.current = value; setState({ status: "ready", snapshot: value });
      return value;
    }).catch((error: unknown) => {
      if (client.current === active && epoch.current === operation && error instanceof QaTeamError && error.code === "unauthorized") onUnauthorized.current?.();
      if (client.current === active && epoch.current === operation) setState({ status: "error", snapshot: snapshot.current, message: error instanceof QaTeamError ? error.message : "No se pudo consultar el equipo compartido.", errorCode: error instanceof QaTeamError ? error.code : "unavailable" });
      return undefined;
    }).finally(() => { if (reading.current === pending) reading.current = undefined; });
    reading.current = pending;
    return pending;
  }, []);

  const open = useCallback((next: QaTeamClient, unauthorized?: () => void) => {
    epoch.current += 1; client.current = next; snapshot.current = undefined;
    reading.current = undefined; writing.current = undefined;
    onUnauthorized.current = unauthorized;
    setState({ status: "loading" });
    return refresh();
  }, [refresh]);

  const save = useCallback(async (members: Person[]): Promise<boolean> => {
    const active = client.current;
    const previous = snapshot.current;
    if (!active || !previous?.canEdit) return false;
    if (writing.current) return writing.current;
    const operation = ++epoch.current;
    reading.current = undefined;
    setState({ status: "saving", snapshot: previous });
    const pending = active.save(members, previous.revision).then((value) => {
      if (client.current !== active || epoch.current !== operation) return false;
      snapshot.current = value; setState({ status: "ready", snapshot: value });
      return true;
    }).catch(async (error: unknown) => {
      if (client.current !== active || epoch.current !== operation) return false;
      if (error instanceof QaTeamError && error.code === "unauthorized") onUnauthorized.current?.();
      if (client.current !== active || epoch.current !== operation) return false;
      let current = previous;
      if (error instanceof QaTeamError && error.code === "conflict") {
        try { current = await active.read(); } catch (readError) {
          if (client.current === active && epoch.current === operation && readError instanceof QaTeamError && readError.code === "unauthorized") onUnauthorized.current?.();
          // Otherwise keep the last verified roster until an explicit retry succeeds.
        }
      }
      if (client.current !== active || epoch.current !== operation) return false;
      if (error instanceof QaTeamError && error.code === "forbidden") current = { ...current, canEdit: false };
      snapshot.current = current;
      setState({ status: "error", snapshot: current, message: error instanceof QaTeamError ? error.message : "No se pudo confirmar el guardado del equipo.", errorCode: error instanceof QaTeamError ? error.code : "unavailable" });
      return false;
    }).finally(() => { if (writing.current === pending) writing.current = undefined; });
    writing.current = pending;
    return pending;
  }, []);

  const current = useCallback(() => snapshot.current, []);
  return { state, open, refresh, save, close, current };
}
