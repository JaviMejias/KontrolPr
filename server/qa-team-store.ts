import { z } from "zod";
import { qaTeamMembersSchema } from "../src/lib/team/contracts";
import { soleQaEditorId } from "./initial-qa-team";

export const storedQaTeamSchema = z.strictObject({
  version: z.literal(1),
  members: qaTeamMembersSchema,
  updatedAt: z.iso.datetime(),
  updatedBy: z.literal(soleQaEditorId),
});

export type StoredQaTeam = z.infer<typeof storedQaTeamSchema>;

export interface QaTeamStore {
  isConfigured(): boolean;
  read(): Promise<{ document: StoredQaTeam; revision: string } | null>;
  write(document: StoredQaTeam, expectedRevision: string): Promise<string>;
}
