export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Computes the next sequential business number (e.g. "WIR-014") for an entity
 * within a scope, based on existing numbers. Callers must run this inside a
 * transaction with a retry loop to guard against concurrent duplicates;
 * the unique database index is the final guarantee.
 */
export function nextNumber(existing: string[], prefix: string, width = 3): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const n of existing) {
    const m = re.exec(n);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v > max) max = v;
    }
  }
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
