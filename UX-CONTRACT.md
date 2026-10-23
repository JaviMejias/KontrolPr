# UX Contract

## Product context

- **Audience:** Kontroller / Erobot developers, QA and observers.
- **Primary jobs:** Identify the next review owner, inspect meaningful activity and open the source PR.
- **Target market(s):** Internal team workflow.
- **Active locales:** Spanish UI; English code and technical model identifiers.
- **Timezone/calendar policy:** Source timestamps are parsed as ISO instants and formatted with the browser locale.
- **Accessibility target:** WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Bitbucket resources and permissions | `docs/DECISIONS.md` | API documentation record | 2026-10-22 |
| Review state semantics | `docs/DECISIONS.md` | Product brief / domain decision | 2026-10-22 |
| Local ignore behavior | `docs/DECISIONS.md` | Product brief | 2026-10-22 |
| Shared QA membership and sole-editor permission | `docs/DECISIONS.md`, Shared QA roster | User-approved policy / server contract | 2026-10-23 |

## Visual contract

- **Project `DESIGN.md`:** `DESIGN.md`
- **Token ownership model:** `DESIGN.md` owns intent and values; CSS variables implement them.
- **Runtime source:** `src/index.css`
- **Mapping:** CSS variables are grouped under `:root` and documented by token names.
- **Supported themes:** Expressive midnight-blue dark theme with colored sections, defined in DESIGN.md after the user's rejection of the desaturated graphite replacement; forced-colors remains system-controlled. This palette change does not change navigation, authentication, filters or exclusions.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | No selection in read-only MVP | Product brief | none | not applicable |
| Select/Listbox | `FilterSelect`, shared `FilterPopover`, `MultiSelect` and `PersonSelect`; native directory select | DESIGN.md | radio disclosure / searchable multiple switches / searchable identity radios / platform-owned repository directory popup | keyboard + outside dismissal + popup geometry |
| Boolean switch | `src/components/ui/Switch.tsx` | DESIGN.md | lime / blue / violet / coral | keyboard + disabled/busy test |
| Empty / loading | Shared `EmptyState` and `TableSkeleton` | DESIGN.md | table / directory | pending-to-empty test + browser |
| Date | Browser-formatted timestamps | `src/lib/formatting.ts` | typed | unit test |
| Form | `SettingsView` field groups | UX contract | edit | component test |
| Scrollbar | Global `src/index.css` baseline | DESIGN.md | surface density | browser inspection |
| Toast | `SyncStatus` live status region | UX contract | info / warning / error | component test |
| CRUD | `QaTeamSettings`, `useSharedQaTeam`, `/api/qa-team` | Shared QA decision | confirmed add/remove/undo; others read-only | authorization + conflict + UI tests |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | tonal or outline | surface lift | signal ring | pressed tone | muted | stable width + `aria-busy` | inline status |
| Icon button | compact | surface lift | signal ring | pressed tone | muted | stable | tooltip/name |
| Input | dark surface | border lift | signal ring | n/a | muted | stable | inline text |
| Search | clear button when non-empty | surface lift | signal ring | n/a | muted | stale-safe | inline text |
| Table/list | semantic table on desktop | row tone | row outline | n/a | n/a | empty geometry | empty/error panel |

## Dataset navigation

- **Admin tables:** Not applicable; monitor uses bounded client-side list for the configured workspace.
- **Exploratory lists:** Filtered local list with explicit “Limpiar filtros”.
- **URL state:** Not persisted in URL. Committed filters, summary-card selection and developer all-authors scope are stored in per-account IndexedDB preferences, separately for QA/developer/observer. Free-text search remains transient and is not stored. Existing accounts without saved filters retain their role defaults.
- **Page size:** The active fixture/configured dataset is rendered in one bounded surface.
- **Empty/no-results/error/loading:** Inline empty state with recovery; stale data remains visible after sync errors.

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Search | Header focus / Ctrl+K / Ctrl+Alt+K | none for local filter | Resumen | immediate result count | clear search | focus stays in search; shortcut selects query | product brief |
| Sync | Refresh action / interval | button busy | same view | last sync updates | stale banner + retry | button retains focus | product brief |
| Ignore PR | Row action | local write | same view | row removed + count | inline error | next row | product brief |
| Restore PR | Ignored view action | local write | ignored view | row restored | inline error | restored row | product brief |
| Change QA team | Verified Javier adds/removes a person | stable disabled controls, confirmed server write | same section | saved for everyone + removal Undo | keep selection, explicit refresh after conflict/uncertain write | composer after confirmed mutation | `docs/DECISIONS.md`, Shared QA roster |

