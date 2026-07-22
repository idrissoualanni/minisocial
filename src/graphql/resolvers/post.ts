import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import db from "../../db/index.js";
import { pubsub, EVENTS } from "../pubsub.js";
import natural from "natural";

interface PostRow {
  id: number;
  title: string;
  content: string;
  author_id: number;
  image_url: string | null;
  created_at: string;
}

interface CommentRow {
  id: number;
  text: string;
  author_id: number;
  post_id: number;
  parent_id: number | null;
  created_at: string;
}

interface LikeRow {
  count: number;
}

const stmts = {
  allPosts: db.prepare("SELECT * FROM posts ORDER BY created_at DESC"),
  postById: db.prepare("SELECT * FROM posts WHERE id = ?"),
  userById: db.prepare("SELECT * FROM app_users WHERE id = ?"),
  commentsByPost: db.prepare("SELECT * FROM comments WHERE post_id = ? AND parent_id IS NULL ORDER BY created_at ASC"),
  commentsByParent: db.prepare("SELECT * FROM comments WHERE parent_id = ? ORDER BY created_at ASC"),
  likeCount: db.prepare("SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?"),
  likedUsers: db.prepare(
    "SELECT u.* FROM app_users u JOIN post_likes pl ON u.id = pl.user_id WHERE pl.post_id = ?"
  ),
  hasLiked: db.prepare("SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?"),
  toggleLikeOn: db.prepare("INSERT OR IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)"),
  toggleLikeOff: db.prepare("DELETE FROM post_likes WHERE user_id = ? AND post_id = ?"),
  insertPost: db.prepare("INSERT INTO posts (title, content, author_id, image_url) VALUES (?, ?, ?, ?)"),
  insertComment: db.prepare("INSERT INTO comments (text, author_id, post_id, parent_id) VALUES (?, ?, ?, ?)"),
};

export default {
  Query: {
    posts: (): PostRow[] => stmts.allPosts.all() as PostRow[],
    post: (_: unknown, { id }: { id: string }): PostRow | null =>
      (stmts.postById.get(id) as PostRow) || null,

    search: (_: unknown, { query }: { query: string }): PostRow[] => {
      const allPosts = stmts.allPosts.all() as PostRow[];
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

      allPosts.forEach((post) => {
        const author = stmts.userById.get(post.author_id) as AppUser | undefined;
        const fullText = `${post.title} ${post.content} ${author ? author.name : ""}`;
        tfidf.addDocument(processText(fullText));
      });

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
    createPost: (_: unknown, { title, content, imageUrl }: { title: string; content: string; imageUrl?: string }, { user }: Context): PostRow => {
      if (!user) throw new Error("Non authentifié");
      const result = stmts.insertPost.run(title, content, user.id, imageUrl || null);
      const newPost = stmts.postById.get(result.lastInsertRowid) as PostRow;
      pubsub.publish(EVENTS.POST_CREATED, { postCreated: newPost });
      return newPost;
    },

    updatePost: (_: unknown, { id, title, content, imageUrl }: { id: string; title?: string; content?: string; imageUrl?: string }, { user }: Context): PostRow => {
      if (!user) throw new Error("Non authentifié");
      const post = stmts.postById.get(id) as PostRow | undefined;
      if (!post) throw new Error("Ce post n'existe pas.");
      if (post.author_id !== user.id) {
        throw new Error("Vous ne pouvez modifier que vos propres posts.");
      }
      db.prepare("UPDATE posts SET title = ?, content = ?, image_url = ? WHERE id = ?").run(
        title || post.title, content || post.content,
        imageUrl !== undefined ? imageUrl : post.image_url,
        id
      );
      return stmts.postById.get(id) as PostRow;
    },

    deletePost: (_: unknown, { id }: { id: string }, { user }: Context): boolean => {
      if (!user) throw new Error("Non authentifié");
      const post = stmts.postById.get(id) as PostRow | undefined;
      if (!post) throw new Error("Ce post n'existe pas.");
      if (post.author_id !== user.id) {
        throw new Error("Vous ne pouvez supprimer que vos propres posts.");
      }
      db.prepare("DELETE FROM posts WHERE id = ?").run(id);
      return true;
    },

    addComment: (_: unknown, { text, postId, parentId }: { text: string; postId: string; parentId?: string }, { user }: Context): CommentRow => {
      if (!user) throw new Error("Non authentifié");
      const post = stmts.postById.get(postId) as PostRow | undefined;
      if (!post) throw new Error("Ce post n'existe pas.");
      if (parentId) {
        const parent = db.prepare("SELECT * FROM comments WHERE id = ?").get(parentId);
        if (!parent) throw new Error("Le commentaire parent n'existe pas.");
      }
      const result = stmts.insertComment.run(text, user.id, postId, parentId || null);
      const newComment = db.prepare("SELECT * FROM comments WHERE id = ?").get(result.lastInsertRowid) as CommentRow;
      pubsub.publish(EVENTS.COMMENT_ADDED, { commentAdded: newComment });
      return newComment;
    },

    toggleLike: (_: unknown, { postId }: { postId: string }, { user }: Context): boolean => {
      if (!user) throw new Error("Non authentifié");
      const existing = stmts.hasLiked.get(user.id, postId);
      if (existing) {
        stmts.toggleLikeOff.run(user.id, postId);
      } else {
        stmts.toggleLikeOn.run(user.id, postId);
      }
      const count = (stmts.likeCount.get(postId) as LikeRow).count;
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
    author: (parent: PostRow) => stmts.userById.get(parent.author_id),
    comments: (parent: PostRow) => stmts.commentsByPost.all(parent.id),
    likeCount: (parent: PostRow): number => (stmts.likeCount.get(parent.id) as LikeRow).count,
    likes: (parent: PostRow) => stmts.likedUsers.all(parent.id),
    imageUrl: (parent: PostRow) => parent.image_url || null,
    createdAt: (parent: PostRow) => parent.created_at,
  },

  Comment: {
    author: (parent: CommentRow) => stmts.userById.get(parent.author_id),
    post: (parent: CommentRow) => stmts.postById.get(parent.post_id),
    parentId: (parent: CommentRow) => parent.parent_id,
    createdAt: (parent: CommentRow) => parent.created_at,
    replies: (parent: CommentRow) => stmts.commentsByParent.all(parent.id),
  },
};
