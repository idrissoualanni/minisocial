import db from "../../db/index.js";
import { pubsub, EVENTS } from "../pubsub.js";
import natural from "natural";

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
    posts: () => stmts.allPosts.all(),
    post: (_, { id }) => stmts.postById.get(id) || null,

    search: (_, { query }) => {
      const allPosts = stmts.allPosts.all();
      if (allPosts.length === 0) return [];

      const tokenizer = new natural.WordTokenizer();
      const stemmer = natural.PorterStemmerFr;
      const tfidf = new natural.TfIdf();

      const stripDiacritics = (str) =>
        str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const processText = (text) => {
        const lower = stripDiacritics(text.toLowerCase());
        const tokens = tokenizer.tokenize(lower);
        return tokens.map((t) => stemmer.stem(t)).join(" ");
      };

      allPosts.forEach((post) => {
        const author = stmts.userById.get(post.author_id);
        const fullText = `${post.title} ${post.content} ${author ? author.name : ""}`;
        tfidf.addDocument(processText(fullText));
      });

      const searchStr = processText(query);
      const scores = [];
      tfidf.tfidfs(searchStr, (i, measure) => {
        if (measure > 0) scores.push({ index: i, score: measure });
      });
      scores.sort((a, b) => b.score - a.score);
      return scores.map((s) => allPosts[s.index]);
    },
  },

  Mutation: {
    createPost: (_, { title, content, imageUrl }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const result = stmts.insertPost.run(title, content, user.id, imageUrl || null);
      const newPost = stmts.postById.get(result.lastInsertRowid);
      pubsub.publish(EVENTS.POST_CREATED, { postCreated: newPost });
      return newPost;
    },

    updatePost: (_, { id, title, content, imageUrl }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const post = stmts.postById.get(id);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (post.author_id !== user.id) {
        throw new Error("Vous ne pouvez modifier que vos propres posts.");
      }
      db.prepare("UPDATE posts SET title = ?, content = ?, image_url = ? WHERE id = ?").run(
        title || post.title, content || post.content,
        imageUrl !== undefined ? imageUrl : post.image_url,
        id
      );
      return stmts.postById.get(id);
    },

    deletePost: (_, { id }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const post = stmts.postById.get(id);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (post.author_id !== user.id) {
        throw new Error("Vous ne pouvez supprimer que vos propres posts.");
      }
      db.prepare("DELETE FROM posts WHERE id = ?").run(id);
      return true;
    },

    addComment: (_, { text, postId, parentId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const post = stmts.postById.get(postId);
      if (!post) throw new Error("Ce post n'existe pas.");
      if (parentId) {
        const parent = db.prepare("SELECT * FROM comments WHERE id = ?").get(parentId);
        if (!parent) throw new Error("Le commentaire parent n'existe pas.");
      }
      const result = stmts.insertComment.run(text, user.id, postId, parentId || null);
      const newComment = db.prepare("SELECT * FROM comments WHERE id = ?").get(result.lastInsertRowid);
      pubsub.publish(EVENTS.COMMENT_ADDED, { commentAdded: newComment });
      return newComment;
    },

    toggleLike: (_, { postId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      const existing = stmts.hasLiked.get(user.id, postId);
      if (existing) {
        stmts.toggleLikeOff.run(user.id, postId);
      } else {
        stmts.toggleLikeOn.run(user.id, postId);
      }
      const count = stmts.likeCount.get(postId).count;
      pubsub.publish(EVENTS.LIKE_TOGGLED, {
        likeToggled: { postId: String(postId), likeCount: count, userId: String(user.id) },
      });
      return !existing;
    },
  },

  Subscription: {
    postCreated: {
      subscribe: () => pubsub.subscribe([EVENTS.POST_CREATED]),
    },
    commentAdded: {
      subscribe: (_, { postId }) => {
        if (postId) {
          return {
            [Symbol.asyncIterator]: async function* () {
              const iter = pubsub.subscribe([EVENTS.COMMENT_ADDED]);
              for await (const event of iter) {
                if (String(event.commentAdded.post_id) === String(postId)) yield event;
              }
            },
          };
        }
        return pubsub.subscribe([EVENTS.COMMENT_ADDED]);
      },
      resolve: (payload) => payload.commentAdded,
    },
    likeToggled: {
      subscribe: () => pubsub.subscribe([EVENTS.LIKE_TOGGLED]),
      resolve: (payload) => payload.likeToggled,
    },
  },

  Post: {
    author: (parent) => stmts.userById.get(parent.author_id),
    comments: (parent) => stmts.commentsByPost.all(parent.id),
    likeCount: (parent) => stmts.likeCount.get(parent.id).count,
    likes: (parent) => stmts.likedUsers.all(parent.id),
    imageUrl: (parent) => parent.image_url || null,
    createdAt: (parent) => parent.created_at,
  },

  Comment: {
    author: (parent) => stmts.userById.get(parent.author_id),
    post: (parent) => stmts.postById.get(parent.post_id),
    parentId: (parent) => parent.parent_id,
    createdAt: (parent) => parent.created_at,
    replies: (parent) => stmts.commentsByParent.all(parent.id),
  },
};
