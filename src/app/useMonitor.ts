import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocalPreferences, Person, PullRequestSnapshot, SyncState, UserRole } from "../types/domain";
import type { BitbucketApiClient } from "../lib/bitbucket/contracts";
import { createBitbucketApiClient } from "../lib/bitbucket/api-client";
import { getCurrentUser, readRepository, type RepositoryProgress } from "../lib/bitbucket/reader";
import { defaultPreferences, loadPreferences, savePreferences } from "../lib/storage/indexed-db";
import { isIgnored, repositoryKey } from "../features/settings/services/tracking";
import { notificationEventIds, playNotificationSound, showSystemNotification } from "../features/notifications/service";
import { BitbucketApiError } from "../lib/bitbucket/contracts";
import { clearSession, sessionExpiresAt, readSession, saveSession, sessionStorageKey } from "../features/auth/services/session-storage";
import { clearSnapshotCache, loadSnapshotCache, repositorySignature, saveSnapshotCache, syncIntervalMs } from "../lib/storage/snapshot-cache";
import { mapConcurrent } from "../lib/map-concurrent";
import { effectiveQaIds } from "../config/qa-users";
import { normalizePreferences } from "../lib/storage/preferences";
import { readTeamDirectory } from "../lib/bitbucket/directory";
import { createQaTeamClient } from "../lib/team/api-client";
import { useSharedQaTeam } from "../features/settings/useSharedQaTeam";
import type { RepositoryCheckpoint, RepositorySyncStatistics } from "../lib/bitbucket/repository-sync";

interface Session { user: Person; client: BitbucketApiClient; createdAt: number; expiresAt: number; controller: AbortController }

