// Helpers for reading loosely-shaped backend payloads without `any`.
// Admin endpoints are young: a body may be bare or wrapped in {success,data},
// and a list may be a top-level array or sit under one of several keys.

export type UnknownRecord = Record<string, unknown>;

export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// {success, data: X} → X; anything else is returned as-is.
export function unwrapData(raw: unknown): unknown {
  if (isRecord(raw) && "data" in raw && raw.data !== undefined) return raw.data;
  return raw;
}

// The first array found: the value itself, or under one of `keys`, in order.
export function pickArray(d: unknown, keys: readonly string[] = []): unknown[] {
  if (Array.isArray(d)) return d;
  if (!isRecord(d)) return [];
  for (const k of keys) {
    const v = d[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

// Array items that are plain objects, typed as records.
export function recordItems(arr: unknown[]): UnknownRecord[] {
  return arr.filter(isRecord);
}
