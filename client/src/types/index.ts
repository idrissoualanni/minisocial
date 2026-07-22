// ============================================================
// types/index.ts — Shared TypeScript types for MiniSocial
// ============================================================

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  role?: string;
}

/** User shape returned from the GraphQL users query (includes extra fields) */
export interface GraphUser extends User {
  postCount: number;
  isOnline: boolean;
}

export interface Author {
  id: string;
  name: string;
}

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  parentId: string | null;
  author: Author;
  post: { id: string; title?: string };
}

export interface Post {
  id: string;
  title: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string;
  author: Author;
  comments: Comment[];
  likeCount: number;
  likes: Author[];
}

export interface Message {
  id: string;
  text: string;
  read: boolean;
  createdAt: string;
  sender: Author;
  receiver: Author;
}

export interface ConversationPreview {
  unreadCount: number;
  user: GraphUser;
  lastMessage: Message | null;
}

export interface PendingRequest {
  id: string;
  status: string;
  createdAt: string;
  sender: GraphUser;
  receiver: Author;
}

export interface ChatPermission {
  id: string;
  status: string;
  sender: Author;
  receiver: Author;
}

export interface GroupMember {
  user: { id: string; name: string; isOnline: boolean };
  isCreator: boolean;
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
  creator: Author;
  members: GroupMember[];
}

export interface Meeting {
  id: string;
  title: string;
  isActive: boolean;
  [key: string]: unknown;
}

export interface GroupTarget {
  id: string;
  name: string;
}
