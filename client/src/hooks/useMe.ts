import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '@/lib/graphql-client'

interface Me {
  id: string
  name: string
  email: string
  role: string
  bio: string | null
}

const GET_ME = gql`
  query GetMe {
    me {
      id
      name
      email
      role
      bio
    }
  }
`

export function useMe(session: unknown) {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: () =>
      graphqlClient
        .request<{ me: Me | null }>(GET_ME)
        .then((res) => res.me),
    enabled: !!session,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
