// Per-browser settings kept in localStorage (not part of the garden backup).

const KEY = "garden.anthropicKey";

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setApiKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked; the key just won't persist.
  }
}
