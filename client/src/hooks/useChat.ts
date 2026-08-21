import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '@/lib/graphql-client'
import type { Message, ChatPermission } from '@/types'

const GET_CONVERSATION = gql`
  query GetConversation($userId1: ID!, $userId2: ID!) {
    conversation(userId1: $userId1, userId2: $userId2) {
      id text read createdAt
      sender { id name }
      receiver { id name }
    }
  }
`

const GET_CHAT_PERMISSION = gql`
  query GetPermission($userId1: ID!, $userId2: ID!) {
    chatPermission(userId1: $userId1, userId2: $userId2) {
      id status
      sender { id name }
      receiver { id name }
    }
  }
`

interface ConversationData {
  conversation: Message[]
}

interface PermissionData {
  chatPermission: ChatPermission | null
}

export function useConversation(userId1: string | undefined, userId2: string | undefined) {
  return useQuery<ConversationData>({
    queryKey: ['conversation', userId1, userId2],
    queryFn: () =>
      graphqlClient.request<ConversationData>(GET_CONVERSATION, { userId1, userId2 }),
    enabled: !!userId1 && !!userId2,
  })
}

export function useChatPermission(userId1: string | undefined, userId2: string | undefined) {
  return useQuery<PermissionData>({
    queryKey: ['chatPermission', userId1, userId2],
    queryFn: () =>
      graphqlClient.request<PermissionData>(GET_CHAT_PERMISSION, { userId1, userId2 }),
    enabled: !!userId1 && !!userId2,
  })
}
