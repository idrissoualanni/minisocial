// ============================================================
// loaders.ts — DataLoaders par requête GraphQL (anti-N+1)
// Chaque opération GraphQL reçoit ses propres loaders via le
// contexte : le batching s'applique à l'intérieur d'une seule
// opération (1 requête SQL par niveau de profondeur, au lieu
// d'1 requête par champ résolu).
// ============================================================

import DataLoader from "dataloader";
import { eq, inArray, desc, sql } from "drizzle-orm";
import { db } from "../db/drizzle-client.js";
import {
  appUsers,
  posts,
  comments,
  postLikes,
  chatGroups,
  groupMembers,
  meetingParticipants,
} from "../db/schema.js";

type User = typeof appUsers.$inferSelect;
type Post = typeof posts.$inferSelect;
type Comment = typeof comments.$inferSelect;
type ChatGroup = typeof chatGroups.$inferSelect;
type GroupMemberRow = typeof groupMembers.$inferSelect;

/** Regroupe des lignes SQL selon une clé, en préservant l'ordre des clés demandées. */
function groupBy<K, V>(keys: readonly K[], rows: V[], keyOf: (row: V) => K): Map<K, V[]> {
  const map = new Map<K, V[]>();
  for (const k of keys) map.set(k, []);
  for (const row of rows) {
    const list = map.get(keyOf(row));
    if (list) list.push(row);
  }
  return map;
}

export interface Loaders {
  userById: DataLoader<number, User | null>;
  postsByAuthorId: DataLoader<number, Post[]>;
  rootCommentsByPostId: DataLoader<number, Comment[]>;
  repliesByCommentId: DataLoader<number, Comment[]>;
  likeCountByPostId: DataLoader<number, number>;
  likesByPostId: DataLoader<number, { id: number; name: string }[]>;
  postCountByUserId: DataLoader<number, number>;
  groupMembersByGroupId: DataLoader<number, { row: GroupMemberRow; user: User }[]>;
  meetingParticipantIdsByMeetingId: DataLoader<number, number[]>;
}

export function createLoaders(): Loaders {
  // ── 1 SELECT ... WHERE id IN (...), 1 requête pour N champs author/sender/creator ──
  const userById = new DataLoader<number, User | null>(async (ids) => {
    const rows = await db.select().from(appUsers).where(inArray(appUsers.id, ids as number[]));
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id) ?? null);
  });

  // ── User.posts : tous les posts de N auteurs en 1 requête ──
  const postsByAuthorId = new DataLoader<number, Post[]>(async (authorIds) => {
    const rows = await db
      .select()
      .from(posts)
      .where(inArray(posts.authorId, authorIds as number[]))
      .orderBy(desc(posts.createdAt));
    const map = groupBy(authorIds, rows, (r) => r.authorId);
    return authorIds.map((id) => map.get(id) ?? []);
  });

  // ── Post.comments (racines seulement) : 1 requête pour N posts ──
  const rootCommentsByPostId = new DataLoader<number, Comment[]>(async (postIds) => {
    const rows = await db
      .select()
      .from(comments)
      .where(inArray(comments.postId, postIds as number[]))
      .orderBy(comments.createdAt);
    const map = groupBy(postIds, rows, (r) => r.postId);
    return postIds.map((id) => (map.get(id) ?? []).filter((c) => c.parentId === null));
  });

  // ── Comment.replies : 1 requête pour N commentaires ──
  const repliesByCommentId = new DataLoader<number, Comment[]>(async (commentIds) => {
    const rows = await db
      .select()
      .from(comments)
      .where(inArray(comments.parentId, commentIds as number[]))
      .orderBy(comments.createdAt);
    const map = groupBy(commentIds, rows, (r) => r.parentId as number);
    return commentIds.map((id) => map.get(id) ?? []);
  });

  // ── Post.likeCount : COUNT(*) GROUP BY en 1 requête pour N posts ──
  const likeCountByPostId = new DataLoader<number, number>(async (postIds) => {
    const rows = await db
      .select({ postId: postLikes.postId, count: sql<number>`count(*)::int` })
      .from(postLikes)
      .where(inArray(postLikes.postId, postIds as number[]))
      .groupBy(postLikes.postId);
    const counts = new Map(rows.map((r) => [r.postId, Number(r.count)]));
    return postIds.map((id) => counts.get(id) ?? 0);
  });

  // ── Post.likes : users qui ont liké N posts en 1 requête (join) ──
  const likesByPostId = new DataLoader<number, { id: number; name: string }[]>(async (postIds) => {
    const rows = await db
      .select({ postId: postLikes.postId, id: appUsers.id, name: appUsers.name })
      .from(postLikes)
      .innerJoin(appUsers, eq(postLikes.userId, appUsers.id))
      .where(inArray(postLikes.postId, postIds as number[]));
    const map = groupBy(postIds, rows, (r) => r.postId);
    return postIds.map((id) =>
      (map.get(id) ?? []).map((r) => ({ id: r.id, name: r.name }))
    );
  });

  // ── User.postCount : COUNT(*) GROUP BY en 1 requête pour N users ──
  const postCountByUserId = new DataLoader<number, number>(async (userIds) => {
    const rows = await db
      .select({ authorId: posts.authorId, n: sql<number>`count(*)::int` })
      .from(posts)
      .where(inArray(posts.authorId, userIds as number[]))
      .groupBy(posts.authorId);
    const counts = new Map(rows.map((r) => [r.authorId, Number(r.n)]));
    return userIds.map((id) => counts.get(id) ?? 0);
  });

  // ── ChatGroup.members : N groupes en 1 requête ──
  const groupMembersByGroupId = new DataLoader<
    number,
    { row: GroupMemberRow; user: User }[]
  >(async (groupIds) => {
    const rows = await db
      .select({ row: groupMembers, user: appUsers })
      .from(groupMembers)
      .innerJoin(appUsers, eq(groupMembers.userId, appUsers.id))
      .where(inArray(groupMembers.groupId, groupIds as number[]));
    const map = groupBy(
      groupIds,
      rows,
      (r) => r.row.groupId
    );
    return groupIds.map((id) => map.get(id) ?? []);
  });

  // ── Meeting.participants : ids participants de N meetings en 1 requête ──
  const meetingParticipantIdsByMeetingId = new DataLoader<number, number[]>(async (meetingIds) => {
    const rows = await db
      .select({ meetingId: meetingParticipants.meetingId, userId: meetingParticipants.userId })
      .from(meetingParticipants)
      .where(inArray(meetingParticipants.meetingId, meetingIds as number[]));
    const map = groupBy(meetingIds, rows, (r) => r.meetingId);
    return meetingIds.map((id) => (map.get(id) ?? []).map((r) => r.userId));
  });

  return {
    userById,
    postsByAuthorId,
    rootCommentsByPostId,
    repliesByCommentId,
    likeCountByPostId,
    likesByPostId,
    postCountByUserId,
    groupMembersByGroupId,
    meetingParticipantIdsByMeetingId,
  };
}
