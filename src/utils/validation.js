// src/utils/validation.js
import { z } from "zod";

// --- Auth ---
export const RegisterSchema = z.object({
  name: z.string().min(2, "Le nom doit avoir au moins 2 caractères").max(50),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit avoir au moins 6 caractères").max(128),
});

export const LoginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

// --- Posts ---
export const CreatePostSchema = z.object({
  title: z.string().min(1, "Titre requis").max(120),
  content: z.string().min(1, "Contenu requis").max(5000),
  imageUrl: z.string().nullable().optional(),
});

export const UpdatePostSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120).optional(),
  content: z.string().min(1).max(5000).optional(),
  imageUrl: z.string().nullable().optional(),
});

// --- Comments ---
export const AddCommentSchema = z.object({
  text: z.string().min(1, "Commentaire vide").max(2000),
  postId: z.string().min(1),
  parentId: z.string().nullable().optional(),
});

// --- Chat ---
export const SendMessageSchema = z.object({
  text: z.string().min(1, "Message vide").max(5000),
  receiverId: z.string().min(1),
});

// --- Meetings ---
export const CreateMeetingSchema = z.object({
  title: z.string().min(1).max(100),
});

export const JoinMeetingSchema = z.object({
  meetingId: z.string().min(1),
});

// --- User ---
export const UpdateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  bio: z.string().max(200).optional(),
});

// Helper: lance une erreur GraphQL si la validation échoue
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map((e) => e.message).join(", ");
    throw new Error(msg);
  }
  return result.data;
}
