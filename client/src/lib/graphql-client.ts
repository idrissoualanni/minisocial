import { GraphQLClient } from 'graphql-request'
import { API_BASE } from '@/config'

export const graphqlClient = new GraphQLClient(`${API_BASE}/graphql`, {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
})