## Navigation and responsive behavior

- **Route document title:** `KontrolPR · {view}`.
- **Route error:** Preserve previous data and show a persistent recovery banner.
- **Sidebar:** Desktop rail becomes fixed bottom navigation below 820px with safe-area padding. Global Activity navigation is removed; full comment content remains in the PR detail.
- **Content width:** The authenticated header and all main views fill the space available beside the desktop rail, with shared 20px horizontal gutters (16px up to 820px), never a centered maximum-width cap. Keep natural document scrolling, mobile navigation clearance, sign-in sizing and detail-drawer geometry unchanged.
- **Responsive table:** Semantic table at desktop, cards under 760px.
- **Truncation:** Titles truncate visually but full text is available in the detail drawer and via `title`.
- **Focus restoration:** Detail drawer returns focus to its trigger when closed.
- **Detail navigation:** Store the selected PR key, not a snapshot object. Refresh the open detail from current models, preserving the dialog and its original filtered-key queue. Previous/next skip unavailable keys and disable at the ends; notification-only entries do not widen into a hidden role queue. A removed/403 PR unmounts its private detail and shows a dismissible unavailable notice.
- **Header search:** Displays `Ctrl + K`, never the Mac command symbol. `Ctrl+K` and the alternative `Ctrl+Alt+K` focus/select the search field and activate Resumen. Handled shortcut events cancel browser search only when delivered to this page; browser chrome and Firefox's per-site shortcut permissions remain outside the app's control. IME, AltGr, rich-text editors, open dialogs and already-handled events are respected. Printable keys are not captured globally. Clearing restores search focus; an expired session disables search.

## Overlays and feedback

- **Dialog primitive:** Detail drawer; no destructive confirmation is needed for reversible local ignore actions in the MVP.
- **Toast/live status:** Persistent status text near the header, deduplicated by message.
- **Layer order:** drawer > drawer backdrop > app content.

## Async and resilience

