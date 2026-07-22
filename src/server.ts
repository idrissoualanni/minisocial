import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { type IResolvers } from "@graphql-tools/utils";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { createServer, type Server } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { useServer } from "graphql-ws/use/ws";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { toNodeHandler } from "better-auth/node";

import db from "./db/index.js";

import typeDefs from "./graphql/schema/typeDefs.js";
import resolvers from "./graphql/resolvers/index.js";
import { contextFn } from "./graphql/context.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { auth } from "./auth.js";
import { PORT, CORS_ORIGINS } from "./config/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const schema = makeExecutableSchema({ typeDefs, resolvers: resolvers as IResolvers });

const app: Express = express();
const httpServer: Server = createServer(app);

app.all("/api/auth/*", toNodeHandler(auth));

const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});

interface WSContext {
  connectionParams: Record<string, unknown> | undefined;
  extra?: {
    request?: {
      headers: Record<string, unknown>;
    };
  };
}

const serverCleanup = useServer(
  {
    schema,
    context: async (ctx: WSContext) => {
      const req = ctx.extra?.request;
      if (req) {
        return contextFn({ req: req as any });
      }
      const headers = ctx.connectionParams || {};
      return contextFn({ req: { headers } as any });
    },
  },
  wsServer
);

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

app.use("/graphql", globalLimiter);

app.use(
  "/graphql",
  cors({ origin: CORS_ORIGINS, credentials: true }),
  express.json({ limit: "10mb" }),
  expressMiddleware(server, { context: contextFn }) as any
);

app.use(express.static(join(__dirname, "..", "client", "dist")));

const indexPath = join(__dirname, "..", "client", "dist", "index.html");
if (existsSync(indexPath)) {
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(indexPath);
  });
}

httpServer.listen(PORT, () => {
  console.log(`\n🚀 GraphQL HTTP  → http://localhost:${PORT}/graphql`);
  console.log(`🔌 GraphQL WS    → ws://localhost:${PORT}/graphql`);
  console.log(`🔐 Better Auth   → http://localhost:${PORT}/api/auth`);
  console.log(`🌐 Frontend      → http://localhost:${PORT}\n`);
});
