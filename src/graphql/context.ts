// src/graphql/context.ts
import type { IncomingMessage } from "http";
import type { Response } from "express";
import { auth } from "../auth.js";
import { ensureAppUser, type AppUser } from "../db/index.js";
import { createLoaders, type Loaders } from "./loaders.js";

export interface Context {
  user: AppUser | null;
  loaders: Loaders;
}

export async function getUserFromRequest(req: IncomingMessage): Promise<AppUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as Record<string, string>,
    });
    if (!session?.user) return null;
    return await ensureAppUser(session.user as any);
  } catch {
    return null;
  }
}

export async function contextFn({ req }: { req: IncomingMessage }): Promise<Context> {
  const user = await getUserFromRequest(req);
  return { user, loaders: createLoaders() };
}

interface AuthenticatedRequest extends IncomingMessage {
  user?: AppUser;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: () => void): void {
  getUserFromRequest(req).then((user) => {
    if (!user) {
      res.status(401).json({ error: "Non authentifié" });
      return;
    }
    req.user = user;
    next();
  });
}
