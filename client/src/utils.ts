export const AVATAR_GRADIENTS: string[] = [
  "linear-gradient(135deg, #f59e0b, #ec4899)",
  "linear-gradient(135deg, #6366f1, #3b82f6)",
  "linear-gradient(135deg, #10b981, #06b6d4)",
  "linear-gradient(135deg, #f97316, #ef4444)",
  "linear-gradient(135deg, #8b5cf6, #a855f7)",
  "linear-gradient(135deg, #14b8a6, #22d3ee)",
];

export function getAvatarGradient(id: string): string {
  return AVATAR_GRADIENTS[(parseInt(id) - 1) % AVATAR_GRADIENTS.length];
}

/**
 * Parse une date serveur en objet Date.
 * Accepte l'ISO 8601 (résolvers actuels, ex. "2026-08-29T18:00:00.000Z")
 * ET l'ancien format SQLite "YYYY-MM-DD HH:MM:SS" interprété comme UTC
 * (données historiques / caches persistés éventuels).
 */
export function parseServerDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const raw = dateStr.includes("T")
    ? dateStr
    : dateStr.trim().replace(" ", "T") + "Z";
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function timeAgo(dateStr: string | null | undefined): string {
  const d = parseServerDate(dateStr);
  if (!d) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}
