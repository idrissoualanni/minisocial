import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '@/lib/graphql-client'
import type { Comment } from '@/types'

const GET_COMMENTS = gql`
  query GetComments($postId: ID!) {
    comments(postId: $postId) {
      id
      text
      createdAt
      parentId
      author { id name }
      post { id title }
    }
  }
`

interface GetCommentsData {
  comments: Comment[]
}

export function useComments(postId: string) {
  return useQuery<GetCommentsData>({
    queryKey: ['comments', postId],
    queryFn: () =>
      graphqlClient.request<GetCommentsData>(GET_COMMENTS, { postId }),
    enabled: !!postId,
  })
}
