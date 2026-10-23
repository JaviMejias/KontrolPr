import { describe, expect, it } from "vitest";
import { demoDataset } from "./fixtures";
import { pullRequestTimeline } from "./timeline";

describe("PR detail timeline", () => {
  it("shows real commit messages once even when activity and commit lists overlap", () => {
    const pr = demoDataset.pullRequests[0];
    const events = pullRequestTimeline({ ...pr, activity: [...pr.activity, ...pr.activity], commits: [...pr.commits, ...pr.commits], comments: [...pr.comments, ...pr.comments] });
    expect(events.filter((event) => event.kind === "commit_added")).toHaveLength(1);
    expect(events.find((event) => event.kind === "commit_added")).toMatchObject({ content: "Add bounded retry policy", commitHash: "184a" });
    expect(events.filter((event) => event.kind === "comment_added")).toHaveLength(1);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });
  it("does not mislabel metadata or change requests as PR creation", () => {
    const pr = demoDataset.pullRequests[0];
    const events = pullRequestTimeline({ ...pr, commits: [], comments: [], activity: [{ id: "update", kind: "metadata_updated", actor: pr.author, createdAt: pr.createdAt, link: "#" }, { id: "request", kind: "change_requested", actor: pr.author, createdAt: pr.updatedAt, link: "#" }] });
    expect(events.map((event) => event.title)).toEqual(["Solicitó cambios", "Actualizó los datos del PR"]);
  });
});