export function useMonitor() {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const preferencesRef = useRef(preferences);
  const [session, setSession] = useState<Session>();
  const sessionRef = useRef<Session | undefined>(undefined);
  const [data, setData] = useState<PullRequestSnapshot[]>([]);
  const dataRef = useRef(data);
  const seen = useRef(new Set<string>());
  const baselinedRepositories = useRef(new Set<string>());
  const running = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const [ready, setReady] = useState(false);
  const [sessionNotice, setSessionNotice] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const halted = useRef(false);
  const hydrated = useRef(false);
  const [syncState, setSyncState] = useState<SyncState>({ status: "idle" });
  const nextSyncAt = useRef(0);
  const loadedRepositories = useRef("");
  const loadedQaIds = useRef("");
  const repositoryCheckpoints = useRef<Record<string, RepositoryCheckpoint>>({});
  const { state: qaTeamState, open: openQaTeam, refresh: refreshQaTeam, save: saveQaTeam, close: closeQaTeam, current: currentQaTeam } = useSharedQaTeam();
  const sharedPreferences = useMemo(() => ({ ...preferences, qaTeamMembers: qaTeamState.snapshot?.members ?? [], qaTeamBindings: {}, qaAccountIds: [] }), [preferences, qaTeamState.snapshot]);

  const changePreferences = useCallback((patch: Partial<LocalPreferences>) => {
    const currentSession = sessionRef.current;
    if (halted.current || !currentSession) return;
    const { qaTeamMembers: _members, qaTeamBindings: _bindings, qaAccountIds: _ids, ...localPatch } = patch;
    void _members; void _bindings; void _ids;
    const next = normalizePreferences({ ...preferencesRef.current, ...localPatch });
    preferencesRef.current = next;
    setPreferences(next);
    void savePreferences(next, currentSession.user.accountId);
  }, []);

  const endSession = useCallback((message: string, forget = true) => {
    generation.current += 1;
    halted.current = true;
    sessionRef.current?.controller.abort();
    sessionRef.current = undefined;
    closeQaTeam();
    setSession(undefined);
    dataRef.current = []; setData([]);
    repositoryCheckpoints.current = {};
    hydrated.current = false;
    preferencesRef.current = defaultPreferences; setPreferences(defaultPreferences);
    seen.current.clear(); baselinedRepositories.current.clear();
    if (forget) { clearSession(); void clearSnapshotCache(); }
    nextSyncAt.current = 0; loadedRepositories.current = "";
    setRequiresLogin(true); setSessionNotice(message);
    setSyncState({ status: "idle" }); setReady(true);
  }, [closeQaTeam]);

  useEffect(() => {
    let cancelled = false;
    const operation = generation.current;
    const controller = new AbortController();
    void (async () => {
      const saved = readSession();
      if (saved.status === "expired" || saved.status === "invalid") {
        endSession(saved.status === "expired" ? "Tu sesión venció después de 12 horas. Vuelve a conectar tu cuenta." : "No se pudo recuperar la sesión guardada. Vuelve a conectar tu cuenta.");
        return;
      }
      if (saved.status === "saved") {
        const { createdAt, expiresAt } = saved.session;
        const client = createBitbucketApiClient(saved.session, { signal: controller.signal, expiresAt });
        try {
          const user = await getCurrentUser(client);
          const stored = await loadPreferences(user.accountId);
          const cache = await loadSnapshotCache(user.accountId, createdAt, expiresAt, stored.repositories);
          if (cancelled || generation.current !== operation) return;
          if (Date.now() >= expiresAt) { endSession("Tu sesión venció después de 12 horas. Vuelve a conectar tu cuenta."); return; }
          const restored = { user, client, createdAt, expiresAt, controller };
          sessionRef.current = restored; setSession(restored);
          preferencesRef.current = stored; setPreferences(stored);
          const roster = await openQaTeam(createQaTeamClient(saved.session, { signal: controller.signal, expiresAt }), () => endSession("Bitbucket rechazó la sesión. Vuelve a conectar tu cuenta."));
          if (cancelled || generation.current !== operation) return;
          if (Date.now() >= expiresAt) { endSession("Tu sesión venció después de 12 horas. Vuelve a conectar tu cuenta."); return; }
          hydrated.current = true;
          halted.current = false; setRequiresLogin(false);
          loadedRepositories.current = stored.repositories.map(repositoryKey).join("|");
          loadedQaIds.current = roster ? effectiveQaIds({ ...stored, qaTeamMembers: roster.members }).join("|") : "unavailable";
          if (cache && roster) {
            repositoryCheckpoints.current = cache.checkpoints ?? {};
            dataRef.current = cache.snapshots; setData(cache.snapshots);
            cache.snapshots.flatMap(notificationEventIds).forEach((id) => seen.current.add(id));
            cache.baselinedRepositories.forEach((key) => baselinedRepositories.current.add(key));
            const qaSignature = effectiveQaIds({ ...stored, qaTeamMembers: roster.members }).join("|");
            const staleReviewConfig = cache.snapshots.some((pr) => pr.sourceHash && pr.destinationHash && (pr.reviewEvidence?.version !== 2 || pr.reviewEvidence.qaSignature !== qaSignature));
            nextSyncAt.current = staleReviewConfig ? 0 : cache.syncedAt + syncIntervalMs;
            setSyncState({ status: cache.message ? "error" : "success", lastSyncedAt: new Date(cache.syncedAt).toISOString(), nextSyncAt: nextSyncAt.current && nextSyncAt.current < expiresAt ? new Date(nextSyncAt.current).toISOString() : undefined, message: cache.message, source: "cache" });
          } else { nextSyncAt.current = roster ? 0 : Date.now() + syncIntervalMs; setSyncState({ status: roster ? "syncing" : "idle" }); }
          setReady(true);
        } catch (error) {
          if (cancelled || generation.current !== operation) return;
          const unauthorized = error instanceof BitbucketApiError && error.code === "unauthorized";
          endSession(unauthorized ? "Bitbucket rechazó la sesión guardada. Vuelve a conectar tu cuenta." : "No se pudo verificar la sesión guardada. Revisa tu conexión y recarga para reintentar.", unauthorized);
        }
        return;
      }
      if (cancelled || generation.current !== operation) return;
      endSession("");
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [endSession, openQaTeam]);

  useEffect(() => {
    if (!session) return;
    const checkExpiry = () => { if (Date.now() >= session.expiresAt) endSession("Tu sesión venció después de 12 horas. Vuelve a conectar tu cuenta."); };
    const timer = window.setTimeout(checkExpiry, Math.max(0, session.expiresAt - Date.now()));
    const checkOtherTab = (event: StorageEvent) => {
      if (event.key !== sessionStorageKey && event.key !== null) return;
      endSession("La sesión cambió o se cerró en otra pestaña. Recarga o vuelve a conectar tu cuenta.", false);
    };
    document.addEventListener("visibilitychange", checkExpiry);
    window.addEventListener("focus", checkExpiry);
    window.addEventListener("storage", checkOtherTab);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", checkExpiry); window.removeEventListener("focus", checkExpiry); window.removeEventListener("storage", checkOtherTab); };
  }, [session, endSession]);

  useEffect(() => () => { sessionRef.current?.controller.abort(); }, []);

  const sync = useCallback(async (refreshTeam = true) => {
    if (halted.current || !hydrated.current || !sessionRef.current) return;
    if (sessionRef.current && Date.now() >= sessionRef.current.expiresAt) { endSession("Tu sesión venció después de 12 horas. Vuelve a conectar tu cuenta."); return; }
    const currentGeneration = generation.current;
    if (running.current === currentGeneration) return;
    running.current = currentGeneration;
    const currentSession = sessionRef.current;
    const configured = preferencesRef.current.repositories;
    const startedAt = Date.now();
    nextSyncAt.current = startedAt + syncIntervalMs;
    const progress = new Map<string, RepositoryProgress>();
    const completedRepositories = new Set<string>();
    const publishProgress = () => {
      if (generation.current !== currentGeneration || running.current !== currentGeneration) return;
      const values = [...progress.values()];
      const knownTotal = values.length === configured.length && values.every((item) => item.total !== undefined);
      setSyncState((old) => ({ ...old, status: "syncing", nextSyncAt: undefined, progress: { startedAt, repositoriesTotal: configured.length, repositoriesCompleted: completedRepositories.size, pagesRead: values.reduce((sum, item) => sum + item.pagesRead, 0), pullRequestsCompleted: values.reduce((sum, item) => sum + item.completed, 0), pullRequestsTotal: knownTotal ? values.reduce((sum, item) => sum + (item.total ?? 0), 0) : undefined } }));
    };
    try {
      setSyncState((old) => ({ ...old, status: "syncing", nextSyncAt: undefined, progress: undefined }));
      const roster = refreshTeam || !currentQaTeam() ? await refreshQaTeam() : currentQaTeam();
      if (generation.current !== currentGeneration) return;
      if (!roster) {
        setSyncState((old) => ({ ...old, status: "error", message: "No se pudo verificar el equipo QA. La consulta de PR se reintentará con el equipo compartido disponible.", nextSyncAt: nextSyncAt.current < currentSession.expiresAt ? new Date(nextSyncAt.current).toISOString() : undefined }));
        return;
      }
      if (!configured.length) { nextSyncAt.current = 0; setSyncState({ status: "idle" }); return; }
      const rosterIds = effectiveQaIds({ ...preferencesRef.current, qaTeamMembers: roster.members });
      publishProgress();
      const errors: string[] = [];
      let unauthorized = false;
      let forbidden = false;
      const successes = new Set<string>();
      const deniedRepositories = new Set<string>();
      const checkpoints: Record<string, RepositoryCheckpoint> = {};
      const statistics: Record<string, RepositorySyncStatistics> = {};
      const result = await mapConcurrent(configured, 2, async (repo) => {
        const previous = dataRef.current.filter((pr) => repositoryKey(pr.repository) === repositoryKey(repo));
        const key = repositoryKey(repo);
        try {
          const items = await readRepository(currentSession.client, repo, previous, (value) => { progress.set(key, value); publishProgress(); }, rosterIds, { checkpoint: repositoryCheckpoints.current[key], onComplete: (checkpoint, metrics) => { checkpoints[key] = checkpoint; statistics[key] = metrics; } });
          successes.add(key); return items;
        }
        catch (error) {
          if (error instanceof BitbucketApiError && error.code === "unauthorized") unauthorized = true;
          const denied = error instanceof BitbucketApiError && error.code === "forbidden";
          if (denied) deniedRepositories.add(key);
          delete checkpoints[key]; delete statistics[key];
          forbidden ||= denied;
          errors.push(`${repositoryKey(repo)}: no se pudo actualizar. Revisa acceso, token o conexión.`);
          return denied ? [] : previous;
        }
        finally { completedRepositories.add(repositoryKey(repo)); publishProgress(); }
      });
      if (generation.current !== currentGeneration) return;
      if (Date.now() >= currentSession.expiresAt) { endSession("Tu sesión venció después de 12 horas. Vuelve a conectar tu cuenta."); return; }
      if (unauthorized) { endSession("Bitbucket rechazó el token. Vuelve a conectar tu cuenta."); return; }
      const snapshots = [...new Map(result.flat().map((pr) => [`${repositoryKey(pr.repository)}#${pr.id}`, pr])).values()];
      const allowed = new Set(configured.map(repositoryKey));
      const retained = Object.entries(repositoryCheckpoints.current).filter(([key]) => allowed.has(key) && !successes.has(key) && !deniedRepositories.has(key));
      repositoryCheckpoints.current = { ...Object.fromEntries(retained), ...checkpoints };
      const currentPreferences = preferencesRef.current;
      const newItems = snapshots.filter((pr) => successes.has(repositoryKey(pr.repository)) && baselinedRepositories.current.has(repositoryKey(pr.repository)) && notificationEventIds(pr).some((id) => !seen.current.has(id)) && (currentPreferences.role !== "qa" || !isIgnored(pr, currentPreferences)) && (currentPreferences.role !== "developer" || pr.author.accountId === currentSession.user.accountId));
      const baselineIds = snapshots.filter((pr) => successes.has(repositoryKey(pr.repository)) && !baselinedRepositories.current.has(repositoryKey(pr.repository))).flatMap(notificationEventIds);
      snapshots.forEach((pr) => notificationEventIds(pr).forEach((id) => seen.current.add(id)));
      successes.forEach((key) => baselinedRepositories.current.add(key));
      changePreferences({ firstSyncCompleted: true, lastObservedEventIds: [...new Set([...currentPreferences.lastObservedEventIds, ...baselineIds])] });
      dataRef.current = snapshots;
      setData(snapshots);
      const syncedAt = Date.now();
      nextSyncAt.current = syncedAt + syncIntervalMs;
      setSyncState({ status: errors.length ? "error" : "success", lastSyncedAt: new Date(syncedAt).toISOString(), nextSyncAt: nextSyncAt.current < currentSession.expiresAt ? new Date(nextSyncAt.current).toISOString() : undefined, message: errors.join(" "), statistics });
      if (successes.size > 0 || forbidden) {
        void saveSnapshotCache({ version: 1, owner: currentSession.user.accountId, sessionCreatedAt: currentSession.createdAt, expiresAt: currentSession.expiresAt, repositories: repositorySignature(configured), baselinedRepositories: [...baselinedRepositories.current], syncedAt, message: errors.join(" "), snapshots, checkpoints: repositoryCheckpoints.current }).then((persisted) => {
          if (!persisted && generation.current === currentGeneration) setSyncState((old) => ({ ...old, message: `${old.message ? `${old.message} ` : ""}No se pudo guardar la caché en este navegador; F5 puede requerir otra consulta.` }));
        });
      }
      if (newItems.length > 0) {
        if (currentPreferences.soundEnabled) playNotificationSound();
        if (currentPreferences.notificationsEnabled) void showSystemNotification(newItems.length).catch(() => setSyncState((old) => ({ ...old, message: "No se pudo mostrar el aviso del sistema. Consulta la campana." })));
      }
    } finally { if (running.current === currentGeneration) running.current = undefined; }
  }, [changePreferences, endSession, refreshQaTeam, currentQaTeam]);

  const configuredKey = preferences.repositories.map(repositoryKey).join("|");
  const configuredQaIds = qaTeamState.snapshot ? effectiveQaIds(sharedPreferences).join("|") : "unavailable";
  useEffect(() => {
    if (!ready || !session || requiresLogin) return;
    generation.current += 1;
    if (loadedQaIds.current !== configuredQaIds) { loadedQaIds.current = configuredQaIds; nextSyncAt.current = 0; }
    if (loadedRepositories.current !== configuredKey) {
      loadedRepositories.current = configuredKey;
      nextSyncAt.current = 0;
      const allowed = new Set(preferencesRef.current.repositories.map(repositoryKey));
      repositoryCheckpoints.current = Object.fromEntries(Object.entries(repositoryCheckpoints.current).filter(([key]) => allowed.has(key)));
      dataRef.current = dataRef.current.filter((pr) => allowed.has(repositoryKey(pr.repository))); setData(dataRef.current);
    }
    if (!configuredKey) { void sync(false); return; }
    if (Date.now() >= nextSyncAt.current) void sync(false);
    let timer: number;
    let cancelled = false;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible" && Date.now() >= nextSyncAt.current) void sync().finally(() => { if (!cancelled) schedule(); });
        else schedule();
      }, Math.max(1000, nextSyncAt.current - Date.now()));
    };
    schedule();
    const resume = () => { if (document.visibilityState === "visible" && Date.now() >= nextSyncAt.current) void sync(); };
    document.addEventListener("visibilitychange", resume);
    return () => { cancelled = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", resume); };
  }, [ready, session, configuredKey, configuredQaIds, sync, requiresLogin]);

  const connect = async (email: string, token: string, role: UserRole) => {
    if (role !== "qa" && role !== "developer" && role !== "observer") throw new Error("Choose a valid perspective before connecting");
    const operation = ++generation.current;
    const createdAt = Date.now();
    const expiresAt = sessionExpiresAt(createdAt);
    const controller = new AbortController();
    const client = createBitbucketApiClient({ email, token }, { signal: controller.signal, expiresAt });
    try {
      const user = await getCurrentUser(client);
      const stored = { ...await loadPreferences(user.accountId), role };
      await savePreferences(stored, user.accountId);
      if (operation !== generation.current || Date.now() >= expiresAt) throw new Error("Session no longer current");
      sessionRef.current?.controller.abort();
      const next = { client, user, createdAt, expiresAt, controller };
      sessionRef.current = next;
      const persisted = saveSession({ version: 2, email, token, createdAt, expiresAt });
      setSessionNotice(persisted ? "" : "Este navegador no permite guardar la sesión. Al recargar tendrás que conectar de nuevo.");
      halted.current = false; hydrated.current = true; setRequiresLogin(false);
      dataRef.current = [];
      repositoryCheckpoints.current = {};
      seen.current.clear(); baselinedRepositories.current.clear();
      preferencesRef.current = stored; setPreferences(stored); setData([]);
      const roster = await openQaTeam(createQaTeamClient({ email, token }, { signal: controller.signal, expiresAt }), () => endSession("Bitbucket rechazó la sesión. Vuelve a conectar tu cuenta."));
      if (operation !== generation.current || Date.now() >= expiresAt) throw new Error("Session no longer current");
      nextSyncAt.current = roster ? 0 : Date.now() + syncIntervalMs;
      loadedQaIds.current = roster ? effectiveQaIds({ ...stored, qaTeamMembers: roster.members }).join("|") : "unavailable";
      setSyncState({ status: roster ? "syncing" : "idle" }); setReady(true);
      setSession(next);
    } catch (error) { controller.abort(); throw error; }
  };

  const disconnect = () => endSession("");

  const loadDirectory = useCallback(async (signal: AbortSignal) => {
    const active = sessionRef.current;
    if (!active || halted.current || signal.aborted) return [];
    if (Date.now() >= active.expiresAt) { endSession("Tu sesión venció después de 12 horas. Vuelve a conectar tu cuenta."); return []; }
    return readTeamDirectory(active.client, preferencesRef.current.repositories, signal);
  }, [endSession]);

  return { preferences: sharedPreferences, changePreferences, data, syncState, sync, connect, disconnect, loadDirectory, qaTeamState, refreshQaTeam, saveQaTeam, sessionNotice, requiresLogin, connected: Boolean(session), user: session?.user, loading: !ready || (!qaTeamState.snapshot && qaTeamState.status === "loading") || (syncState.status === "syncing" && data.length === 0) };
}
