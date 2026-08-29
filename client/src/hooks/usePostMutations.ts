import { useMutation, useQueryClient } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '@/lib/graphql-client'
import type { Post, Comment } from '@/types'

// ─────────────────────────────────────────────────────────────
// Subscription fragments — mêmes champs que ceux demandés par
// les subscriptions Apollo (Feed) pour rester cohérent.
// ─────────────────────────────────────────────────────────────

const POST_BRIEF = `
  id title content imageUrl createdAt
  author { id name }
  comments { id text createdAt parentId author { id name } }
  likeCount
  likes { id }
`

const CREATE_POST = gql`
  mutation CreatePost($title: String!, $content: String!, $imageUrl: String) {
    createPost(title: $title, content: $content, imageUrl: $imageUrl) {
      ${POST_BRIEF}
    }
  }
`

const DELETE_POST = gql`
  mutation DeletePost($id: ID!) {
    deletePost(id: $id)
  }
`

const UPDATE_POST = gql`
  mutation UpdatePost($id: ID!, $title: String, $content: String, $imageUrl: String) {
    updatePost(id: $id, title: $title, content: $content, imageUrl: $imageUrl) {
      id title content imageUrl createdAt
      author { id name }
    }
  }
`

const ADD_COMMENT = gql`
  mutation AddComment($text: String!, $postId: ID!, $parentId: ID) {
    addComment(text: $text, postId: $postId, parentId: $parentId) {
      id text createdAt
      author { id name }
      post { id }
      parentId
    }
  }
`

const TOGGLE_LIKE = gql`
  mutation ToggleLike($postId: ID!) {
    toggleLike(postId: $postId)
  }
`

export interface GetPostsData {
  posts: Post[]
}

// ─────────────────────────────────────────────────────────────
// Mutations — seule source de vérité : le cache TanStack ['posts'].
// Les événements temps réel des AUTRES utilisateurs arrivent via
// les subscriptions Apollo (Feed) qui alimentent le même cache.
// ─────────────────────────────────────────────────────────────

export function useCreatePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { title: string; content: string; imageUrl?: string | null }) =>
      graphqlClient.request<{ createPost: Post }>(CREATE_POST, vars),
    onSuccess: (data) => {
      const newPost = data.createPost
      queryClient.setQueryData<GetPostsData>(['posts'], (prev) => {
        if (!prev) return prev
        return { posts: [newPost, ...prev.posts.filter((p) => p.id !== newPost.id)] }
      })
    },
  })
}

export function useDeletePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      graphqlClient.request<{ deletePost: boolean }>(DELETE_POST, { id }),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<GetPostsData>(['posts'], (prev) => {
        if (!prev) return prev
        return { posts: prev.posts.filter((p) => p.id !== id) }
      })
    },
  })
}

export function useUpdatePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; title: string; content: string; imageUrl?: string | null }) =>
      graphqlClient.request<{ updatePost: Post }>(UPDATE_POST, vars),
    onSuccess: (data) => {
      const updated = data.updatePost
      queryClient.setQueryData<GetPostsData>(['posts'], (prev) => {
        if (!prev) return prev
        return {
          posts: prev.posts.map((p) =>
            p.id === updated.id
              ? { ...p, title: updated.title, content: updated.content, imageUrl: updated.imageUrl }
              : p
          ),
        }
      })
    },
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { text: string; postId: string; parentId?: string | null }) =>
      graphqlClient.request<{ addComment: Comment }>(ADD_COMMENT, vars),
    onSuccess: (data, vars) => {
      const newComment = data.addComment
      queryClient.setQueryData<GetPostsData>(['posts'], (prev) => {
        if (!prev) return prev
        return {
          posts: prev.posts.map((post) => {
            if (post.id !== vars.postId) return post
            if (post.comments.some((c) => c.id === newComment.id)) return post
            return { ...post, comments: [...post.comments, newComment] }
          }),
        }
      })
    },
  })
}

export function useToggleLike(currentUser: { id: string; name: string } | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) =>
      graphqlClient.request<{ toggleLike: boolean }>(TOGGLE_LIKE, { postId }),
    onSuccess: (liked, postId) => {
      if (!currentUser) return
      queryClient.setQueryData<GetPostsData>(['posts'], (prev) => {
        if (!prev) return prev
        return {
          posts: prev.posts.map((p) => {
            if (String(p.id) !== String(postId)) return p
            const already = p.likes.some((u) => String(u.id) === String(currentUser.id))
            return {
              ...p,
              likeCount: liked
                ? (already ? p.likeCount : p.likeCount + 1)
                : (already ? p.likeCount - 1 : p.likeCount),
              likes: liked
                ? (already
                    ? p.likes
                    : [...p.likes, { id: currentUser.id, name: currentUser.name }])
                : p.likes.filter((u) => String(u.id) !== String(currentUser.id)),
            }
          }),
        }
      })
    },
  })
}