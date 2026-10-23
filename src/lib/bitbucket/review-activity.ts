import { z } from "zod";
import type { ActivityEvent, PullRequestSnapshot } from "../../types/domain";
import { normalizePerson } from "./normalizers";

const identity = z.object({ uuid: z.string(), display_name: z.string(), account_id: z.string().optional(), nickname: z.string().optional() });
const revision = z.object({ commit: z.object({ hash: z.string() }).optional() });
export const reviewActivitySchema = z.object({
  update: z.object({ date: z.iso.datetime({ offset: true }), author: identity.optional(), source: revision.optional(), destination: revision.optional() }).optional(),
  approval: z.object({ date: z.iso.datetime({ offset: true }), user: identity }).optional(),
});
export const participantSchema = z.object({ user: identity, approved: z.boolean().optional() });

export function normalizeReviewActivity(raw: z.infer<typeof reviewActivitySchema>[], pr: PullRequestSnapshot, participants: z.infer<typeof participantSchema>[]): ActivityEvent[] {
  const approved = new Set(participants.filter((item) => item.approved).map((item) => item.user.uuid));
  const events = raw.flatMap((item): ActivityEvent[] => {
    if (item.update) return [{ id: `update:${item.update.date}:${item.update.source?.commit?.hash ?? "metadata"}:${item.update.destination?.commit?.hash ?? "unknown"}`, kind: "metadata_updated", actor: item.update.author ? normalizePerson(item.update.author) : pr.author, createdAt: item.update.date, sourceHash: item.update.source?.commit?.hash, destinationHash: item.update.destination?.commit?.hash, link: pr.htmlUrl }];
    if (item.approval) return [{ id: `approval:${item.approval.user.uuid}:${item.approval.date}`, kind: "approval_added", actor: normalizePerson(item.approval.user), createdAt: item.approval.date, approvalActive: approved.has(item.approval.user.uuid), link: pr.htmlUrl }];
    return [];
  });
  return [...new Map(events.map((event) => [event.id, event])).values()];
}
