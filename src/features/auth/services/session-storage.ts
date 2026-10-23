import { z } from "zod";

export const sessionStorageKey = "kontrolpr.bitbucket-session.v1";
export const sessionDurationMs = 12 * 60 * 60 * 1000;
// Keep the storage key stable for cross-tab logout; reject obsolete expiry policies by schema version.
const sessionSchema = z.object({ version: z.literal(2), email: z.email(), token: z.string().min(1), createdAt: z.number().finite(), expiresAt: z.number().finite() });
export type StoredSession = z.infer<typeof sessionSchema>;
export type SessionRead = { status: "saved"; session: StoredSession } | { status: "none" | "expired" | "invalid" };

export function sessionExpiresAt(createdAt = Date.now()): number {
  return createdAt + sessionDurationMs;
}

export function clearSession(): void {
  try { window.localStorage.removeItem(sessionStorageKey); } catch { /* Storage may be blocked; the in-memory session still closes. */ }
}

export function readSession(now = Date.now()): SessionRead {
  let raw: string | null;
  try { raw = window.localStorage.getItem(sessionStorageKey); } catch { return { status: "none" }; }
  if (!raw) return { status: "none" };
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.createdAt > now || parsed.data.expiresAt !== sessionExpiresAt(parsed.data.createdAt)) {
      clearSession();
      return { status: "invalid" };
    }
    if (parsed.data.expiresAt <= now) { clearSession(); return { status: "expired" }; }
    return { status: "saved", session: parsed.data };
  } catch { clearSession(); return { status: "invalid" }; }
}

export function saveSession(session: StoredSession): boolean {
  try { window.localStorage.setItem(sessionStorageKey, JSON.stringify(session)); return true; } catch { clearSession(); return false; }
}
