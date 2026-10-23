import { z } from "zod";
import publishedTeam from "./qa-team.json";
import type { LocalPreferences, Person } from "../types/domain";

export const qaBindingSchema = z.object({ accountId: z.string().min(1), displayName: z.string(), nickname: z.string().optional(), uuid: z.string().optional(), atlassianAccountId: z.string().optional() });
export const qaTeam = z.array(qaBindingSchema).parse(publishedTeam);

export function qaBindings(preferences: LocalPreferences): Record<string, Person> {
  return Object.fromEntries(Object.entries(preferences.qaTeamBindings ?? {}).flatMap(([slot, value]) => {
    const person = qaBindingSchema.safeParse(value);
    return person.success ? [[slot, person.data]] : [];
  }));
}

export function resolvedQaTeam(preferences: LocalPreferences): Person[] {
  if (preferences.qaTeamMembers !== undefined) return preferences.qaTeamMembers;
  if (qaTeam.length) return qaTeam;
  const bound = Object.values(qaBindings(preferences));
  const known = new Set(bound.flatMap((person) => [person.accountId, person.uuid, person.atlassianAccountId]));
  const legacy = Array.isArray(preferences.qaAccountIds) ? preferences.qaAccountIds.filter((id) => typeof id === "string" && id && !known.has(id)).map((accountId) => ({ accountId, displayName: "Cuenta QA guardada" })) : [];
  return [...new Map([...bound, ...legacy].map((person) => [person.accountId, person])).values()];
}

export function effectiveQaIds(preferences: LocalPreferences): string[] {
  return [...new Set(resolvedQaTeam(preferences).flatMap((person) => [person.accountId, person.uuid, person.atlassianAccountId].filter((id): id is string => Boolean(id))))].sort();
}
