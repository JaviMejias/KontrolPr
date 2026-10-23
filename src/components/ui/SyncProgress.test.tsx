import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SyncProgress } from "./SyncProgress";

afterEach(cleanup);
const progress = { startedAt: Date.now(), repositoriesTotal: 2, repositoriesCompleted: 0, pagesRead: 3, pullRequestsCompleted: 4 };
describe("measured synchronization progress", () => {
  it("does not invent a total while discovering pages", () => {
    render(<SyncProgress progress={progress} />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
    expect(screen.getByText("4 PR procesados")).toBeVisible();
  });
  it("uses the actual completed/total counts once listing completes", () => {
    render(<SyncProgress progress={{ ...progress, pullRequestsTotal: 12 }} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "4");
    expect(screen.getByRole("progressbar")).toHaveAttribute("max", "12");
    expect(screen.getByText("4/12 PR procesados")).toBeVisible();
  });
});
