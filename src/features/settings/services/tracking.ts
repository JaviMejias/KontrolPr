import type { LocalPreferences, Person, PullRequestSnapshot, RepositoryConfig } from "../../../types/domain";

export function repositoryKey(repository: RepositoryConfig): string {
  return `${repository.workspace}/${repository.slug}`;
}

export function developerKey(repository: RepositoryConfig, accountId: string): string {
  return `${repositoryKey(repository)}:${accountId}`;
}

export function isIgnored(pullRequest: PullRequestSnapshot, preferences: LocalPreferences): boolean {
  return preferences.ignoredPullRequestKeys.includes(pullRequest.key)
    || preferences.ignoredDeveloperIds.includes(pullRequest.author.accountId)
    || preferences.ignoredRepositoryDeveloperKeys.includes(developerKey(pullRequest.repository, pullRequest.author.accountId));
}

export function discoverDevelopers(pullRequests: PullRequestSnapshot[]): { person: Person; repository: RepositoryConfig }[] {
  const people = new Map<string, { person: Person; repository: RepositoryConfig }>();
  for (const pullRequest of pullRequests) {
    const participants = [pullRequest.author, ...(pullRequest.participants ?? []), ...pullRequest.comments.map((comment) => comment.author), ...pullRequest.commits.map((commit) => commit.author), ...pullRequest.activity.map((event) => event.actor)];
    for (const person of participants) {
      if (!person.accountId) continue;
      people.set(developerKey(pullRequest.repository, person.accountId), { person, repository: pullRequest.repository });
    }
  }
  return [...people.values()].sort((a, b) => a.person.displayName.localeCompare(b.person.displayName, "es"));
}
