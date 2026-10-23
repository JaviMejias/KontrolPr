import { z } from "zod";

const uuidPattern = /^(?:\{[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
const canonicalUuid = (value: string) => `{${value.replace(/[{}]/g, "").toLowerCase()}}`;
const uuidSchema = z.string().trim().regex(uuidPattern).transform(canonicalUuid);
const labelSchema = z.string().trim().min(1).max(200).refine((value) => [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127));
const aliasSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9:{}_-]+$/).transform((value) => uuidPattern.test(value) ? canonicalUuid(value) : value);
const personSchema = z.strictObject({
  accountId: uuidSchema,
  displayName: labelSchema,
  nickname: labelSchema.optional(),
  uuid: uuidSchema.optional(),
  atlassianAccountId: aliasSchema.optional(),
}).superRefine((person, context) => {
  if (person.uuid && person.uuid !== person.accountId) context.addIssue({ code: "custom", path: ["uuid"], message: "El UUID debe coincidir con la cuenta de Bitbucket." });
});

export const qaTeamMembersSchema = z.array(personSchema).superRefine((members, context) => {
  const identities = new Set<string>();
  members.forEach((person, index) => {
    const aliases = new Set([person.accountId, person.uuid, person.atlassianAccountId].filter((value): value is string => Boolean(value)));
    for (const alias of aliases) {
      if (identities.has(alias)) context.addIssue({ code: "custom", path: [index, "accountId"], message: "Hay cuentas o alias QA duplicados." });
      identities.add(alias);
    }
  });
});

export const sharedQaTeamSchema = z.strictObject({
  members: qaTeamMembersSchema,
  revision: z.string().min(1).max(256).regex(/^[\x21-\x7e]+$/),
  updatedAt: z.iso.datetime().nullable(),
  canEdit: z.boolean(),
});

export type SharedQaTeam = z.infer<typeof sharedQaTeamSchema>;
