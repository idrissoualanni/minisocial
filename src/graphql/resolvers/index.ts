import user from "./user.js";
import post from "./post.js";
import chat from "./chat.js";
import group from "./group.js";
import meeting from "./meeting.js";
import follow from "./follow.js";

function mergeResolverObjects(sources: any[], key: string): Record<string, any> | undefined {
  const merged: Record<string, any> = {};
  for (const src of sources) {
    if (src[key]) {
      Object.assign(merged, src[key]);
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

const sources = [user, post, chat, group, meeting, follow];

const resolvers = {
  Query: mergeResolverObjects(sources, "Query"),
  Mutation: mergeResolverObjects(sources, "Mutation"),
  Subscription: mergeResolverObjects(sources, "Subscription"),
  Post: mergeResolverObjects(sources, "Post"),
  Comment: mergeResolverObjects(sources, "Comment"),
  User: mergeResolverObjects(sources, "User"),
  Message: mergeResolverObjects(sources, "Message"),
  ChatPermission: mergeResolverObjects(sources, "ChatPermission"),
  ConversationPreview: mergeResolverObjects(sources, "ConversationPreview"),
  ChatGroup: mergeResolverObjects(sources, "ChatGroup"),
  GroupMember: mergeResolverObjects(sources, "GroupMember"),
  GroupMessage: mergeResolverObjects(sources, "GroupMessage"),
  Meeting: mergeResolverObjects(sources, "Meeting"),
};

export default resolvers;
