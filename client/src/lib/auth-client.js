// client/src/lib/auth-client.js
import { createAuthClient } from "better-auth/react";

// En dev, Vite proxy /api/auth → localhost:4000/api/auth
// En prod, le serveur sert tout depuis le même port
export const authClient = createAuthClient();

export const { signIn, signUp, useSession, signOut } = authClient;
