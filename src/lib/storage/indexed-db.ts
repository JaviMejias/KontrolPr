import type { LocalPreferences } from "../../types/domain";
import { defaultPreferences, normalizePreferences, readStoredPreferences } from "./preferences";

export { defaultPreferences } from "./preferences";

const databaseName = "kontrolpr-local";
const databaseVersion = 1;
const preferencesKey = "preferences";

const memoryPreferences = new Map<string, LocalPreferences>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("app");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readValue<T>(key: string): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction("app", "readonly").objectStore("app").get(key);
    request.onsuccess = () => { database.close(); resolve(request.result as T | undefined); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

export async function writeValue<T>(key: string, value: T): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("app", "readwrite");
    transaction.objectStore("app").put(value, key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function loadPreferences(owner = "demo"): Promise<LocalPreferences> {
  const fallback = normalizePreferences(memoryPreferences.get(owner) ?? defaultPreferences);
  if (typeof indexedDB === "undefined") return fallback;
  try {
    const stored = await readValue<unknown>(owner === "demo" ? preferencesKey : `${preferencesKey}:${owner}`);
    const preferences = stored === undefined ? fallback : readStoredPreferences(stored);
    memoryPreferences.set(owner, preferences);
    return preferences;
  } catch {
    return fallback;
  }
}

export async function savePreferences(preferences: LocalPreferences, owner = "demo"): Promise<void> {
  const normalized = normalizePreferences(preferences);
  memoryPreferences.set(owner, normalized);
  if (typeof indexedDB === "undefined") return;
  try {
    await writeValue(owner === "demo" ? preferencesKey : `${preferencesKey}:${owner}`, { version: 1, preferences: normalized });
  } catch {
    return;
  }
}

export async function deleteValue(key: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("app", "readwrite");
    transaction.objectStore("app").delete(key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}
