import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, readSession, saveSession, sessionDurationMs, sessionExpiresAt, sessionStorageKey } from "./session-storage";

beforeEach(clearSession);
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

describe("fixed 12-hour session deadline", () => {
  it.each([
    ["Santiago", "2026-10-22T09:00:00-03:00", "2026-10-22T21:00:00-03:00"],
    ["Lima", "2026-10-22T09:00:00-05:00", "2026-10-22T21:00:00-05:00"],
    ["Manila", "2026-10-22T09:00:00+08:00", "2026-10-22T21:00:00+08:00"],
    ["local midnight", "2026-10-22T23:00:00-03:00", "2026-10-23T11:00:00-03:00"],
    ["DST starts", "2026-09-05T20:00:00-04:00", "2026-09-06T09:00:00-03:00"],
    ["DST ends", "2026-04-04T20:00:00-03:00", "2026-04-05T07:00:00-04:00"],
  ])("lasts 12 elapsed hours across %s", (_location, now, deadline) => {
    expect(sessionExpiresAt(Date.parse(now))).toBe(Date.parse(deadline));
    expect(sessionExpiresAt(Date.parse(now)) - Date.parse(now)).toBe(sessionDurationMs);
  });

  it("restores a credential without extending its original deadline", () => {
    const createdAt = Date.parse("2026-10-22T22:00:00Z");
    const session = { version: 2 as const, email: "test@example.com", token: "test-only", createdAt, expiresAt: sessionExpiresAt(createdAt) };
    expect(saveSession(session)).toBe(true);
    for (const now of [createdAt, createdAt + 3600000, session.expiresAt - 1]) {
      expect(readSession(now)).toEqual({ status: "saved", session });
      expect(JSON.parse(window.localStorage.getItem(sessionStorageKey)!)).toEqual(session);
    }
    expect(readSession(session.expiresAt)).toEqual({ status: "expired" });
    expect(window.localStorage.getItem(sessionStorageKey)).toBeNull();
  });

  it("discards corrupt data and invalid expiry dates", () => {
    window.localStorage.setItem(sessionStorageKey, "not JSON");
    expect(readSession()).toEqual({ status: "invalid" });
    const createdAt = Date.now();
    window.localStorage.setItem(sessionStorageKey, JSON.stringify({ version: 2, email: "test@example.com", token: "test-only", createdAt, expiresAt: createdAt + 86400000 }));
    expect(readSession(createdAt)).toEqual({ status: "invalid" });
    expect(window.localStorage.getItem(sessionStorageKey)).toBeNull();
  });

  it("requires fresh authentication for legacy midnight sessions", () => {
    const createdAt = Date.parse("2026-10-22T22:00:00Z");
    window.localStorage.setItem(sessionStorageKey, JSON.stringify({ version: 1, email: "test@example.com", token: "test-only", createdAt, expiresAt: Date.parse("2026-10-23T03:00:00Z") }));
    expect(readSession(createdAt)).toEqual({ status: "invalid" });
    expect(window.localStorage.getItem(sessionStorageKey)).toBeNull();
  });

  it("rejects sessions created in the future", () => {
    const now = Date.now();
    const createdAt = now + 1;
    saveSession({ version: 2, email: "test@example.com", token: "test-only", createdAt, expiresAt: sessionExpiresAt(createdAt) });
    expect(readSession(now)).toEqual({ status: "invalid" });
  });

  it("reports unavailable storage without promising reload persistence", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    const createdAt = Date.now();
    expect(saveSession({ version: 2, email: "test@example.com", token: "test-only", createdAt, expiresAt: sessionExpiresAt(createdAt) })).toBe(false);
    expect(readSession()).toEqual({ status: "none" });
  });
});
