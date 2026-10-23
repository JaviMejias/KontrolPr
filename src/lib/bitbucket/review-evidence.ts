import type { ActivityEvent, PullRequestSnapshot, ReviewRevision } from "../../types/domain";
import type { BitbucketApiClient } from "./contracts";
import { BitbucketApiError } from "./contracts";
import { personMatches, qaSignature, revisionAt } from "../review-revision";
import { z } from "zod";
import { readAllPages } from "./pagination";

const fileSchema = z.object({ path: z.string() }).nullable().optional();
const diffstatSchema = z.object({ lines_added: z.number().int().nonnegative(), lines_removed: z.number().int().nonnegative(), old: fileSchema, new: fileSchema }).refine((file) => Boolean(file.old?.path || file.new?.path));

export async function fingerprintPatch(patch: string): Promise<{ fingerprint: string; contentFingerprint: string; changedFiles: number; linesAdded: number; linesRemoved: number } | undefined> {
  if (!globalThis.crypto?.subtle || patch.includes("\0") || /GIT binary patch|Binary files |diff --cc /.test(patch)) return;
  if (patch && (!patch.startsWith("diff --git ") || !patch.endsWith("\n"))) return;
  const chunks = patch.split(/(?=^diff --git )/m).filter(Boolean);
  let linesAdded = 0, linesRemoved = 0;
  // A 200 response can still be a truncated diff. Check every hunk before hashing it.
  for (const chunk of chunks) {
    let remaining: { old: number; next: number } | undefined;
    let hasChange = false;
    for (const line of chunk.split("\n").slice(0, -1)) {
      if (remaining) {
        if (line === "\\ No newline at end of file") continue;
        if (remaining.old || remaining.next) {
          if (line[0] === "-") { remaining.old -= 1; linesRemoved += 1; }
          else if (line[0] === "+") { remaining.next -= 1; linesAdded += 1; }
          else if (line[0] === " ") { remaining.old -= 1; remaining.next -= 1; }
          else return;
          if (remaining.old < 0 || remaining.next < 0) return;
          continue;
        }
        remaining = undefined;
      }
      const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?: .*)?$/.exec(line);
      if (hunk) { remaining = { old: Number(hunk[1] ?? 1), next: Number(hunk[2] ?? 1) }; hasChange = true; }
      else if (/^(?:old mode |new mode |deleted file mode |new file mode |rename from |rename to |copy from |copy to )/.test(line)) hasChange = true;
      else if (!/^(?:diff --git |index [\da-f]+\.\.[\da-f]+(?: \d+)?$|--- |\+\+\+ |similarity index \d+%$|dissimilarity index \d+%$)/.test(line)) return;
    }
    if (!hasChange || (remaining && (remaining.old || remaining.next))) return;
  }
  const files = chunks.map((file) => file.split("\n").filter((line) => !/^index [\da-f]+\.\.[\da-f]+(?: \d+)?$/.test(line)).join("\n")).sort();
  const full = files.join("\n");
  const content = files.map((file) => file.split("\n").filter((line) => !line.startsWith("@@")).join("\n")).join("\n");
  const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { fingerprint: await digest(full), contentFingerprint: await digest(content), changedFiles: files.length, linesAdded, linesRemoved };
}

export async function enrichReviewEvidence(client: BitbucketApiClient, pr: PullRequestSnapshot, events: ActivityEvent[], ids: string[], previous?: PullRequestSnapshot, onPage?: () => void): Promise<void> {
  if (!pr.sourceHash || !pr.destinationHash) return;
  const revisions: ReviewRevision[] = events.filter((event) => event.kind === "metadata_updated" && event.sourceHash && event.destinationHash).map((event) => ({ sourceHash: event.sourceHash!, destinationHash: event.destinationHash!, at: event.createdAt }));
  const latest = [...revisions].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const updates = events.filter((event) => event.kind === "metadata_updated");
  pr.reviewEvidence = { version: 2, qaSignature: qaSignature(ids), historyComplete: Boolean(latest && updates.every((event) => event.sourceHash && event.destinationHash) && latest.sourceHash === pr.sourceHash && latest.destinationHash === pr.destinationHash), revisions };
  const qaIds = new Set(ids);
  const feedback = pr.comments.filter((comment) => comment.author.accountId !== pr.author.accountId && personMatches(comment.author, qaIds)).sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt))[0];
  const approval = events.filter((event) => event.kind === "approval_added" && event.approvalActive && event.actor.accountId !== pr.author.accountId && personMatches(event.actor, qaIds)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const needed = [feedback && revisionAt(pr, feedback.updatedAt ?? feedback.createdAt), approval && revisionAt(pr, approval.createdAt)].filter((value): value is ReviewRevision => Boolean(value));
  const current: ReviewRevision = { sourceHash: pr.sourceHash, destinationHash: pr.destinationHash, at: new Date().toISOString() };
  revisions.push(current);
  if (!needed.some((revision) => revision.sourceHash !== current.sourceHash || revision.destinationHash !== current.destinationHash)) return;
  const pairs = new Map([current, ...needed].map((revision) => [`${revision.sourceHash}:${revision.destinationHash}`, revision]));
  for (const revision of pairs.values()) {
    const cached = previous?.reviewEvidence?.version === 2 ? previous.reviewEvidence.revisions.find((item) => item.sourceHash === revision.sourceHash && item.destinationHash === revision.destinationHash && item.fingerprint) : undefined;
    let fingerprint = cached && { fingerprint: cached.fingerprint!, contentFingerprint: cached.contentFingerprint!, changedFiles: cached.changedFiles ?? 0 };
    if (!fingerprint && client.getText && /^[\da-f]{12,64}$/i.test(revision.sourceHash) && /^[\da-f]{12,64}$/i.test(revision.destinationHash)) {
      try {
        const base = `/repositories/${encodeURIComponent(pr.repository.workspace)}/${encodeURIComponent(pr.repository.slug)}`;
        const spec = `${revision.sourceHash}..${revision.destinationHash}`;
        const patch = await fingerprintPatch(await client.getText(`${base}/diff/${spec}?topic=true&context=0&binary=true`));
        if (patch) {
          const stats = await readAllPages(client, `${base}/diffstat/${spec}?topic=true&pagelen=100`, diffstatSchema, onPage);
          const added = stats.reduce((sum, file) => sum + file.lines_added, 0);
          const removed = stats.reduce((sum, file) => sum + file.lines_removed, 0);
          const paths = new Set(stats.map((file) => `${file.old?.path ?? ""}\0${file.new?.path ?? ""}`));
          if (paths.size === stats.length && stats.length === patch.changedFiles && added === patch.linesAdded && removed === patch.linesRemoved) fingerprint = patch;
        }
      } catch (error) { if (error instanceof BitbucketApiError && (error.code === "unauthorized" || error.code === "forbidden")) throw error; }
    }
    if (fingerprint) for (const item of revisions) if (item.sourceHash === revision.sourceHash && item.destinationHash === revision.destinationHash) Object.assign(item, fingerprint);
  }
  if (current.fingerprint) { pr.diffFingerprint = current.fingerprint; pr.diffFileCount = current.changedFiles; }
}
