# KontrolPR

Internal Bitbucket Pull Request Monitor. React 19, TypeScript, Vite and Tailwind CSS.

## Run locally

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite. Node is installed at `/home/javier/.nvm/versions/node/v26.7.0/bin` in the original WSL workspace; add that directory to PATH if needed.

## Connect Bitbucket

The app opens on sign-in. Create a token at [Atlassian account security](https://id.atlassian.com/manage-profile/security/api-tokens) using “Crear token de API con alcances”, choose Bitbucket and enable only `read:user:bitbucket`, `read:repository:bitbucket`, `read:pullrequest:bitbucket` and `read:workspace:bitbucket`. The fourth read scope enables workspace member discovery; if an existing token lacks it, reconnect with a token that includes it. Tokens are displayed once; their expiry is 1–365 days (one year by default). Enter your Atlassian email and token in the app, never in source, environment files or this README. Explicitly select QA, Desarrollador or Observador and connect. Navigation, search, notifications and repository configuration unlock only after account verification; there is no anonymous demo. Disconnect returns to sign-in with no account content visible.

The app stores the credential in this browser's localStorage for 12 elapsed hours from sign-in, independently of timezone or daylight-saving changes. F5 and browser restart restore the verified account without extending that deadline. Open tabs expire automatically and check again on focus/visibility; the API client rejects requests past the deadline and in-flight work is aborted when the session closes. An expired credential is discarded on the next startup if the browser was closed. Disconnect removes the saved credential but does not revoke the Atlassian token.

This browser persistence is not an HttpOnly/server session: JavaScript on the same origin can read the saved token. Use a trusted browser/device. The shared-team API verifies the token transiently; it does not move login credentials into server storage. A confidential login integration would be needed to keep credentials out of browser storage. If storage is blocked, the app explicitly warns that the connection lasts only in memory.

Use Configuración → Repositorios to add workspace/slug entries. Desarrolladores reads the Bitbucket directory independently of PR loading: effective repository users when permitted, otherwise workspace members (not proof of repository access). Repository access enumeration requires repository administration. Source labels, scope/network errors and Actualizar personas make fallback explicit; PR participants remain an additional partial source. Names, avatars and aliases are shown, never raw IDs or harvested email addresses. Configure the shared QA team and local per-repository following there. Exclude individual PRs from Resumen and recover them in Ignorados.

In Configuración → Desarrolladores, Javier Mejías alone can add or remove any number of QA through the searchable identity selector. Everyone else sees the same read-only roster. There are no required names or fixed count; Remove offers Undo after a confirmed save. The API verifies the authenticated Bitbucket UUID for every operation; choosing a perspective or changing browser preferences cannot grant editing rights. The canonical list overrides all old local QA selections, including an explicitly empty shared list. `src/config/qa-team.json` is legacy compatibility data, no longer the runtime source. No JSON editing or redeployment is needed when changing the team.

## Shared QA storage: one-time setup

1. In the same Vercel project, create/connect a **private Vercel Blob** store. Review Vercel's storage usage/pricing before creating resources. Its server environment must contain `BLOB_READ_WRITE_TOKEN`; never use a `VITE_` prefix or put a Bitbucket API token in this variable.
2. Deploy the complete project (not only `dist`). Vercel serves `api/qa-team.ts` alongside the frontend. Production and preview environments should use separate stores, so a preview cannot edit the production roster.
3. Sign in normally. With an empty configured store, the API supplies the initial Javier/Diego/Iván roster from `server/initial-qa-team.ts`. The first confirmed edit persists it in `kontrolpr/shared-qa-team-v1.json`. Thereafter, even zero QA is preserved; initial defaults never override saved data. Only changing the sole editor itself remains a server-code/deployment decision.

For local use, copy the server variable from the connected store into ignored `.env.local`, using `.env.example` as a guide, then restart `npm run dev`. Vite development and preview expose the same API handler; no separate local server is required. Do not share a production Blob token with other developers. Without storage configuration the API deliberately returns `503 not_configured` and the app shows recovery guidance rather than claiming local edits were shared.

The API supports authenticated GET and owner-only same-origin PUT with optimistic revision checks. Conflicting tabs receive 409 and cannot silently overwrite each other. Responses are private/no-store and excluded from service-worker caching. Tokens are forwarded only to Bitbucket's fixed `/2.0/user` endpoint to verify identity, never written to Blob or logs. Any authenticated Bitbucket account can read the roster; this is not a workspace-membership ACL, and repository data remains protected by Bitbucket's own access checks. See the [Vercel Blob SDK documentation](https://vercel.com/docs/vercel-blob/using-blob-sdk).

Membership is revalidated at login, F5, manual synchronization, each due automatic synchronization (10 minutes while visible), or “Actualizar equipo QA”. Confirmed changes recalculate review states and invalidate incompatible review evidence. A failed initial roster read blocks PR classification; a background failure retains the last verified list with a warning and does not substitute personal settings. This is polling, not instant cross-browser push.

Review states use remote activity and current approvals with conservative revision/diff comparison. “Nuevos commits · Verificar” means QA should inspect new commits because content evidence is inconclusive, not that a fix has been verified. PR detail stays live across synchronization and offers previous/next within the list that opened it.

Overview filters, summary selection and the developer all-authors switch are remembered separately for each account/perspective. Search text is not saved. “Limpiar” restores that perspective's defaults without changing exclusions or other perspectives. The header shows the real next automatic query in your browser's local time; F5 does not postpone it. Automatic queries require the app to be visible and pause when there are no repositories.

Notifications and sound can be enabled in Avisos. Polling pauses when the browser suspends execution; this application does not provide server push. First sync baselines existing events without notifying. New events remain unread until the PR is opened or explicitly marked read.

The real reader loads open PRs and PRs finalized in the last 30 days. Historical activity, bounded coverage-checked revision diffs and current approvals provide conservative review evidence. Missing history, unsupported or incomplete diffs remain inconclusive; no state proves functional correctness. Test-only fixtures are not included in the runtime bundle and do not replace real-account acceptance testing. See [the quality audit](docs/AUDIT-2026-10-22.md).

PR, comments and commits are cached in IndexedDB for the same verified account/login and repository set, bounded by the original session expiry. After identity verification, F5 restores fresh data without querying PR again. Automatic sync is due ten minutes after the last completed sync; overdue data stays visible during refresh. Manual sync is immediate. Logout/expiry removes the snapshot without deleting preferences. A 403 discards denied repository data. Blocked storage falls back to memory and warns that F5 may require another query. Cache data, like the credential, is readable by same-origin JavaScript; use a trusted browser/device.

### Incremental PR synchronization

The first read builds a complete inventory of open PR and PR finalized within 30 days. Successful reads persist a checkpoint per repository together with the snapshots. Subsequent checks query PR updated since that checkpoint (with a two-minute overlap), including open, merged and declined states. New/changed PR refresh their detail; untouched PR reuse local comments, commits and evidence. Listing responses request only the fields the app needs, explicitly retaining pagination links. Every page is still read and duplicate PR identities are merged before detail work.

A failed repository never advances its checkpoint; another repository can still update. Revoked access removes both data and checkpoint. Missing/incompatible metadata, changed QA identities, lost inventory or a backwards clock force a full read. At the next check after an hour since the last full read, reconciliation refreshes the inventory **and cached details**, detecting missing PR and comment/approval changes that were not reflected in the PR timestamp. Unannounced changes can remain stale until that reconciliation; polling is not a real-time guarantee. A rejected incremental filter falls back to full reading, not an empty successful result.

Fresh F5 restores both data and checkpoints without PR queries; overdue data stays visible during synchronization. This does not extend the existing 12-hour session-bound retention or share data between browsers. The first load in a new session/browser remains heavier. No new backend, dependency or global credential was added for PR caching.

Completed synchronization exposes per-repository counters through `SyncState.statistics`: full/incremental mode, actual API calls, unique summaries listed, detail groups refreshed, cached PR reused and previous PR removed. These are internal diagnostics, not a new UI panel. Deterministic tests with 1,000 unchanged open PR reduce listing from 21 requests to 1; with five changed PR and single-page comments/commits, total calls drop from 31 to 11. These are request counts for the test dataset, not a promise of equivalent real-world load-time improvement.

## Deploy and update the PWA

Deploy this Vite project on Vercel with `npm run build` and output `dist`, retaining the root `api/` function and connected private Blob store described above; the checked-in `vercel.json` supplies the cache headers. Each build generates its own service worker and matching precached HTML/CSS/JS assets. Do not deploy the raw `public/sw.js` template directly.

When a new worker is ready, a persistent “Nueva versión disponible” banner offers “Actualizar ahora”. Activation reloads the open KontrolPR tabs once without clearing the session, preferences or compatible PR cache. Checks run on startup, each visible minute and eligible resume/online events. A failed update can be retried. Offline updates and closed/suspended apps cannot receive an immediate notice; no server push is implied. Test with `npm run build` then `npm run preview`: service workers are deliberately disabled under `npm run dev`. Verify a two-deployment update and installed Android/iOS behavior on the real HTTPS domain before team rollout.

## Verify

```bash
npm run lint
npm test
npm run build
```
