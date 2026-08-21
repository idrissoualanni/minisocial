import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '@/lib/graphql-client'
import type { Group } from '@/types'

const GET_MY_GROUPS = gql`
  query MyGroups($userId: ID!) {
    myGroups(userId: $userId) {
      id name createdAt
      creator { id name }
      members { user { id name isOnline } isCreator }
    }
  }
`

interface MyGroupsData {
  myGroups: Group[]
}

export function useGroups(userId: string | undefined) {
  return useQuery<MyGroupsData>({
    queryKey: ['groups', userId],
    queryFn: () =>
      graphqlClient.request<MyGroupsData>(GET_MY_GROUPS, { userId }),
    enabled: !!userId,
  })
}
