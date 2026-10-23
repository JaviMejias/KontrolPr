import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/layout/Sidebar";
import { Topbar } from "../components/layout/Topbar";
import type { OverviewPreferences, PullRequestViewModel, UserRole } from "../types/domain";
import { FilterBar } from "../features/filters/components/FilterBar";
import { initialFiltersForRole, initialOverviewForRole, requiresAttention } from "../features/filters/types";
import { computePullRequestViewModel } from "../features/pull-requests/services/qa-state";
import { SummaryCards } from "../features/pull-requests/components/SummaryCards";
import { PrList } from "../features/pull-requests/components/PrList";
import { PullRequestDetail } from "../features/pull-requests/components/PullRequestDetail";
import { SettingsView } from "../features/settings/components/SettingsView";
import { isIgnored, repositoryKey } from "../features/settings/services/tracking";
import { notificationEventIds } from "../features/notifications/service";
import { Switch } from "../components/ui/Switch";
import { IgnoredView } from "../features/settings/components/IgnoredView";
import { useMonitor } from "./useMonitor";
import { ViewSkeleton } from "../components/ui/ViewSkeleton";
import { SignInView } from "../features/auth/components/SignInView";
import { SyncProgress } from "../components/ui/SyncProgress";
import { effectiveQaIds, resolvedQaTeam } from "../config/qa-users";
import { personMatches } from "../lib/review-revision";
import { QaTeamNotice } from "../features/settings/components/QaTeamNotice";

