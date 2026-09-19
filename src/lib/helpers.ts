import { and, or, eq } from "drizzle-orm";
import { db } from "../db/drizzle-client.js";
import { chatPermissions } from "../db/schema.js";

/** Permission ACCEPTÉE entre deux users, dans n'importe quel sens. */
export async function getAcceptedPermission(a: number, b: number) {
  const rows = await db.select().from(chatPermissions).where(and(
    eq(chatPermissions.status, "accepted"),
    or(
      and(eq(chatPermissions.senderId, a), eq(chatPermissions.receiverId, b)),
      and(eq(chatPermissions.senderId, b), eq(chatPermissions.receiverId, a)),
    ),
  ));
  return rows[0] ?? null;
}
