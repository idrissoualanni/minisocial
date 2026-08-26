export const PORT: number = Number(process.env.PORT) || 4000;

// Origines autorisées : env (séparées par virgules) en prod, localhost sinon
export const CORS_ORIGINS: string[] = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:4000"];
