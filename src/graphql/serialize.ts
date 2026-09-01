// ============================================================
// serialize.ts — Sérialisation Date → String pour GraphQL
// Drizzle/node-postgres renvoie des objets Date, mais le schéma
// GraphQL déclare createdAt/updatedAt/joinedAt comme String.
// graphql-js ne sérialise pas les Date en String de façon fiable :
// il faut convertir explicitement en ISO 8601 UTC.
// ============================================================

export function isoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    // Format SQLite historique "YYYY-MM-DD HH:MM:SS" (interprété comme UTC)
    if (!value.includes("T")) return value.trim().replace(" ", "T") + "Z";
    return value.endsWith("Z") ? value : value + "Z";
  }
  return String(value);
}
