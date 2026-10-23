export type UserRole = "developer" | "qa" | "observer";

export interface PullRequestFilters {
  repository: string;
  authors: string[];
  activity: "all" | "attention" | "stale";
  status: "active" | "all" | "inactive";
}

export type SummaryFilter = "" | "active" | "qa" | "developer" | "updated" | "response" | "stale";

export interface OverviewPreferences {
  filters: PullRequestFilters;
  allAuthors: boolean;
  summary: SummaryFilter;
}

export type BitbucketState = "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED" | "UNKNOWN";

export type FlowState =
  | "NEW"
  | "QA_FEEDBACK"
  | "AUTHOR_RESPONDED"
  | "UPDATED"
  | "COMMITS_PENDING"
  | "QA_APPROVED"
  | "INACTIVE";

export type ActivityKind =
  | "pull_request_created"
  | "metadata_updated"
  | "commit_added"
  | "comment_added"
  | "approval_added"
  | "change_requested";

export interface Person {
  accountId: string;
  displayName: string;
  nickname?: string;
  uuid?: string;
  atlassianAccountId?: string;
}

export interface RepositoryConfig {
  workspace: string;
  slug: string;
  name: string;
  label: string;
}

export interface Commit {
  hash: string;
  message: string;
  author: Person;
  authoredAt: string;
  committedAt: string;
  parents: string[];
  effectiveDiffFingerprint: string;
  changedFiles: number;
}

export interface RepositoryDirectory {
  repository: RepositoryConfig;
  source: "repository" | "workspace" | "unavailable";
  people: Person[];
  message?: string;
}

export interface PullRequestComment {
  id: number;
  author: Person;
  createdAt: string;
  updatedAt?: string;
  content: string;
  mentions?: Record<string, string>;
  parentId?: number;
  inline: boolean;
  resolved?: boolean;
  link: string;
}

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  actor: Person;
  createdAt: string;
  commentId?: number;
  commitHash?: string;
  content?: string;
  link: string;
  sourceHash?: string;
  destinationHash?: string;
  approvalActive?: boolean;
}

export interface ReviewRevision {
  sourceHash: string;
  destinationHash: string;
  at: string;
  fingerprint?: string;
  contentFingerprint?: string;
  changedFiles?: number;
}

export interface ReviewEvidence {
  version: 1 | 2;
  qaSignature: string;
  historyComplete: boolean;
  revisions: ReviewRevision[];
}

export interface PullRequestSnapshot {
  key: string;
  repository: RepositoryConfig;
  id: number;
  title: string;
  description: string;
  author: Person;
  sourceBranch: string;
  destinationBranch: string;
  state: BitbucketState;
  draft: boolean;
  queued: boolean;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  rawState: string;
  participants?: Person[];
  comments: PullRequestComment[];
  commits: Commit[];
  activity: ActivityEvent[];
  diffFingerprint: string;
  reviewedDiffFingerprint?: string;
  reviewEvidenceLimited?: boolean;
  diffFileCount?: number;
  sourceHash?: string;
  destinationHash?: string;
  reviewEvidence?: ReviewEvidence;
}

export interface PullRequestViewModel extends PullRequestSnapshot {
  flowState: FlowState;
  flowLabel: string;
  flowDescription: string;
  nextOwner: "qa" | "developer" | "none";
  lastRelevantActivityAt: string;
  lastRelevantActor?: Person;
  qaActors: Person[];
  newEventCount: number;
  hasEffectiveCodeChange: boolean;
  stale: boolean;
}

export interface LocalPreferences {
  role: UserRole;
  ignoredDeveloperIds: string[];
  ignoredPullRequestKeys: string[];
  lastObservedEventIds: string[];
  firstSyncCompleted: boolean;
  repositories: RepositoryConfig[];
  ignoredRepositoryDeveloperKeys: string[];
  qaAccountIds: string[];
  qaTeamBindings?: Record<string, Person>;
  qaTeamMembers?: Person[];
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  overviewByRole?: Partial<Record<UserRole, OverviewPreferences>>;
}

export interface RepositorySyncStatistics {
  mode: "full" | "incremental";
  requests: number;
  listed: number;
  refreshed: number;
  reused: number;
  removed: number;
}

export interface SyncState {
  status: "idle" | "syncing" | "success" | "error";
  lastSyncedAt?: string;
  nextSyncAt?: string;
  errorCode?: "unauthorized" | "forbidden" | "rate_limited" | "network" | "unknown";
  message?: string;
  source?: "cache";
  statistics?: Record<string, RepositorySyncStatistics>;
  progress?: SyncProgress;
}

export interface SyncProgress {
  startedAt: number;
  repositoriesTotal: number;
  repositoriesCompleted: number;
  pagesRead: number;
  pullRequestsCompleted: number;
  pullRequestsTotal?: number;
}

export interface DemoDataset {
  pullRequests: PullRequestSnapshot[];
  currentUser: Person;
}
