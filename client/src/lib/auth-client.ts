import { createAuthClient } from 'better-auth/client'

const authClient = createAuthClient({
  baseURL: '',
})

export const { signIn, signUp, signOut, useSession } = authClient
export default authClient
