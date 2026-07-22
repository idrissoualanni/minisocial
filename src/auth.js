// src/auth.js — Better Auth configuration
import { betterAuth } from "better-auth";
import db from "./db/index.js";

export const auth = betterAuth({
  database: db,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:4000",
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      last_seen: {
        type: "string",
        required: false,
        defaultValue: () => new Date().toISOString(),
      },
      bio: {
        type: "string",
        required: false,
        defaultValue: "",
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,      // refresh every 24h
  },
  trustedOrigins: [
    "http://localhost:5173",
    "http://localhost:4000",
  ],
  advanced: {
    cookiePrefix: "minisocial",
  },
});