- **Mutation default:** Local preferences update optimistically in memory and write to IndexedDB in the background. The storage helper waits for transaction commit; failure retains only the account's in-memory fallback and cannot guarantee persistence after restart.
- **Offline/read-stale:** Existing data remains visible and is labeled stale.
- **Retry/backoff:** API client classifies 401, 403, 429 and network failures; synchronization can retry with bounded backoff.
- **Session expiry:** F5 restores and revalidates the saved account, keeping its original deadline of 12 elapsed hours from sign-in. Expiry is timezone-independent and is checked on startup, a scheduled timeout, focus/visibility and before API requests. Expiry or a rejected token aborts active work, clears live data and prompts reconnection, without substituting demo data. Offline revalidation preserves the unexpired credential for retry on reload.
- **Request races:** Synchronization is guarded by an in-flight promise and abort signals at the client boundary.
- **Cached session data:** After account revalidation, restore the schema-validated IndexedDB snapshot only for the same verified account, original login timestamps and configured repository set. Cache retention is bounded by the session's existing 12-hour deadline. Logout/expiry removes the snapshot (on next startup when closed); preferences remain. A fresh cache does not trigger PR queries on F5. An overdue cache stays visible while refreshing. The next automatic sync is due ten minutes after the last completed sync, not ten minutes after each reload; manual sync remains immediate. Returning to a visible tab only syncs if due. Repository changes invalidate freshness. A 403 removes that repository's cached data; network failures retain stale data with a warning. Identity revalidation is still required on reload, and repository permission changes may remain unseen until the next sync.
- **Visible schedule:** `SyncStatus` displays the same next deadline used by the scheduler, in the browser's timezone; F5 does not renew it. Queries in progress hide the old deadline. Errors retain the warning and label the next attempt honestly. Do not display a deadline after session expiry. No configured repositories means no automatic timer or manual queries; adding one resumes synchronization. The UI states that automatic checks require a visible app.
- **Preference recovery:** Version-1 envelopes accept prior unversioned records. Validate fields and list items separately; preserve valid exclusions, read receipts, QA bindings and unrelated role views. Strip unknown fields (including accidental credentials), deduplicate identities/repositories and reset removed repository filters to all. Keep missing author IDs selected until explicitly cleared, because an absent PR does not mean an author no longer exists. Unknown envelope versions are not interpreted as version 1. A missing/failed IndexedDB read falls back to the matching account's validated in-memory preferences.
- **Measured progress:** Show elapsed time and actual pages/repositories/PR processed; use indeterminate native progress until discovery establishes the total. No fake percentage or prediction. Read at most two repositories and three PR detail groups per repository concurrently.
- **QA classification:** The authenticated shared API roster is authoritative, including zero QA, overriding all legacy personal membership/defaults. Names and entry perspective never assign membership or editing authority. Only the server-verified Javier UUID may write. No storage configuration or failed first read means explicit recovery, never personal fallback or fabricated classification. A later failure keeps the last verified list, labeled stale. Revalidate at login/F5, manual/due automatic sync or explicit refresh. Changed effective IDs invalidate review evidence, including cache; zero verified QA gives guidance without blocking the app. See `docs/DECISIONS.md`, Shared QA roster.
- **QA identity selection:** Search loaded accounts with shared `PersonSelect`; render names, avatars and aliases, never raw IDs, even for duplicate names. Stable IDs remain internal values and matching keys. No technical JSON export. Only verified editor capability exposes the composer and Remove/Undo; read-only users see explanatory text. Explicit Add/Remove await server confirmation; preserve candidate and old list on failure, prevent duplicate submits, and require refreshing before editing after uncertain failure. Conditional revisions prevent cross-tab overwrites; on conflict fetch the current list and ask the user to review. Undo appears only while the confirmed removal still matches the current roster and uses its latest revision. Candidates include directory/signed-in users and PR participants, independent of overview filters. No name-based identity inference.
- **Bitbucket directory:** On entering Developers, independently read all pages of effective repository permissions. On 401/403/404, try paginated workspace members, sharing one in-flight workspace read across configured repositories. Repository permission reads require repository administration; workspace members require `read:workspace:bitbucket` and do not prove repository access. Label those origins explicitly, and do not offer per-repository following for workspace-only entries. Missing scopes, network/429, malformed or incomplete pagination are not empty success: explain the limitation and offer Update people, retaining PR-discovered candidates. Never present a partial page as a complete directory. Directory failures do not erase QA preferences or block PR reading; normal auth/expiry still controls the session. Abort and ignore replaced scope/unmounted/session results. No email harvesting or Bitbucket mutations. Directory data is session memory only; refreshing it does not trigger PR synchronization.
- **Review evidence:** Read paginated activity and current participants; compare immutable source/destination revisions using bounded text diffs only when a review reference needs comparison. Match QA feedback/active approval to activity revisions, not commit author dates. Incomplete history, binary/non-UTF-8/truncated/over-2-MiB diffs remain unknown. Verified changed content returns to QA, equal effective patches do not falsely imply a fix, and later commits with unknown evidence use “Nuevos commits · Verificar” (QA ownership). A current active approval must correspond to unchanged reviewed content and be later than feedback. This never claims functional correctness or performs Bitbucket writes.
- **Diff coverage:** Validate patch hunk lengths and require complete paginated diffstat to agree on file and added/removed line counts before comparing fingerprints. Missing/duplicate files or mismatching totals remain unknown. Reuse only format-2 immutable evidence; older evidence triggers synchronization, without discarding the rest of a valid session cache.
- **PWA updates:** Build-specific static caches contain the generated HTML/CSS/JS shell, never private API responses or IndexedDB. A waiting version is offered through `UpdateNotice`, including at sign-in. Check on startup, each visible minute and eligible visibility/online events. Only the update action sends SKIP_WAITING; controller change reloads already-controlled tabs once, without clearing credentials, preferences or PR cache. First install does not reload. Failed updates keep the existing version usable and expose retry. Vercel revalidates HTML/SW; hashed assets are immutable. See `docs/DECISIONS.md`.

