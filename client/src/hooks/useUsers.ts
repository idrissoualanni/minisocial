import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '@/lib/graphql-client'
import type { GraphUser } from '@/types'

const GET_USERS = gql`
  query GetUsers {
    users {
      id
      name
      email
      postCount
      isOnline
    }
  }
`

interface GetUsersData {
  users: GraphUser[]
}

export function useUsers() {
  return useQuery<GetUsersData>({
    queryKey: ['users'],
    queryFn: () => graphqlClient.request<GetUsersData>(GET_USERS),
  })
}
