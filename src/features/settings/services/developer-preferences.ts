import type { LocalPreferences, PullRequestSnapshot, RepositoryConfig } from "../../../types/domain";
import { developerKey, discoverDevelopers, repositoryKey } from "./tracking";

export function setDeveloperFollowing(preferences: LocalPreferences, repository: RepositoryConfig, accountId: string, following: boolean): Partial<LocalPreferences> {
  const key = developerKey(repository, accountId);
  const inherited = preferences.ignoredDeveloperIds.includes(accountId)
    ? preferences.repositories.filter((repo) => repositoryKey(repo) !== repositoryKey(repository)).map((repo) => developerKey(repo, accountId))
    : [];
  return {
    ignoredDeveloperIds: preferences.ignoredDeveloperIds.filter((id) => id !== accountId),
    ignoredRepositoryDeveloperKeys: following
      ? [...new Set([...preferences.ignoredRepositoryDeveloperKeys.filter((id) => id !== key), ...inherited])]
      : [...new Set([...preferences.ignoredRepositoryDeveloperKeys, key, ...inherited])],
  };
}

export function ignoredDevelopers(preferences: LocalPreferences, pullRequests: PullRequestSnapshot[]) {
  const directory = discoverDevelopers(pullRequests);
  const knownPeople = new Map(directory.map((entry) => [entry.person.accountId, entry.person]));
  const global = preferences.ignoredDeveloperIds.map((accountId) => ({
    key: `global:${accountId}`,
    person: knownPeople.get(accountId) ?? { accountId, displayName: "Desarrollador sin datos actuales" },
    scope: "Todos los repositorios",
    preferenceKey: accountId,
    global: true,
  }));
  const scoped = preferences.ignoredRepositoryDeveloperKeys.map((key) => {
    const separator = key.indexOf(":");
    const accountId = key.slice(separator + 1);
    const repoKey = key.slice(0, separator);
    return {
      key,
      person: knownPeople.get(accountId) ?? { accountId, displayName: "Desarrollador sin datos actuales" },
      scope: repoKey,
      preferenceKey: key,
      global: false,
    };
  });
  return [...global, ...scoped];
}