## Permission and clipboard

- **Permission UI:** Read-only roles hide workflow mutation controls; Bitbucket remains the source of truth for actual permissions.
- **Connection:** Email and scoped API token use Basic authentication to api.bitbucket.org for PR reads and to the same-origin QA API for fresh identity verification; the latter never persists credentials. The user-authorized localStorage credential survives reload for 12 elapsed hours from sign-in, without renewing on reload. This is browser-readable storage, not a backend/HttpOnly security boundary. A blocked-storage warning explicitly identifies memory-only fallback. Local preferences/read receipts are partitioned by verified stable identity; team membership is shared. Disconnect clears the saved credential, visible preferences, roster capability and in-memory remote data, returning to sign-in; late responses cannot restore it. It does not revoke the token remotely or delete saved per-account preferences. See `docs/DECISIONS.md`.
- **Mandatory access gate:** Anonymous users see only sign-in and permission guidance. No demo data, fake current user, application navigation, Ignorados, search, sync, notifications or repository/developer configuration is mounted. Anonymous sync/preference mutations are also rejected by `useMonitor`. Recovery keeps the same gate until account verification completes; failure/expiry never substitutes fixtures. Successful manual sign-in requires an explicit QA/developer/observer choice and opens Resumen with that role. F5 restores the verified account's stored role until its original expiry without asking again.

## Follow-up workflow contract

