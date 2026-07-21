// ============================================================
// typeDefs — Schéma GraphQL complet
// ============================================================

const typeDefs = `#graphql

  type User {
    id: ID!
    name: String!
    email: String!
    bio: String
    role: String!
    isOnline: Boolean!
    posts: [Post!]!
    postCount: Int!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type Meeting {
    id: ID!
    title: String!
    creator: User!
    participants: [User!]!
    isActive: Boolean!
    createdAt: String
  }

  type CallInvitation {
    meetingId: ID!
    meetingTitle: String!
    fromUser: User!
    toUserId: ID!
  }

  type MeetingSignal {
    type: String!
    fromUserId: ID!
    toUserId: ID!
    meetingId: ID!
    payload: String
  }

  type Post {
    id: ID!
    title: String!
    content: String!
    author: User!
    comments: [Comment!]!
    likeCount: Int!
    likes: [User!]!
    imageUrl: String
    createdAt: String
  }

  type Comment {
    id: ID!
    text: String!
    author: User!
    post: Post!
    parentId: ID
    replies: [Comment!]!
    createdAt: String
  }

  # ---- CHAT ----
  type Message {
    id: ID!
    text: String!
    sender: User!
    receiver: User!
    createdAt: String
    read: Boolean!
  }

  # ---- PERMISSIONS CHAT ----
  type ChatPermission {
    id: ID!
    sender: User!
    receiver: User!
    status: String!
    createdAt: String
    updatedAt: String
  }

  # ---- APERÇU CONVERSATION ----
  type ConversationPreview {
    user: User!
    lastMessage: Message
    unreadCount: Int!
  }

  # ---- RÉSULTAT MESSAGE LU ----
  type MessageReadEvent {
    messageId: ID!
    senderId: ID!
    receiverId: ID!
  }

  # ---- RÉSULTAT LIKE ----
  type LikeEvent {
    postId: ID!
    likeCount: Int!
    userId: ID!
  }

  # ---- TYPING INDICATOR ----
  type TypingEvent {
    userId: ID!
    isTyping: Boolean!
  }

  # ---- GROUP CHAT ----
  type ChatGroup {
    id: ID!
    name: String!
    creator: User!
    members: [GroupMember!]!
    createdAt: String
  }

  type GroupMember {
    user: User!
    isCreator: Boolean!
    joinedAt: String
  }

  type GroupMessage {
    id: ID!
    text: String!
    sender: User!
    group: ChatGroup!
    createdAt: String
  }

  # ---- QUERIES ----
  type Query {
    # Auth
    me: User
    refreshAccessToken(refreshToken: String!): AuthPayload!
    # Users
    posts: [Post!]!
    post(id: ID!): Post
    users: [User!]!
    user(id: ID!): User
    # Chat
    conversation(userId1: ID!, userId2: ID!): [Message!]!
    chatPermission(userId1: ID!, userId2: ID!): ChatPermission
    pendingRequests(userId: ID!): [ChatPermission!]!
    conversationPreviews(userId: ID!): [ConversationPreview!]!
    # Groupes
    myGroups(userId: ID!): [ChatGroup!]!
    groupMessages(groupId: ID!, limit: Int): [GroupMessage!]!
    # Recherche
    search(query: String!): [Post!]!
    # Meetings
    meetings: [Meeting!]!
    meeting(id: ID!): Meeting
  }

  # ---- MUTATIONS ----
  type Mutation {
    # Auth
    register(name: String!, email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    logout(refreshToken: String!): Boolean!
    # Users
    createUser(name: String!, email: String!): User!
    updateUser(id: ID!, name: String, email: String, bio: String): User!
    # Posts
    createPost(title: String!, content: String!, imageUrl: String): Post!
    updatePost(id: ID!, title: String, content: String, imageUrl: String): Post!
    addComment(text: String!, postId: ID!, parentId: ID): Comment!
    deletePost(id: ID!): Boolean!
    toggleLike(postId: ID!): Boolean!
    # Chat privé
    sendMessage(text: String!, receiverId: ID!): Message!
    markAsRead(messageIds: [ID!]!): Boolean!
    setTyping(receiverId: ID!, isTyping: Boolean!): Boolean!
    # Permissions chat
    requestChat(receiverId: ID!): ChatPermission!
    acceptChat(permissionId: ID!): ChatPermission!
    rejectChat(permissionId: ID!): ChatPermission!
    # Présence
    updateLastSeen: Boolean!
    # Groupes
    createGroup(name: String!, memberIds: [ID!]!): ChatGroup!
    addGroupMember(groupId: ID!, userId: ID!): GroupMember!
    removeGroupMember(groupId: ID!, userId: ID!): Boolean!
    sendGroupMessage(text: String!, groupId: ID!): GroupMessage!
    # Meetings
    createMeeting(title: String!, targetUserId: ID): Meeting!
    joinMeeting(meetingId: ID!): Meeting!
    leaveMeeting(meetingId: ID!): Boolean!
    sendMeetingSignal(meetingId: ID!, toUserId: ID!, type: String!, payload: String): Boolean!
  }

  # ---- SUBSCRIPTIONS ----
  type Subscription {
    postCreated: Post!
    commentAdded(postId: ID): Comment!
    messageSent(userId1: ID!, userId2: ID!): Message!
    messageSentToUser(userId: ID!): Message!
    chatPermissionUpdated(userId: ID!): ChatPermission!
    messageRead(userId: ID!): MessageReadEvent!
    likeToggled: LikeEvent!
    userTyping(userId1: ID!, userId2: ID!): TypingEvent!
    groupMessageSent(groupId: ID!): GroupMessage!
    meetingSignal(meetingId: ID!): MeetingSignal!
    meetingUpdated(meetingId: ID!): Meeting!
    meetingInvited(userId: ID!): CallInvitation!
  }
`;

export default typeDefs;
