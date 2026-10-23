import type { Person } from "../../../types/domain";

export type AuthMode = "anonymous" | "bitbucket";

export interface AuthSession {
  mode: AuthMode;
  user?: Person;
  accessToken?: string;
  expiresAt?: string;
}

export interface AuthProvider {
  getSession(): Promise<AuthSession>;
  beginLogin(): Promise<void>;
  signOut(): Promise<void>;
}
