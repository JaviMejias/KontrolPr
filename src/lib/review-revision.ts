import type { Person, PullRequestSnapshot, ReviewRevision } from "../types/domain";

export function personMatches(person: Person, ids: ReadonlySet<string>): boolean {
  return [person.accountId, person.uuid, person.atlassianAccountId].some((id) => Boolean(id && ids.has(id)));
}

export function qaSignature(ids: string[]): string { return [...new Set(ids)].sort().join("|"); }

export function revisionAt(pr: PullRequestSnapshot, at: string): ReviewRevision | undefined {
  if (pr.reviewEvidence?.version !== 2 || !pr.reviewEvidence.historyComplete) return;
  const time = Date.parse(at);
  const revisions = pr.reviewEvidence.revisions.filter((revision) => Date.parse(revision.at) <= time).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const latest = revisions[0];
  if (latest && revisions.some((revision) => Date.parse(revision.at) === Date.parse(latest.at) && (revision.sourceHash !== latest.sourceHash || revision.destinationHash !== latest.destinationHash))) return;
  return latest;
}

export function compareRevision(pr: PullRequestSnapshot, referenceAt: string): "changed" | "unchanged" | "unknown" {
  const reference = revisionAt(pr, referenceAt);
  if (!reference || !pr.sourceHash || !pr.destinationHash) return "unknown";
  if (reference.sourceHash === pr.sourceHash && reference.destinationHash === pr.destinationHash) return "unchanged";
  const current = pr.reviewEvidence?.revisions.find((revision) => revision.sourceHash === pr.sourceHash && revision.destinationHash === pr.destinationHash && revision.fingerprint);
  if (!reference.fingerprint || !current?.fingerprint) return "unknown";
  if (reference.fingerprint === current.fingerprint) return "unchanged";
  // Identical edits at different hunk positions need human verification, not an equivalence claim.
  if (reference.contentFingerprint === current.contentFingerprint) return "unknown";
  return "changed";
}
