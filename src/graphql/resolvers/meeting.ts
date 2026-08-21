import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import { db } from "../../db/drizzle-client.js";
import { appUsers, meetings, meetingParticipants } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { pubsub, EVENTS } from "../pubsub.js";
import { validate, CreateMeetingSchema } from "../../utils/validation.js";

interface MeetingInvitedEvent {
  meetingId: string;
  meetingTitle: string;
  fromUser: AppUser;
  toUserId: string;
}

interface MeetingSignalEvent {
  meetingId: string;
  fromUserId: string;
  toUserId: string;
  type: string;
  payload: unknown;
}

export default {
  Query: {
    meetings: async () => {
      return await db.select().from(meetings).where(eq(meetings.isActive, 1));
    },
    meeting: async (_: unknown, { id }: { id: string }) => {
      const result = await db.select().from(meetings).where(eq(meetings.id, Number(id))).then((r) => r[0]);
      return result || null;
    },
  },

  Mutation: {
    createMeeting: async (_: unknown, args: { title: string; targetUserId?: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      const data = validate(CreateMeetingSchema, { title: args.title });
      const [newMeeting] = await db
        .insert(meetings)
        .values({ title: data.title, creatorId: user.id })
        .returning();
      const meetingId = newMeeting.id;
      await db
        .insert(meetingParticipants)
        .values({ meetingId, userId: user.id })
        .onConflictDoNothing();
      const meeting = await db.select().from(meetings).where(eq(meetings.id, meetingId)).then((r) => r[0]);

      if (args.targetUserId) {
        const fromUser = await db.select().from(appUsers).where(eq(appUsers.id, user.id)).then((r) => r[0]);
        pubsub.publish(EVENTS.MEETING_INVITED, {
          meetingInvited: {
            meetingId: String(meetingId),
            meetingTitle: data.title,
            fromUser,
            toUserId: String(args.targetUserId),
          } as MeetingInvitedEvent,
        });
      }

      return meeting;
    },

    joinMeeting: async (_: unknown, { meetingId }: { meetingId: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      await db
        .insert(meetingParticipants)
        .values({ meetingId: Number(meetingId), userId: user.id })
        .onConflictDoNothing();
      const meeting = await db.select().from(meetings).where(eq(meetings.id, Number(meetingId))).then((r) => r[0]);
      pubsub.publish(EVENTS.MEETING_UPDATED, { meetingUpdated: meeting });
      return meeting;
    },

    leaveMeeting: async (_: unknown, { meetingId }: { meetingId: string }, { user }: Context): Promise<boolean> => {
      if (!user) throw new Error("Non authentifié");
      await db
        .delete(meetingParticipants)
        .where(and(eq(meetingParticipants.meetingId, Number(meetingId)), eq(meetingParticipants.userId, user.id)));
      const meeting = await db.select().from(meetings).where(eq(meetings.id, Number(meetingId))).then((r) => r[0]);
      if (meeting) {
        const remaining = await db
          .select()
          .from(meetingParticipants)
          .where(eq(meetingParticipants.meetingId, Number(meetingId)));
        if (remaining.length === 0) {
          await db.update(meetings).set({ isActive: 0 }).where(eq(meetings.id, Number(meetingId)));
          meeting.isActive = 0;
        }
        pubsub.publish(EVENTS.MEETING_UPDATED, { meetingUpdated: meeting });
      }
      return true;
    },

    sendMeetingSignal: async (
      _: unknown,
      { meetingId, toUserId, type, payload }: { meetingId: string; toUserId: string; type: string; payload?: unknown },
      { user }: Context
    ): Promise<boolean> => {
      if (!user) throw new Error("Non authentifié");
      pubsub.publish(EVENTS.MEETING_SIGNAL, {
        meetingSignal: {
          meetingId,
          fromUserId: String(user.id),
          toUserId,
          type,
          payload: payload || null,
        } as MeetingSignalEvent,
      });
      return true;
    },
  },

  Subscription: {
    meetingSignal: {
      subscribe: (_: unknown, { meetingId }: { meetingId: string }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.MEETING_SIGNAL]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              if (String(event.meetingSignal.meetingId) === String(meetingId)) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.meetingSignal,
    },

    meetingUpdated: {
      subscribe: (_: unknown, { meetingId }: { meetingId: string }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.MEETING_UPDATED]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              if (String(event.meetingUpdated.id) === String(meetingId)) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.meetingUpdated,
    },

    meetingInvited: {
      subscribe: (_: unknown, { userId }: { userId: string }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.asyncIterableIterator([EVENTS.MEETING_INVITED]) as AsyncIterableIterator<any>;
            for await (const event of iter) {
              if (String(event.meetingInvited.toUserId) === String(userId)) yield event;
            }
          },
        };
      },
      resolve: (payload: any) => payload.meetingInvited,
    },
  },

  Meeting: {
    creator: async (parent: any) => {
      return await db.select().from(appUsers).where(eq(appUsers.id, parent.creatorId || parent.creator_id)).then((r) => r[0]);
    },
    participants: async (parent: any) => {
      return await db
        .select({
          id: appUsers.id,
          name: appUsers.name,
          email: appUsers.email,
          lastSeen: appUsers.lastSeen,
          baUserId: appUsers.baUserId,
          createdAt: appUsers.createdAt,
          bio: appUsers.bio,
        })
        .from(appUsers)
        .innerJoin(meetingParticipants, eq(appUsers.id, meetingParticipants.userId))
        .where(eq(meetingParticipants.meetingId, parent.id));
    },
    isActive: (parent: any) => !!parent.isActive,
    createdAt: (parent: any) => parent.createdAt,
  },
};
