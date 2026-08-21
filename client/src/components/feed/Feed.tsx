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

  if (isLoading) return <div className="text-center py-12 px-4" style={{ color: "var(--text-tertiary)" }}><p>Chargement...</p></div>;
  if (isError) return <div className="text-center py-12 px-4" style={{ color: "var(--error)" }}><p>Erreur: {error.message}</p></div>;

  return (
    <>
      <Composer />
      <div className="flex flex-col gap-5">
        {data?.posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
          />
        ))}
      </div>
    </>
  );
}