- Repositories: an arbitrary number of workspace/slug entries can be added or removed locally; duplicates are rejected. The add form always precedes the list, including long lists and keyboard navigation. Removing a repository stops local tracking and never deletes it remotely.
- Developers: show verified repository directory users, explicitly marked workspace-only members and PR-discovered identities. Workspace membership is not repository-access evidence. Each row always exposes its configured repository label and full workspace/slug; identity IDs are not shown in this following list. The header counts unique people while pagination counts person/repository rows. Workspace-only rows explain their missing following action; it is unrelated to whether someone has authored PRs. Verified repository members can be followed without a loaded PR. Search and ten-row pagination apply to the combined view; exclusions remain per stable identity/repository. Legacy global exclusions remain effective until restored.
- PRs: QA can exclude an individual PR in desktop rows or mobile cards. Ignored view supports restoring it and identifies author-level exclusions separately.
- Ignored lists: the PR list is built exclusively from `ignoredPullRequestKeys`, including keys absent from current API results. The developer list is built from explicit global or repository-scoped developer preferences, not from the PR list. Each has independent filtered pagination. Restoring a developer never removes individual PR exclusions; restoring a PR does not remove an author exclusion. Both active causes are explained when they overlap.
- Settings controls: shared switches expose `role=switch`, `aria-checked`, labels, descriptions and disabled/busy states. Space and Enter operate the switch; native radio-card inputs support arrow navigation for perspectives. Search clear restores input focus. Notifications retain explicit user-gesture permission requests and pending protection.
- Loading: real initial hydration, session restoration, connection sync and empty remote data are separate states. Shared `ViewSkeleton` covers summary cards, filters and lists before initial data is available; ignored counts and empty states do not appear prematurely. `TableSkeleton` remains the row primitive. Existing rows remain during refresh. `EmptyState` appears after a completed empty or filtered result. Developer and ignored directories share the same loading and empty primitives. Motion follows `prefers-reduced-motion` and system contrast.
- Authors: multiple stable identities can be selected together; an empty selection means all authors. Developer perspective defaults to the verified user's own PRs and provides an explicit all-authors control.
- Activity: QA and developer perspectives initially select “Requiere atención”; it matches `nextOwner=qa` or `nextOwner=developer` respectively, never merely any pending owner. Observer starts with any activity and its attention view retains the complete dataset allowed by the other filters. “QA dejó comentarios” belongs in the developer's attention list, not QA's. Saved choices survive navigation, reconnect and F5 only for the same account/role. Reset restores the current role's defaults, clears its summary/all-authors scope and transient query, and leaves other roles and ignore preferences intact. Clicking an active summary card toggles it off and restores role-default filters. Local unread novelty remains available in notifications, not as an activity option or summary card.
- Filter panels: one shared portaled disclosure owns opening/closing animation, viewport-bounded positioning, outside-pointer/focus dismissal and Escape. Native radio groups supply single-selection semantics and arrow navigation; Enter confirms and returns focus. Author search is local, accent-insensitive and includes aliases; changing its query preserves selected identities. Clearing search returns focus to its input. Multiple selection does not close the panel. Closing panels become inert immediately while the exit animation finishes.
- Tracking detail: events are unique by comment ID or commit hash, independent of overlapping activity records. Real commit messages and short hashes are shown. Mention IDs resolve through rendered mention metadata or the known user's UUID/Atlassian-account alias; unidentified names are not invented. Remote HTML is never inserted into the application DOM. The raw comment remains intact in the data model.
- Notifications: first successful repository sync creates a baseline. Subsequent syncs detect stable comment IDs and revision timestamps, scoped by PR. Repeated results do not repeat the sound. The bell groups unread events by PR; opening a PR or marking all read clears its local novelty. Sync alone does not mark new events read.
- Alerts: optional system notification permission is requested only by an explicit button; sound is unlocked by an explicit gesture. One aggregated notification and sound per sync. Ignored items do not trigger alerts. These are foreground polling alerts, not server push; browser suspension pauses detection. Source content is persisted only by the account/session-bound snapshot cache, separately from the credential.
- Remote reading: initially read all pages of open PRs and PRs finalized within 30 days. Then use an inventory-bound per-repository checkpoint to query updates across OPEN/MERGED/DECLINED with a two-minute overlap, retaining untouched cached PR and pruning expired closed records. Select only required listing fields and always include `next`. Deduplicate overlapping pages/state queries before detail fetches. A checkpoint advances to the read's start time only after that repository's entire read succeeds; failed reads retain the old cursor/data and never interpret a failed page as an empty inventory. Persist checkpoints atomically with the existing session/account-bound snapshot; legacy or malformed metadata falls back to full reading without discarding valid PR. A 403 removes data and cursor. Changed QA IDs/inventory, missing checkpoints or clock rollback require full reading. The next visible check after an hour since the last full read refreshes inventory and existing details, covering missing PR and unannounced comment/approval changes; such changes can remain stale until reconciliation. Incremental filter 400 falls back to full; auth/network/429 failures do not. No private-data retention extension, new backend or UI redesign. Completed `SyncState.statistics` reports measured calls/listed/refreshed/reused/removed counts per repository. See `docs/DECISIONS.md`, Incremental PR reads.
- Evidence limits: the live reader includes activity, current participants and bounded, coverage-checked revision diffs, as specified above. Unknown history or comparisons remain inconclusive, not evidence of a correction or approval. This replaces the obsolete comment/commit-only limitation. The real stable QA seed is now server-owned; private storage setup, deployment and real-account Bitbucket/PWA acceptance remain requirements. See `docs/AUDIT-2026-10-22.md`.

## Verification

- **Static:** `npm run lint`, `npm run build`.
- **Unit:** `npm test`.
- **Browser/device matrix:** Desktop table and mobile cards; reduced motion and keyboard focus.
- **Required domain coverage:** `src/features/pull-requests/services/qa-state.test.ts`.
