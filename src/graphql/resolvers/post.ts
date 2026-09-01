import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import { db } from "../../db/drizzle-client.js";
import { appUsers, posts, comments, postLikes } from "../../db/schema.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { pubsub, EVENTS } from "../pubsub.js";
import { validate, CreatePostSchema, UpdatePostSchema, AddCommentSchema } from "../../utils/validation.js";
import { isoDate } from "../serialize.js";
import type { Loaders } from "../loaders.js";
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

    // Recherche TF-IDF : auteurs chargés en 1 seule requête (anti-N+1)
    search: async (_: unknown, { query }: { query: string }) => {
      const allPosts = await db.select().from(posts).orderBy(desc(posts.createdAt));
      if (allPosts.length === 0) return [];

      const authorRows = await db
        .select({ id: appUsers.id, name: appUsers.name })
        .from(appUsers)
        .where(inArray(appUsers.id, allPosts.map((p) => p.authorId)));
      const authorNames = new Map(authorRows.map((r) => [r.id, r.name]));

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
        const authorName = authorNames.get(post.authorId) ?? "";
        const fullText = `${post.title} ${post.content} ${authorName}`;
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
      const data = validate(CreatePostSchema, { title, content, imageUrl: imageUrl ?? null });
      const [newPost] = await db
        .insert(posts)
        .values({
          title: data.title,
          content: data.content,
          authorId: user.id,
          imageUrl: data.imageUrl || null,
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
      const data = validate(UpdatePostSchema, {
        id,
        title: title ?? undefined,
        content: content ?? undefined,
        imageUrl: imageUrl ?? undefined,
      });
      await db
        .update(posts)
        .set({
          title: data.title || post.title,
          content: data.content || post.content,
          imageUrl: data.imageUrl !== undefined ? data.imageUrl : post.imageUrl,
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
      const data = validate(AddCommentSchema, { text, postId, parentId: parentId ?? null });
      const post = await db.select().from(posts).where(eq(posts.id, Number(postId))).then((r) => r[0]);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (data.parentId) {
        const parent = await db.select().from(comments).where(eq(comments.id, Number(data.parentId))).then((r) => r[0]);
        if (!parent) throw new Error("Le commentaire parent n'existe pas.");
      }
      const [newComment] = await db
        .insert(comments)
        .values({
          text: data.text,
          authorId: user.id,
          postId: Number(postId),
          parentId: data.parentId ? Number(data.parentId) : null,
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
        .select({ userId: postLikes.userId })
        .from(postLikes)
        .where(eq(postLikes.postId, Number(postId)));
      const count = countResult.length;
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
                // Drizzle renvoie postId (camelCase) — l'ancien post_id ne matchait jamais
                if (String((event as any).commentAdded.postId) === String(postId)) yield event;
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
    // Batché : 1 requête pour tous les posts d'une même opération
    author: async (parent: any, _args: unknown, { loaders }: Context) => {
      return await loaders.userById.load(parent.authorId);
    },
    comments: async (parent: any, _args: unknown, { loaders }: Context) => {
      return await loaders.rootCommentsByPostId.load(parent.id);
    },
    likeCount: async (parent: any, _args: unknown, { loaders }: Context): Promise<number> => {
      return await loaders.likeCountByPostId.load(parent.id);
    },
    // Retourne de vrais objets utilisateur ({id, name}) — l'ancien resolver
    // renvoyait des {userId} bruts alors que le schéma exige [User!]!
    likes: async (parent: any, _args: unknown, { loaders }: Context) => {
      return await loaders.likesByPostId.load(parent.id);
    },
    imageUrl: (parent: any) => parent.imageUrl || null,
    createdAt: (parent: any) => isoDate(parent.createdAt),
  },

  Comment: {
    author: async (parent: any, _args: unknown, { loaders }: Context) => {
      return await loaders.userById.load(parent.authorId);
    },
    post: async (parent: any) => {
      return await db.select().from(posts).where(eq(posts.id, parent.postId)).then((r) => r[0]);
    },
    parentId: (parent: any) => parent.parentId,
    createdAt: (parent: any) => isoDate(parent.createdAt),
    replies: async (parent: any, _args: unknown, { loaders }: Context) => {
      return await loaders.repliesByCommentId.load(parent.id);
    },
  },
};
