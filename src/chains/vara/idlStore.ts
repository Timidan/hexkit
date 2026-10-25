import type { Hex } from "./model";

const fallback = new Map<string, string | null>();

export function getIdl(programId: Hex): string | null {
  const key = `hexkit.vara.idl.${programId.toLowerCase()}`;
  if (fallback.has(key)) return fallback.get(key) ?? null;
  try { return localStorage.getItem(key); } catch { return null; }
}

export function setIdl(programId: Hex, text: string | null): void {
  const key = `hexkit.vara.idl.${programId.toLowerCase()}`;
  fallback.set(key, text);
  try {
    if (text === null) localStorage.removeItem(key);
    else localStorage.setItem(key, text);
  } catch { /* retain the in-memory value when storage is unavailable */ }
}
