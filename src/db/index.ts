// ============================================================
// db.ts — Export AppUser type + ensureAppUser helper (Drizzle)
// ============================================================

import { eq } from "drizzle-orm";
import { db } from "./drizzle-client.js";
import { appUsers } from "./schema.js";

// ============================================================
// TYPES
// ============================================================
export interface AppUser {
  id: number;
  baUserId: string | null;
  name: string;
  email: string;
  lastSeen: Date | null;
  createdAt: Date | null;
  bio: string;
}

interface BaUser {
  id: string;
  name: string;
  email: string;
  bio?: string;
}

// ============================================================
// HELPER : Créer un app_users à partir d'un Better Auth user
// ============================================================
export async function ensureAppUser(baUser: BaUser): Promise<AppUser> {
  const existing = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.baUserId, baUser.id))
    .then((r) => r[0]);

  if (existing) return existing as AppUser;

  const [created] = await db
    .insert(appUsers)
    .values({
      baUserId: baUser.id,
      name: baUser.name,
      email: baUser.email,
      bio: baUser.bio || "",
    })
    .returning();

  return created as AppUser;
}
