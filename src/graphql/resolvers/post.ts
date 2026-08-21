import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import { db } from "../../db/drizzle-client.js";
import { appUsers, posts, comments, postLikes } from "../../db/schema.js";
import { eq, and, desc, count as drizzleCount } from "drizzle-orm";
import { pubsub, EVENTS } from "../pubsub.js";
import natural from "natural";

export default {
  Query: {
    posts: async () => {
      return await db.select().from(posts).orderBy(desc(posts.createdAt));
    },
    post: async (_: unknown, { id }: { id: string }) => {
      const result = await db.select().from(posts).where(eq(posts.id, Number(id))).then((r) => r[0]);
      return result || null;
    },

    search: async (_: unknown, { query }: { query: string }) => {
      const allPosts = await db.select().from(posts).orderBy(desc(posts.createdAt));
      if (allPosts.length === 0) return [];

      const tokenizer = new natural.WordTokenizer();
      const stemmer = natural.PorterStemmerFr;
      const tfidf = new natural.TfIdf();

      const stripDiacritics = (str: string): string =>
        str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const processText = (text: string): string => {
        const lower = stripDiacritics(text.toLowerCase());
        const tokens = tokenizer.tokenize(lower);
        return tokens.map((t) => stemmer.stem(t)).join(" ");
      };

      for (const post of allPosts) {
        const authorResult = await db
          .select()
          .from(appUsers)
          .where(eq(appUsers.id, post.authorId))
          .then((r) => r[0]);
        const fullText = `${post.title} ${post.content} ${authorResult ? authorResult.name : ""}`;
        tfidf.addDocument(processText(fullText));
      }

      const searchStr = processText(query);
      const scores: { index: number; score: number }[] = [];
      tfidf.tfidfs(searchStr, (i: number, measure: number) => {
        if (measure > 0) scores.push({ index: i, score: measure });
      });
      scores.sort((a, b) => b.score - a.score);
      return scores.map((s) => allPosts[s.index]);
    },
  },

  Mutation: {
    createPost: async (
      _: unknown,
      { title, content, imageUrl }: { title: string; content: string; imageUrl?: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const [newPost] = await db
        .insert(posts)
        .values({
          title,
          content,
          authorId: user.id,
          imageUrl: imageUrl || null,
        })
        .returning();
      pubsub.publish(EVENTS.POST_CREATED, { postCreated: newPost });
      return newPost;
    },

    updatePost: async (
      _: unknown,
      { id, title, content, imageUrl }: { id: string; title?: string; content?: string; imageUrl?: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const post = await db.select().from(posts).where(eq(posts.id, Number(id))).then((r) => r[0]);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (post.authorId !== user.id) {
        throw new Error("Vous ne pouvez modifier que vos propres posts.");
      }
      await db
        .update(posts)
        .set({
          title: title || post.title,
          content: content || post.content,
          imageUrl: imageUrl !== undefined ? imageUrl : post.imageUrl,
        })
        .where(eq(posts.id, Number(id)));
      const updated = await db.select().from(posts).where(eq(posts.id, Number(id))).then((r) => r[0]);
      return updated;
    },

    deletePost: async (_: unknown, { id }: { id: string }, { user }: Context): Promise<boolean> => {
      if (!user) throw new Error("Non authentifié");
      const post = await db.select().from(posts).where(eq(posts.id, Number(id))).then((r) => r[0]);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (post.authorId !== user.id) {
        throw new Error("Vous ne pouvez supprimer que vos propres posts.");
      }
      await db.delete(posts).where(eq(posts.id, Number(id)));
      return true;
    },

    addComment: async (
      _: unknown,
      { text, postId, parentId }: { text: string; postId: string; parentId?: string },
      { user }: Context
    ) => {
      if (!user) throw new Error("Non authentifié");
      const post = await db.select().from(posts).where(eq(posts.id, Number(postId))).then((r) => r[0]);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (parentId) {
        const parent = await db.select().from(comments).where(eq(comments.id, Number(parentId))).then((r) => r[0]);
        if (!parent) throw new Error("Le commentaire parent n'existe pas.");
      }
      const [newComment] = await db
        .insert(comments)
        .values({
          text,
          authorId: user.id,
          postId: Number(postId),
          parentId: parentId ? Number(parentId) : null,
        })
        .returning();
      pubsub.publish(EVENTS.COMMENT_ADDED, { commentAdded: newComment });
      return newComment;
    },

    toggleLike: async (_: unknown, { postId }: { postId: string }, { user }: Context): Promise<boolean> => {
      if (!user) throw new Error("Non authentifié");
      const existing = await db
        .select()
        .from(postLikes)
        .where(and(eq(postLikes.userId, user.id), eq(postLikes.postId, Number(postId))))
        .then((r) => r[0]);
      if (existing) {
        await db
          .delete(postLikes)
          .where(and(eq(postLikes.userId, user.id), eq(postLikes.postId, Number(postId))));
      } else {
        await db
          .insert(postLikes)
          .values({ userId: user.id, postId: Number(postId) })
          .onConflictDoNothing();
      }
      const countResult = await db
        .select({ count: drizzleCount() })
        .from(postLikes)
        .where(eq(postLikes.postId, Number(postId)))
        .then((r) => r[0]);
      const count = Number(countResult.count);
      pubsub.publish(EVENTS.LIKE_TOGGLED, {
        likeToggled: { postId: String(postId), likeCount: count, userId: String(user.id) },
      });
      return !existing;
    },
  },

  Subscription: {
    postCreated: {
      subscribe: () => pubsub.asyncIterableIterator([EVENTS.POST_CREATED]),
    },
    commentAdded: {
      subscribe: (_: unknown, { postId }: { postId?: string }) => {
        if (postId) {
          return {
            [Symbol.asyncIterator]: async function* () {
              const iter = pubsub.asyncIterableIterator([EVENTS.COMMENT_ADDED]) as AsyncIterableIterator<any>;
              for await (const event of iter) {
                if (String((event as any).commentAdded.post_id) === String(postId)) yield event;
              }
            },
          };
        }
        return pubsub.asyncIterableIterator([EVENTS.COMMENT_ADDED]);
      },
      resolve: (payload: any) => payload.commentAdded,
    },
    likeToggled: {
      subscribe: () => pubsub.asyncIterableIterator([EVENTS.LIKE_TOGGLED]),
      resolve: (payload: any) => payload.likeToggled,
    },
  },

  Post: {
    author: async (parent: any) => {
      const result = await db.select().from(appUsers).where(eq(appUsers.id, parent.authorId)).then((r) => r[0]);
      return result;
    },
    comments: async (parent: any) => {
      return await db
        .select()
        .from(comments)
        .where(and(eq(comments.postId, parent.id), eq(comments.parentId, null as any)))
        .orderBy(comments.createdAt);
    },
    likeCount: async (parent: any): Promise<number> => {
      const result = await db
        .select({ count: drizzleCount() })
        .from(postLikes)
        .where(eq(postLikes.postId, parent.id))
        .then((r) => r[0]);
      return Number(result.count);
    },
    likes: async (parent: any) => {
      return await db
        .select({ userId: postLikes.userId })
        .from(postLikes)
        .where(eq(postLikes.postId, parent.id));
    },
    imageUrl: (parent: any) => parent.imageUrl || null,
    createdAt: (parent: any) => parent.createdAt,
  },

  Comment: {
    author: async (parent: any) => {
      return await db.select().from(appUsers).where(eq(appUsers.id, parent.authorId)).then((r) => r[0]);
    },
    post: async (parent: any) => {
      return await db.select().from(posts).where(eq(posts.id, parent.postId)).then((r) => r[0]);
    },
    parentId: (parent: any) => parent.parentId,
    createdAt: (parent: any) => parent.createdAt,
    replies: async (parent: any) => {
      return await db
        .select()
        .from(comments)
        .where(eq(comments.parentId, parent.id))
        .orderBy(comments.createdAt);
    },
  },
};
