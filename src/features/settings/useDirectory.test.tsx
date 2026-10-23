import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDirectory } from "./useDirectory";
import type { RepositoryDirectory } from "../../types/domain";
import { repositories } from "../../config/repositories";

afterEach(cleanup);
const entries: RepositoryDirectory[] = [{ repository: repositories[0], source: "repository", people: [{ accountId: "qa-a", displayName: "QA A" }] }];

it("keeps the previous directory during refresh and clears it on permission denial", async () => {
  const load = vi.fn().mockResolvedValueOnce(entries).mockResolvedValueOnce([{ ...entries[0], source: "unavailable", people: [], message: "Forbidden" }]);
  const { result } = renderHook(() => useDirectory(load, "one"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.entries).toEqual(entries);
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.entries[0].source).toBe("unavailable"));
  expect(result.current.entries[0].people).toEqual([]);
});

it("aborts replaced scopes and ignores late responses even if the transport ignores cancellation", async () => {
  let finish!: (value: RepositoryDirectory[]) => void;
  const load = vi.fn().mockImplementationOnce(() => new Promise<RepositoryDirectory[]>((resolve) => { finish = resolve; })).mockResolvedValueOnce([]);
  const { result, rerender, unmount } = renderHook(({ scope }) => useDirectory(load, scope), { initialProps: { scope: "first" } });
  const signal = load.mock.calls[0][0] as AbortSignal;
  rerender({ scope: "second" });
  expect(signal.aborted).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => finish(entries));
  expect(result.current.entries).toEqual([]);
  unmount();
  expect((load.mock.calls[1][0] as AbortSignal).aborted).toBe(true);
});

it("recovers from failure by explicit retry and never reads before a loader is available", async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(entries);
  const { result, rerender } = renderHook(({ enabled }) => useDirectory(enabled ? load : undefined, "one"), { initialProps: { enabled: false } });
  expect(load).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.error).toContain("conexión"));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.entries).toEqual(entries));
});
