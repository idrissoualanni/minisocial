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

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr.replace(" ", "T") + "Z");
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}
