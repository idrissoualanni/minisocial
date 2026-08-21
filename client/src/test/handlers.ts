import { http, HttpResponse } from 'msw'

export const handlers = [
  http.post('*/graphql', async ({ request }) => {
    const body = (await request.json()) as {
      operationName?: string
      query?: string
    }
    const operationName =
      body.operationName ??
      body.query?.match(/query\s+(\w+)/)?.[1]

    switch (operationName) {
      case 'GetMe':
        return HttpResponse.json({
          data: {
            me: {
              id: '1',
              name: 'Test User',
              email: 'test@example.com',
              avatar: null,
              bio: null,
              role: 'user',
            },
          },
        })

      case 'GetPosts':
        return HttpResponse.json({
          data: {
            posts: [],
          },
        })

      case 'GetUsers':
        return HttpResponse.json({
          data: {
            users: [],
          },
        })

      default:
        return HttpResponse.json({
          errors: [{ message: 'Unknown operation' }],
        })
    }
  }),
]
