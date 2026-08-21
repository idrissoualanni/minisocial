import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GraphQLClient } from 'graphql-request'
import { type ReactNode } from 'react'
import { vi } from 'vitest'
import { useMe } from '../useMe'

vi.mock('@/lib/graphql-client', () => ({
  graphqlClient: new GraphQLClient('http://localhost/graphql', {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useMe', () => {
  it('returns current user data', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useMe({ id: 'session-1' }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
      avatar: null,
      bio: null,
      role: 'user',
    })
  })

  it('does not fetch when session is null', () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useMe(null), { wrapper })
    expect(result.current.isPending).toBe(true)
  })
})