export function App() {
  const monitor = useMonitor();
  const { preferences, changePreferences, data, user, connected } = monitor;
  const qaTeamControls = { qaTeamState: monitor.qaTeamState, onSaveQaTeam: monitor.saveQaTeam, onRefreshQaTeam: monitor.refreshQaTeam };
  const role = preferences.role;
  const [activeView, setActiveView] = useState<"overview" | "ignored" | "settings">("overview");
  const overview = preferences.overviewByRole?.[role] ?? initialOverviewForRole(role);
  const { filters, summary } = overview;
  const allAuthors = role === "developer" && overview.allAuthors;
  const updateOverview = (patch: Partial<OverviewPreferences>) => changePreferences({ overviewByRole: { ...preferences.overviewByRole, [role]: { ...overview, ...patch } } });
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>();
  const [detailKeys, setDetailKeys] = useState<string[]>([]);
  const [detailTrigger, setDetailTrigger] = useState<HTMLElement>();
  const viewModels = useMemo(() => {
    const qaIds = new Set(effectiveQaIds(preferences));
    const observedIds = new Set(preferences.lastObservedEventIds);
    return data.map((pr) => {
    const resolver = { isQa: (person: Parameters<typeof personMatches>[0]) => personMatches(person, qaIds) };
    const model = computePullRequestViewModel(pr, resolver, new Set());
    return { ...model, newEventCount: notificationEventIds(pr).filter((id) => !observedIds.has(id)).length };
    });
  }, [data, preferences]);
  const authors = [...new Map(viewModels.map((pr) => [pr.author.accountId, pr.author])).values()];
  const selectedAuthorIds = new Set(filters.authors);
  const tracked = viewModels.filter((pr) => role !== "qa" || !isIgnored(pr, preferences));
  const filtered = tracked.filter((pr) => {
    const text = `${pr.title} PR-${pr.id} ${pr.repository.label}`.toLocaleLowerCase("es");
    return text.includes(query.toLocaleLowerCase("es"))
      && (filters.repository === "all" || repositoryKey(pr.repository) === filters.repository)
      && (!selectedAuthorIds.size || selectedAuthorIds.has(pr.author.accountId))
      && (role !== "developer" || allAuthors || filters.authors.length > 0 || pr.author.accountId === user?.accountId)
      && (filters.status === "all" || (filters.status === "active" ? pr.flowState !== "INACTIVE" : pr.flowState === "INACTIVE"))
      && (filters.activity === "all" || (filters.activity === "attention" ? requiresAttention(pr, role) : pr.stale))
      && (!summary || (summary === "qa" ? pr.nextOwner === "qa" : summary === "developer" ? pr.nextOwner === "developer" : summary === "updated" ? pr.flowState === "UPDATED" : summary === "response" ? pr.flowState === "AUTHOR_RESPONDED" : true));
  }).sort((a, b) => Date.parse(b.lastRelevantActivityAt) - Date.parse(a.lastRelevantActivityAt));
  const unread = tracked.filter((pr) => pr.newEventCount > 0 && (role !== "developer" || pr.author.accountId === user?.accountId));
  const selected = viewModels.find((pr) => pr.key === selectedKey);
  const availableKeys = new Set(viewModels.map((pr) => pr.key));
  const detailQueue = detailKeys.filter((key) => availableKeys.has(key));
  const detailIndex = selectedKey ? detailQueue.indexOf(selectedKey) : -1;

  const markRead = (items: PullRequestViewModel[]) => changePreferences({ lastObservedEventIds: [...new Set([...preferences.lastObservedEventIds, ...items.flatMap(notificationEventIds)])] });
  const open = (pr: PullRequestViewModel) => { setDetailTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : undefined); markRead([pr]); setDetailKeys(filtered.some((item) => item.key === pr.key) ? filtered.map((item) => item.key) : [pr.key]); setSelectedKey(pr.key); };
  const moveDetail = (offset: number) => { const next = viewModels.find((pr) => pr.key === detailQueue[detailIndex + offset]); if (next) { markRead([next]); setSelectedKey(next.key); } };
  const togglePr = (key: string) => changePreferences({ ignoredPullRequestKeys: preferences.ignoredPullRequestKeys.includes(key) ? preferences.ignoredPullRequestKeys.filter((id) => id !== key) : [...preferences.ignoredPullRequestKeys, key] });
  const effectiveView = monitor.requiresLogin ? "settings" : role !== "qa" && activeView === "ignored" ? "overview" : activeView;
  useEffect(() => { document.title = `KontrolPR · ${!connected ? "Iniciar sesión" : effectiveView === "overview" ? "Resumen" : effectiveView === "ignored" ? "Ignorados" : "Configuración"}`; }, [effectiveView, connected]);

  const connect = async (email: string, token: string, perspective: UserRole) => {
    await monitor.connect(email, token, perspective);
    setSelectedKey(undefined); setDetailKeys([]); setQuery(""); setActiveView("overview");
  };

  if (!connected || !user) return <SignInView loading={monitor.loading} notice={monitor.sessionNotice} onConnect={connect} />;

  return <div className="app-shell"><Sidebar role={role} activeView={effectiveView} onViewChange={setActiveView} connected={connected} connectionLabel={monitor.requiresLogin ? "Vuelve a conectar" : monitor.loading && !connected ? "Recuperando sesión…" : undefined} /><main className="app-main">
    <Topbar syncEnabled={preferences.repositories.length > 0} syncState={monitor.syncState} disabled={monitor.requiresLogin || monitor.loading} searchDisabled={monitor.requiresLogin} onSync={() => void monitor.sync()} query={query} onQueryChange={setQuery} onSearchActivate={() => setActiveView("overview")} notifications={unread} onOpenNotification={open} onReadAll={() => markRead(unread)} />
    <div className="content-wrap">{monitor.sessionNotice && <div className="session-notice" role="status">{monitor.sessionNotice}</div>}<QaTeamNotice state={monitor.qaTeamState} onRefresh={monitor.refreshQaTeam} />{monitor.syncState.status === "syncing" && monitor.syncState.progress && <SyncProgress progress={monitor.syncState.progress} />}{effectiveView === "settings" ? <SettingsView {...qaTeamControls} preferences={preferences} onChange={changePreferences} pullRequests={data} user={user} connected={connected} requiresLogin={monitor.requiresLogin} onConnect={connect} loading={monitor.loading} onLoadDirectory={monitor.loadDirectory} onDisconnect={() => { setSelectedKey(undefined); monitor.disconnect(); }} /> : <div className={effectiveView === "overview" ? "overview-view" : undefined} key={effectiveView}>
      {effectiveView === "overview" && <div className="view-heading"><div><span className="eyebrow">{role === "observer" ? "Progreso del equipo" : "Seguimiento de PR"}</span><h2>La siguiente acción, clara.</h2></div><span className="result-count">{monitor.loading ? "Consultando…" : monitor.qaTeamState.snapshot ? `${filtered.length} resultados` : "Equipo sin verificar"}</span></div>}
      {effectiveView === "overview" ? monitor.loading ? <ViewSkeleton label="Cargando resumen" /> : !monitor.qaTeamState.snapshot ? <p className="session-notice">El resumen estará disponible al verificar el equipo QA.</p> : <>
        {resolvedQaTeam(preferences).length === 0 && <p className="session-notice" role="status">No hay QA configurados. {monitor.qaTeamState.snapshot.canEdit ? "Añádelos en Configuración → Desarrolladores" : "Javier puede configurarlos"} para identificar sus revisiones.</p>}
        <SummaryCards pullRequests={tracked.filter((pr) => role !== "developer" || allAuthors || (selectedAuthorIds.size ? selectedAuthorIds.has(pr.author.accountId) : pr.author.accountId === user.accountId))} role={role} selected={summary} onSelect={(value) => updateOverview({ summary: value, filters: { ...initialFiltersForRole(role), activity: !value ? initialFiltersForRole(role).activity : value === "stale" ? "stale" : "all" } })} />
        {role === "developer" && <div className="own-filter"><Switch checked={allAuthors} onCheckedChange={(value) => updateOverview({ allAuthors: value })} label="Ver PR de todos los autores" /></div>}
        <FilterBar filters={filters} onChange={(value) => updateOverview({ filters: value, summary: "" })} onReset={() => { updateOverview(initialOverviewForRole(role)); setQuery(""); }} repositories={preferences.repositories} authors={authors} role={role} />
        <PrList pullRequests={filtered} onOpen={open} onIgnore={togglePr} showIgnore={role === "qa"} loading={monitor.loading} refreshing={monitor.syncState.status === "syncing"} />
      </> : <IgnoredView preferences={preferences} pullRequests={viewModels} onChange={changePreferences} onOpen={open} loading={monitor.loading} />}
    </div>}</div>{selectedKey && !selected && <div className="session-notice" role="status">El PR seleccionado ya no está disponible en esta consulta.<button className="text-link" onClick={() => setSelectedKey(undefined)}>Entendido</button></div>}{selected && !monitor.requiresLogin && <PullRequestDetail returnFocusTo={detailTrigger} pullRequest={selected} people={[user, ...authors]} onClose={() => setSelectedKey(undefined)} onPrevious={detailIndex > 0 ? () => moveDetail(-1) : undefined} onNext={detailIndex >= 0 && detailIndex < detailQueue.length - 1 ? () => moveDetail(1) : undefined} position={detailIndex >= 0 ? `${detailIndex + 1} de ${detailQueue.length}` : undefined} onRefresh={() => void monitor.sync()} refreshing={monitor.syncState.status === "syncing"} />}
  </main></div>;
}
