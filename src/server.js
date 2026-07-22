// ============================================================
// server.js — Apollo Server + WebSocket (subscriptions)
// + Better Auth (/api/auth/*)
// ============================================================

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { toNodeHandler } from "better-auth/node";

// db MUST be imported first — it runs the schema migration
import db from "./db/index.js";

import typeDefs from "./graphql/schema/typeDefs.js";
import resolvers from "./graphql/resolvers/index.js";
import { contextFn } from "./graphql/context.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { auth } from "./auth.js";
import { PORT, CORS_ORIGINS } from "./config/index.js";

// --- Paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Schema exécutable (requis par graphql-ws) ---
const schema = makeExecutableSchema({ typeDefs, resolvers });

// --- Express + HTTP Server ---
const app = express();
const httpServer = createServer(app);

// --- Better Auth handler (AVANT express.json) ---
app.all("/api/auth/*", toNodeHandler(auth));

// --- WebSocket Server (pour les subscriptions) ---
const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});

const serverCleanup = useServer(
  {
    schema,
    context: async (ctx) => {
      // Better Auth: lire les cookies depuis la requête HTTP upgrade initiale
      const req = ctx.extra?.request;
      if (req) {
        return contextFn({ req });
      }
      // Fallback: utiliser connectionParams (si le client envoie le token)
      const headers = ctx.connectionParams || {};
      return contextFn({ req: { headers } });
    },
  },
  wsServer
);

// --- Apollo Server (HTTP) ---
const server = new ApolloServer({
  schema,
  plugins: [
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

await server.start();

// --- Rate limiting global ---
app.use("/graphql", globalLimiter);

// --- Middleware ---
app.use(
  "/graphql",
  cors({ origin: CORS_ORIGINS, credentials: true }),
  express.json({ limit: "10mb" }),
  expressMiddleware(server, { context: contextFn })
);

// Servir le build React en production
app.use(express.static(join(__dirname, "..", "client", "dist")));

// SPA fallback
const indexPath = join(__dirname, "..", "client", "dist", "index.html");
if (existsSync(indexPath)) {
  app.get("*", (req, res) => {
    res.sendFile(indexPath);
  });
}

// --- Lancement ---
httpServer.listen(PORT, () => {
  console.log(`\n🚀 GraphQL HTTP  → http://localhost:${PORT}/graphql`);
  console.log(`🔌 GraphQL WS    → ws://localhost:${PORT}/graphql`);
  console.log(`🔐 Better Auth   → http://localhost:${PORT}/api/auth`);
  console.log(`🌐 Frontend      → http://localhost:${PORT}\n`);
});
