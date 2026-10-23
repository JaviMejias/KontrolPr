import { z } from "zod";
import { repositories } from "../../config/repositories";
import { qaBindingSchema } from "../../config/qa-users";
import { initialOverviewForRole } from "../../features/filters/types";
import type { LocalPreferences, OverviewPreferences, UserRole } from "../../types/domain";

export const defaultPreferences: LocalPreferences = {
  role: "qa", ignoredDeveloperIds: [], ignoredPullRequestKeys: [], lastObservedEventIds: [], firstSyncCompleted: false,
  repositories, ignoredRepositoryDeveloperKeys: [], qaAccountIds: [], notificationsEnabled: false, soundEnabled: false,
};

const recordSchema = z.record(z.string(), z.unknown());
const identifier = z.string().min(1).refine((value) => value.trim().length > 0);
const repositorySchema = z.object({ workspace: z.string().regex(/^[a-zA-Z0-9_-]+$/), slug: z.string().regex(/^[a-zA-Z0-9_.-]+$/), name: identifier, label: identifier });
const summarySchema = z.enum(["", "active", "qa", "developer", "updated", "response", "stale"]);
const summariesByRole = { qa: ["", "active", "qa", "updated", "response"], developer: ["", "active", "developer", "updated", "response"], observer: ["", "active", "qa", "developer", "stale"] };

function validItems<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => { const parsed = schema.safeParse(item); return parsed.success ? [parsed.data] : []; });
}

function ids(value: unknown): string[] { return [...new Set(validItems(value, identifier))]; }

function overviewFor(value: unknown, role: UserRole, allowed: ReadonlySet<string>): OverviewPreferences {
  const raw = recordSchema.safeParse(value).data ?? {};
  const filters = recordSchema.safeParse(raw.filters).data ?? {};
  const defaults = initialOverviewForRole(role);
  const repository = typeof filters.repository === "string" && allowed.has(filters.repository) ? filters.repository : "all";
  const summary = summarySchema.catch("").parse(raw.summary);
  return {
    filters: { repository, authors: ids(filters.authors), activity: z.enum(["all", "attention", "stale"]).catch(defaults.filters.activity).parse(filters.activity), status: z.enum(["active", "all", "inactive"]).catch("active").parse(filters.status) },
    allAuthors: role === "developer" && z.boolean().catch(false).parse(raw.allAuthors),
    summary: summariesByRole[role].includes(summary) ? summary : "",
  };
}

export function normalizePreferences(value: unknown): LocalPreferences {
  const raw = recordSchema.safeParse(value).data ?? {};
  const configured = validItems(Array.isArray(raw.repositories) ? raw.repositories : repositories, repositorySchema);
  const uniqueRepositories = [...new Map(configured.map((repo) => [`${repo.workspace}/${repo.slug}`.toLowerCase(), repo])).values()];
  const allowed = new Set(uniqueRepositories.map((repo) => `${repo.workspace}/${repo.slug}`));
  const storedViews = recordSchema.safeParse(raw.overviewByRole).data ?? {};
  const overviewByRole: LocalPreferences["overviewByRole"] = {};
  for (const role of ["qa", "developer", "observer"] as const) if (storedViews[role] !== undefined) overviewByRole[role] = overviewFor(storedViews[role], role, allowed);
  const storedQa = recordSchema.safeParse(raw.qaTeamBindings).data ?? {};
  const qaTeamBindings: NonNullable<LocalPreferences["qaTeamBindings"]> = {};
  for (const slot of Object.keys(storedQa)) {
    const person = qaBindingSchema.safeParse(storedQa[slot]);
    if (person.success) qaTeamBindings[slot] = person.data;
  }
  return {
    role: z.enum(["qa", "developer", "observer"]).catch(defaultPreferences.role).parse(raw.role),
    repositories: uniqueRepositories, ignoredDeveloperIds: ids(raw.ignoredDeveloperIds), ignoredPullRequestKeys: ids(raw.ignoredPullRequestKeys),
    ignoredRepositoryDeveloperKeys: ids(raw.ignoredRepositoryDeveloperKeys), qaAccountIds: ids(raw.qaAccountIds), lastObservedEventIds: ids(raw.lastObservedEventIds),
    firstSyncCompleted: z.boolean().catch(false).parse(raw.firstSyncCompleted), notificationsEnabled: z.boolean().catch(false).parse(raw.notificationsEnabled), soundEnabled: z.boolean().catch(false).parse(raw.soundEnabled),
    ...(Object.keys(qaTeamBindings).length ? { qaTeamBindings } : {}), ...(Object.keys(overviewByRole).length ? { overviewByRole } : {}),
    ...(Array.isArray(raw.qaTeamMembers) ? { qaTeamMembers: [...new Map(validItems(raw.qaTeamMembers, qaBindingSchema).map((person) => [person.accountId, person])).values()] } : {}),
  };
}

export function readStoredPreferences(value: unknown): LocalPreferences {
  const raw = recordSchema.safeParse(value).data;
  if (raw?.version === 1) return normalizePreferences(raw.preferences);
  if (raw?.version !== undefined) return normalizePreferences(undefined);
  return normalizePreferences(value);
}
