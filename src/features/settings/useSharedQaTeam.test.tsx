import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSharedQaTeam } from "./useSharedQaTeam";
import { QaTeamError } from "../../lib/team/api-client";
import type { SharedQaTeam } from "../../lib/team/contracts";
import { initialQaTeam } from "../../../server/initial-qa-team";

afterEach(cleanup);
const snapshot: SharedQaTeam = { members: initialQaTeam, revision: "one", canEdit: true, updatedAt: null };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function setup() { const client = { read: vi.fn().mockResolvedValue(snapshot), save: vi.fn().mockResolvedValue({ ...snapshot, members: [], revision: "two" }) }; return { ...renderHook(useSharedQaTeam), client }; }
it("loads canonical members, confirms writes and supports zero QA without optimistic false success", async () => {
  const { result, client } = setup();
  await act(async () => { await result.current.open(client); });
  const pending = deferred<SharedQaTeam>(); client.save.mockReturnValue(pending.promise);
  let saved!: Promise<boolean>;
  act(() => { saved = result.current.save([]); });
  expect(result.current.state.status).toBe("saving");
  expect(result.current.state.snapshot?.members).toEqual(initialQaTeam);
  await act(async () => { pending.resolve({ ...snapshot, members: [], revision: "two" }); await saved; });
  expect(result.current.state.snapshot?.members).toEqual([]);
  expect(client.save).toHaveBeenCalledWith([], "one");
});
it("does not grant edit permission to a reader and deduplicates overlapping reads", async () => {
  const { result, client } = setup();
  client.read.mockResolvedValue({ ...snapshot, canEdit: false });
  await act(async () => { await result.current.open(client); });
  await act(async () => { expect(await result.current.save([])).toBe(false); await Promise.all([result.current.refresh(), result.current.refresh()]); });
  expect(client.save).not.toHaveBeenCalled(); expect(client.read).toHaveBeenCalledTimes(2);
});
it("keeps verified members during failed refresh and exposes honest recovery", async () => {
  const { result, client } = setup();
  await act(async () => { await result.current.open(client); });
  client.read.mockRejectedValue(new QaTeamError("unavailable", "Sin conexión"));
  await act(async () => { expect(await result.current.refresh()).toBeUndefined(); });
  expect(result.current.state).toMatchObject({ status: "error", snapshot, message: "Sin conexión" });
});
it("reconciles a 409 without overwriting another tab and deduplicates writes", async () => {
  const { result, client } = setup();
  await act(async () => { await result.current.open(client); });
  client.save.mockRejectedValue(new QaTeamError("conflict", "Actualiza"));
  client.read.mockResolvedValue({ ...snapshot, members: [], revision: "remote" });
  await act(async () => { await Promise.all([result.current.save([]), result.current.save([])]); });
  expect(client.save).toHaveBeenCalledTimes(1);
  expect(result.current.state).toMatchObject({ status: "error", errorCode: "conflict", snapshot: { revision: "remote", members: [] } });
});
it("clears state on close and ignores a late reply from the previous account", async () => {
  const { result, client } = setup();
  const pending = deferred<SharedQaTeam>(); client.read.mockReturnValue(pending.promise);
  let opened!: Promise<SharedQaTeam | undefined>;
  act(() => { opened = result.current.open(client); });
  act(() => result.current.close());
  await act(async () => { pending.resolve(snapshot); await opened; });
  expect(result.current.state).toEqual({ status: "idle" }); expect(result.current.current()).toBeUndefined();
});
it("does not show another account's edit capability while opening a new client", async () => {
  const { result, client } = setup();
  await act(async () => { await result.current.open(client); });
  const pending = deferred<SharedQaTeam>();
  act(() => { void result.current.open({ read: () => pending.promise, save: client.save }); });
  expect(result.current.state.snapshot).toBeUndefined();
  await act(async () => { pending.resolve({ ...snapshot, canEdit: false }); });
  expect(result.current.state.snapshot?.canEdit).toBe(false);
});
it("ends the session on rejected identity and revokes UI edit capability on forbidden", async () => {
  const { result, client } = setup(); const expired = vi.fn();
  await act(async () => { await result.current.open(client, expired); });
  client.save.mockRejectedValue(new QaTeamError("forbidden", "No autorizado"));
  await act(async () => { await result.current.save([]); });
  expect(result.current.state.snapshot?.canEdit).toBe(false);
  client.read.mockRejectedValue(new QaTeamError("unauthorized", "Sesión vencida"));
  await act(async () => { await result.current.refresh(); });
  expect(expired).toHaveBeenCalledTimes(1);
});

it("rejects late mutation success after unmount and handles expiry during conflict reconciliation", async () => {
  const test = setup();
  await act(async () => { await test.result.current.open(test.client); });
  const pending = deferred<SharedQaTeam>(); test.client.save.mockReturnValue(pending.promise);
  let saved!: Promise<boolean>;
  act(() => { saved = test.result.current.save([]); });
  test.unmount(); pending.resolve({ ...snapshot, members: [] });
  expect(await saved).toBe(false);
  const next = setup(); const expired = vi.fn();
  await act(async () => { await next.result.current.open(next.client, expired); });
  next.client.save.mockRejectedValue(new QaTeamError("conflict", "Conflicto"));
  next.client.read.mockRejectedValue(new QaTeamError("unauthorized", "Sesión inválida"));
  await act(async () => { await next.result.current.save([]); });
  expect(expired).toHaveBeenCalledOnce();
});

it("revalidates after an overlapping write instead of returning a potentially unconfirmed roster", async () => {
  const { result, client } = setup();
  await act(async () => { await result.current.open(client); });
  const pending = deferred<SharedQaTeam>(); client.save.mockReturnValue(pending.promise);
  let saved!: Promise<boolean>, refreshed!: Promise<SharedQaTeam | undefined>;
  act(() => { saved = result.current.save([]); refreshed = result.current.refresh(); });
  client.read.mockResolvedValue({ ...snapshot, members: [], revision: "remote-confirmed" });
  await act(async () => { pending.resolve({ ...snapshot, members: [], revision: "write" }); await saved; await refreshed; });
  expect(client.read).toHaveBeenCalledTimes(2);
  expect(result.current.state.snapshot?.revision).toBe("remote-confirmed");
});
