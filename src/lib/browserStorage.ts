type StorageScope = "session" | "local";

const getBrowserStorage = (scope: StorageScope): Storage | null => {
  if (typeof window === "undefined") return null;

  try {
    return scope === "session" ? window.sessionStorage : window.localStorage;
  } catch (error) {
    console.error(`Failed to access ${scope}Storage:`, error);
    return null;
  }
};

const readStorageItem = (scope: StorageScope, key: string) => {
  const storage = getBrowserStorage(scope);
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch (error) {
    console.error(`Failed to read ${scope}Storage key "${key}":`, error);
    return null;
  }
};

const writeStorageItem = (scope: StorageScope, key: string, value: string) => {
  const storage = getBrowserStorage(scope);
  if (!storage) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Failed to write ${scope}Storage key "${key}":`, error);
    return false;
  }
};

const removeStorageItem = (scope: StorageScope, key: string) => {
  const storage = getBrowserStorage(scope);
  if (!storage) return;

  try {
    storage.removeItem(key);
  } catch (error) {
    console.error(`Failed to remove ${scope}Storage key "${key}":`, error);
  }
};

const clearStorageKeysByPrefix = (scope: StorageScope, prefixes: string[]) => {
  const storage = getBrowserStorage(scope);
  if (!storage || prefixes.length === 0) return;

  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) keys.push(key);
    }

    keys.forEach((key) => {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key);
      }
    });
  } catch (error) {
    console.error(`Failed to clear ${scope}Storage keys by prefix:`, error);
  }
};

const readStorageJson = <T,>(scope: StorageScope, key: string, fallback: T) => {
  const raw = readStorageItem(scope, key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Failed to parse ${scope}Storage key "${key}":`, error);
    removeStorageItem(scope, key);
    return fallback;
  }
};

export const readSessionStorageItem = (key: string) => readStorageItem("session", key);
export const writeSessionStorageItem = (key: string, value: string) => writeStorageItem("session", key, value);
export const removeSessionStorageItem = (key: string) => removeStorageItem("session", key);
export const readSessionStorageJson = <T,>(key: string, fallback: T) => readStorageJson("session", key, fallback);
export const clearSessionStorageKeysByPrefix = (prefixes: string[]) => clearStorageKeysByPrefix("session", prefixes);

export const readLocalStorageItem = (key: string) => readStorageItem("local", key);
export const writeLocalStorageItem = (key: string, value: string) => writeStorageItem("local", key, value);
export const removeLocalStorageItem = (key: string) => removeStorageItem("local", key);
