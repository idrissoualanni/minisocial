import { createAuthClient } from 'better-auth/react'

const authClient = createAuthClient({
  baseURL: '',
})

export const { signIn, signUp, signOut, useSession } = authClient
export default authClient
