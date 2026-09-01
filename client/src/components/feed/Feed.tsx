// ============================================================
// Feed.jsx — Fil d'actualité avec les posts
// ============================================================

import { gql } from "@apollo/client";
import apolloClient from "@/apollo";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePosts } from "@/hooks/usePosts";
import Composer from "./Composer";
import PostCard from "./PostCard";
import { useNotify } from "../../hooks/useNotifications";
import type { Post, Comment as FeedComment } from "../../types";

const POST_FIELDS_SUB = `
  id title content imageUrl createdAt
  author { id name }
  comments { id text createdAt parentId author { id name } }
  likeCount
  likes { id }
`;

// --- Subscriptions (restent sur Apollo temporairement) ---
const POST_CREATED = gql`
  subscription OnPostCreated {
    postCreated {
      ${POST_FIELDS_SUB}
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

interface GetPostsData {
  posts: Post[];
}

export default function Feed() {
  const { data, isLoading, isError, error } = usePosts();
  const queryClient = useQueryClient();
  const notify = useNotify();

  // --- Abonnement aux nouveaux posts (autres utilisateurs) ---
  useEffect(() => {
    const sub = apolloClient.subscribe<{ postCreated: Post }>({ query: POST_CREATED }).subscribe({
      next: ({ data: subData }) => {
        if (!subData?.postCreated) return;
        const newPost = subData.postCreated;
        queryClient.setQueryData<GetPostsData>(["posts"], (prev) => {
          if (!prev) return prev;
          if (prev.posts.some((p) => p.id === newPost.id)) return prev;
          return { posts: [newPost, ...prev.posts] };
        });
      },
    });
    return () => sub.unsubscribe();
  }, [queryClient]);

  // --- Abonnement aux nouveaux commentaires ---
  useEffect(() => {
    const sub = apolloClient.subscribe<{ commentAdded: FeedComment }>({ query: COMMENT_ADDED }).subscribe({
      next: ({ data: subData }) => {
        if (!subData?.commentAdded) return;
        const newComment = subData.commentAdded;
        const postId = newComment.post.id;

        if (document.hidden) {
          notify(
            "Nouveau commentaire",
            `${newComment.author.name} a commenté "${newComment.post.title}"`
          );
        }

        queryClient.setQueryData<GetPostsData>(["posts"], (prev) => {
          if (!prev) return prev;
          return {
            posts: prev.posts.map((post) => {
              if (post.id !== postId) return post;
              if (post.comments.some((c) => c.id === newComment.id)) return post;
              return { ...post, comments: [...post.comments, newComment] };
            }),
          };
        });
      },
    });
    return () => sub.unsubscribe();
  }, [queryClient, notify]);

  if (isLoading) {
    return (
      <>
        <Composer />
        <div className="flex flex-col gap-5" role="status" aria-label="Chargement des publications">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}
              className="p-6"
              aria-hidden="true"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="skeleton skeleton-avatar" />
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="skeleton skeleton-line" style={{ width: "35%" }} />
                  <div className="skeleton skeleton-line" style={{ width: "18%", height: "10px" }} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="skeleton skeleton-line" style={{ width: "70%" }} />
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line" style={{ width: "45%" }} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }
  if (isError) return (
    <div className="text-center py-12 px-4" style={{ color: "var(--error)" }} role="alert">
      <p>Erreur : {error.message}</p>
    </div>
  );

  const posts = data?.posts || [];

  return (
    <>
      <Composer />
      {posts.length === 0 ? (
        <div className="text-center py-16 px-4" style={{ color: "var(--text-tertiary)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="48" height="48" className="mx-auto mb-4 opacity-40" aria-hidden="true">
            <path d="M12 3a9 9 0 0 1 9 9 9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9z"/>
            <path d="M8 12h8M12 8v8"/>
          </svg>
          <p className="text-[0.95rem] font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Aucune publication pour l'instant</p>
          <p className="text-[0.82rem]">Sois la première personne à partager quelque chose !</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
            />
          ))}
        </div>
      )}
    </>
  );
}
