import type { Context } from "../context.js";
import type { AppUser } from "../../db/index.js";
import db from "../../db/index.js";
import { pubsub, EVENTS } from "../pubsub.js";
import { validate, CreateMeetingSchema } from "../../utils/validation.js";

const stmts = {
  userById: db.prepare("SELECT * FROM app_users WHERE id = ?"),

  insertMeeting: db.prepare("INSERT INTO meetings (title, creator_id) VALUES (?, ?)"),
  meetingById: db.prepare("SELECT * FROM meetings WHERE id = ?"),
  allMeetings: db.prepare("SELECT * FROM meetings WHERE is_active = 1"),
  insertMeetingParticipant: db.prepare("INSERT OR IGNORE INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)"),
  meetingParticipants: db.prepare("SELECT u.* FROM app_users u JOIN meeting_participants mp ON u.id = mp.user_id WHERE mp.meeting_id = ?"),
  removeMeetingParticipant: db.prepare("DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id = ?"),
};

interface MeetingResult {
  id: number;
  title: string;
  creator_id: number;
  is_active: number;
  created_at: string;
}

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
    meetings: () => stmts.allMeetings.all(),
    meeting: (_: unknown, { id }: { id: string }) => stmts.meetingById.get(id) || null,
  },

  Mutation: {
    createMeeting: (_: unknown, args: { title: string; targetUserId?: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      const data = validate(CreateMeetingSchema, { title: args.title });
      const result = stmts.insertMeeting.run(data.title, user.id);
      const meetingId = result.lastInsertRowid;
      stmts.insertMeetingParticipant.run(meetingId, user.id);
      const meeting = stmts.meetingById.get(meetingId);

      if (args.targetUserId) {
        const fromUser = stmts.userById.get(user.id);
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

    joinMeeting: (_: unknown, { meetingId }: { meetingId: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      stmts.insertMeetingParticipant.run(meetingId, user.id);
      const meeting = stmts.meetingById.get(meetingId) as MeetingResult | undefined;
      pubsub.publish(EVENTS.MEETING_UPDATED, { meetingUpdated: meeting });
      return meeting;
    },

    leaveMeeting: (_: unknown, { meetingId }: { meetingId: string }, { user }: Context) => {
      if (!user) throw new Error("Non authentifié");
      stmts.removeMeetingParticipant.run(meetingId, user.id);
      const meeting = stmts.meetingById.get(meetingId) as MeetingResult | undefined;
      if (meeting) {
        const remaining = stmts.meetingParticipants.all(meetingId);
        if (remaining.length === 0) {
          db.prepare("UPDATE meetings SET is_active = 0 WHERE id = ?").run(meetingId);
          meeting.is_active = 0;
        }
        pubsub.publish(EVENTS.MEETING_UPDATED, { meetingUpdated: meeting });
      }
      return true;
    },

    sendMeetingSignal: (_: unknown, { meetingId, toUserId, type, payload }: { meetingId: string; toUserId: string; type: string; payload?: unknown }, { user }: Context) => {
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
    creator: (parent: { creator_id: number }) => stmts.userById.get(parent.creator_id),
    participants: (parent: { id: number }) => stmts.meetingParticipants.all(parent.id),
    isActive: (parent: { is_active: number }) => !!parent.is_active,
    createdAt: (parent: { created_at: string }) => parent.created_at,
  },
};
