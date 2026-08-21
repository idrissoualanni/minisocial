import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '@/lib/graphql-client'
import type { Post } from '@/types'

const POST_FIELDS = `
  id title content imageUrl createdAt
  author { id name }
  comments { id text createdAt parentId author { id name } }
  likeCount
  likes { id }
`

const GET_POSTS = gql`
  query GetPosts {
    posts {
      ${POST_FIELDS}
    }
  }
`

interface GetPostsData {
  posts: Post[]
}

export function usePosts() {
  return useQuery<GetPostsData>({
    queryKey: ['posts'],
    queryFn: () => graphqlClient.request<GetPostsData>(GET_POSTS),
  })
}
