// ============================================================
// schema.ts — Drizzle ORM schema (PostgreSQL)
// ============================================================

import {
  boolean,
  check as pgCheck,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql as drizzleSql } from "drizzle-orm";
import { relations } from "drizzle-orm";

// ============================================================
// app_users
// ============================================================
export const appUsers = pgTable("app_users", {
  id: serial("id").primaryKey(),
  baUserId: text("ba_user_id").unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  bio: text("bio").default(""),
});

// ============================================================
// posts
// ============================================================
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: integer("author_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// comments
// ============================================================
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  authorId: integer("author_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  parentId: integer("parent_id").references((): AnyPgColumn => comments.id, {
    onDelete: "cascade",
  }),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// messages
// ============================================================
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  senderId: integer("sender_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  receiverId: integer("receiver_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  read: integer("read").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// chat_permissions
// ============================================================
export const chatPermissions = pgTable(
  "chat_permissions",
  {
    id: serial("id").primaryKey(),
    senderId: integer("sender_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    receiverId: integer("receiver_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("chat_permissions_sender_receiver_unique").on(t.senderId, t.receiverId)],
);

// ============================================================
// post_likes (composite PK)
// ============================================================
export const postLikes = pgTable(
  "post_likes",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);

// ============================================================
// chat_groups
// ============================================================
export const chatGroups = pgTable("chat_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// group_members (composite PK)
// ============================================================
export const groupMembers = pgTable(
  "group_members",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => chatGroups.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    isCreator: integer("is_creator").default(0),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

// ============================================================
// group_messages
// ============================================================
export const groupMessages = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  senderId: integer("sender_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  groupId: integer("group_id")
    .notNull()
    .references(() => chatGroups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// meetings
// ============================================================
export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => appUsers.id),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================
// meeting_participants
// ============================================================
export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    id: serial("id").primaryKey(),
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (t) => [unique("meeting_participants_meeting_user_unique").on(t.meetingId, t.userId)],
);

// ============================================================
// Relations
// ============================================================

export const appUsersRelations = relations(appUsers, ({ many }) => ({
  posts: many(posts),
  authoredComments: many(comments),
  sentMessages: many(messages),
  receivedMessages: many(messages),
  sentChatPermissions: many(chatPermissions),
  receivedChatPermissions: many(chatPermissions),
  likedPosts: many(postLikes),
  createdGroups: many(chatGroups),
  groupMemberships: many(groupMembers),
  sentGroupMessages: many(groupMessages),
  createdMeetings: many(meetings),
  meetingParticipations: many(meetingParticipants),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(appUsers, { fields: [posts.authorId], references: [appUsers.id] }),
  comments: many(comments),
  likes: many(postLikes),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  author: one(appUsers, {
    fields: [comments.authorId],
    references: [appUsers.id],
  }),
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "commentTree",
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(appUsers, {
    fields: [messages.senderId],
    references: [appUsers.id],
  }),
  receiver: one(appUsers, {
    fields: [messages.receiverId],
    references: [appUsers.id],
  }),
}));

export const chatPermissionsRelations = relations(
  chatPermissions,
  ({ one }) => ({
    sender: one(appUsers, {
      fields: [chatPermissions.senderId],
      references: [appUsers.id],
    }),
    receiver: one(appUsers, {
      fields: [chatPermissions.receiverId],
      references: [appUsers.id],
    }),
  }),
);

export const postLikesRelations = relations(postLikes, ({ one }) => ({
  user: one(appUsers, {
    fields: [postLikes.userId],
    references: [appUsers.id],
  }),
  post: one(posts, { fields: [postLikes.postId], references: [posts.id] }),
}));

export const chatGroupsRelations = relations(chatGroups, ({ one, many }) => ({
  creator: one(appUsers, {
    fields: [chatGroups.creatorId],
    references: [appUsers.id],
  }),
  members: many(groupMembers),
  messages: many(groupMessages),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(chatGroups, {
    fields: [groupMembers.groupId],
    references: [chatGroups.id],
  }),
  user: one(appUsers, {
    fields: [groupMembers.userId],
    references: [appUsers.id],
  }),
}));

export const groupMessagesRelations = relations(groupMessages, ({ one }) => ({
  sender: one(appUsers, {
    fields: [groupMessages.senderId],
    references: [appUsers.id],
  }),
  group: one(chatGroups, {
    fields: [groupMessages.groupId],
    references: [chatGroups.id],
  }),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  creator: one(appUsers, {
    fields: [meetings.creatorId],
    references: [appUsers.id],
  }),
  participants: many(meetingParticipants),
}));

export const meetingParticipantsRelations = relations(
  meetingParticipants,
  ({ one }) => ({
    meeting: one(meetings, {
      fields: [meetingParticipants.meetingId],
      references: [meetings.id],
    }),
    user: one(appUsers, {
      fields: [meetingParticipants.userId],
      references: [appUsers.id],
    }),
  }),
);

// ============================================================
// Better Auth tables (required by better-auth)
// ============================================================
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================
// Better Auth relations
// ============================================================
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

// ============================================================
// follows (système d'abonnement)
// ============================================================
export const follows = pgTable(
  "follows",
  {
    followerId: integer("follower_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    followingId: integer("following_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    // Contrainte: on ne peut pas se suivre soi-même
    pgCheck("no_self_follow", drizzleSql`${t.followerId} <> ${t.followingId}`),
  ]
);

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(appUsers, {
    fields: [follows.followerId],
    references: [appUsers.id],
  }),
  following: one(appUsers, {
    fields: [follows.followingId],
    references: [appUsers.id],
  }),
}));
