// ============================================================
// Feed.jsx — Fil d'actualité avec les posts
// ============================================================

import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useEffect } from "react";
import Composer from "./Composer";
import PostCard from "./PostCard";
import { useNotify } from "../hooks/useNotifications";

const POST_FIELDS = `
  id title content imageUrl createdAt
  author { id name }
  comments { id text createdAt parentId author { id name } }
  likeCount
  likes { id }
`;

// --- Query ---
export const GET_POSTS = gql`
  query GetPosts {
    posts {
      ${POST_FIELDS}
    }
  }
`;

// --- Subscriptions ---
const POST_CREATED = gql`
  subscription OnPostCreated {
    postCreated {
      ${POST_FIELDS}
    }
  }
`;

const COMMENT_ADDED = gql`
  subscription OnCommentAdded {
    commentAdded {
      id text createdAt parentId
      author { id name }
      post { id title }
    }
  }
`;

export default function Feed() {
  const { data, loading, error, subscribeToMore, client } = useQuery(GET_POSTS);
  const notify = useNotify();

  // --- Abonnement aux nouveaux posts (autres utilisateurs) ---
  useEffect(() => {
    const unsubscribe = subscribeToMore({
      document: POST_CREATED,
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;
        const newPost = subscriptionData.data.postCreated;
        if (prev.posts.some((p) => p.id === newPost.id)) return prev;
        return { ...prev, posts: [newPost, ...prev.posts] };
      },
    });
    return () => unsubscribe();
  }, [subscribeToMore]);

  // --- Abonnement aux nouveaux commentaires ---
  useEffect(() => {
    const unsubscribe = subscribeToMore({
      document: COMMENT_ADDED,
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;
        const newComment = subscriptionData.data.commentAdded;
        const postId = newComment.post.id;

        if (document.hidden) {
          notify(
            "Nouveau commentaire",
            `${newComment.author.name} a commenté "${newComment.post.title}"`
          );
        }

        return {
          ...prev,
          posts: prev.posts.map((post) => {
            if (post.id !== postId) return post;
            if (post.comments.some((c) => c.id === newComment.id)) return post;
            return { ...post, comments: [...post.comments, newComment] };
          }),
        };
      },
    });
    return () => unsubscribe();
  }, [subscribeToMore, notify]);

  if (loading) return <div className="text-center py-12 px-4" style={{ color: "var(--text-tertiary)" }}><p>Chargement...</p></div>;
  if (error) return <div className="text-center py-12 px-4" style={{ color: "var(--error)" }}><p>Erreur: {error.message}</p></div>;

  return (
    <>
      <Composer />
      <div className="flex flex-col gap-5">
        {data.posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
          />
        ))}
      </div>
    </>
  );
}
