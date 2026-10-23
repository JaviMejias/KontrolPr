import type { BitbucketState, FlowState } from "../../types/domain";

const flowTone: Record<FlowState, string> = { NEW: "status-warning", QA_FEEDBACK: "status-coral", AUTHOR_RESPONDED: "status-blue", UPDATED: "status-signal", COMMITS_PENDING: "status-warning", QA_APPROVED: "status-approved", INACTIVE: "status-muted" };
const rawLabels: Record<BitbucketState, string> = { OPEN: "Open", MERGED: "Merged", DECLINED: "Declined", SUPERSEDED: "Superseded", UNKNOWN: "Desconocido" };

export function FlowBadge({ state, label }: { state: FlowState; label: string }) {
  return <span className={`status-badge ${flowTone[state]}`}><span className="status-dot" />{label}</span>;
}

export function BitbucketBadge({ state, draft, queued }: { state: BitbucketState; draft: boolean; queued: boolean }) {
  const label = draft ? "Draft" : queued ? "Queued to merge" : rawLabels[state];
  return <span className="raw-badge"><span className="raw-mark" />{label}</span>;
}
