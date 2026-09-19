// Rate limiting en mémoire par clé (compatible WebSocket)
const buckets = new Map<string, number[]>();

export function rateLimitByKey(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  
  if (hits.length >= limit) {
    throw new Error(`Trop de requêtes. Réessayez dans ${Math.ceil(windowMs / 1000)}s.`);
  }
  
  hits.push(now);
  buckets.set(key, hits);
  
  // Nettoyage anti-fuite mémoire
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t > windowMs)) {
        buckets.delete(k);
      }
    }
  }
}
