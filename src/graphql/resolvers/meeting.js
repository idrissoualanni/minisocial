import db from "../../db/index.js";
import { pubsub, EVENTS } from "../pubsub.js";
import { validate, CreateMeetingSchema } from "../../utils/validation.js";

const stmts = {
  userById: db.prepare("SELECT * FROM app_users WHERE id = ?"),

  // --- Meetings ---
  insertMeeting: db.prepare("INSERT INTO meetings (title, creator_id) VALUES (?, ?)"),
  meetingById: db.prepare("SELECT * FROM meetings WHERE id = ?"),
  allMeetings: db.prepare("SELECT * FROM meetings WHERE is_active = 1"),
  insertMeetingParticipant: db.prepare("INSERT OR IGNORE INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)"),
  meetingParticipants: db.prepare("SELECT u.* FROM app_users u JOIN meeting_participants mp ON u.id = mp.user_id WHERE mp.meeting_id = ?"),
  removeMeetingParticipant: db.prepare("DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id = ?"),
};

export default {
  Query: {
    meetings: () => stmts.allMeetings.all(),
    meeting: (_, { id }) => stmts.meetingById.get(id) || null,
  },

  Mutation: {
    createMeeting: (_, args, { user }) => {
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
          },
        });
      }

      return meeting;
    },

    joinMeeting: (_, { meetingId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      stmts.insertMeetingParticipant.run(meetingId, user.id);
      const meeting = stmts.meetingById.get(meetingId);
      pubsub.publish(EVENTS.MEETING_UPDATED, { meetingUpdated: meeting });
      return meeting;
    },

    leaveMeeting: (_, { meetingId }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      stmts.removeMeetingParticipant.run(meetingId, user.id);
      const meeting = stmts.meetingById.get(meetingId);
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

    sendMeetingSignal: (_, { meetingId, toUserId, type, payload }, { user }) => {
      if (!user) throw new Error("Non authentifié");
      pubsub.publish(EVENTS.MEETING_SIGNAL, {
        meetingSignal: {
          meetingId,
          fromUserId: String(user.id),
          toUserId,
          type,
          payload: payload || null,
        },
      });
      return true;
    },
  },

  Subscription: {
    meetingSignal: {
      subscribe: (_, { meetingId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.MEETING_SIGNAL]);
            try {
              for await (const event of iter) {
                if (String(event.meetingSignal.meetingId) === String(meetingId)) yield event;
              }
            } finally {
              iter.return?.();
            }
          },
        };
      },
      resolve: (payload) => payload.meetingSignal,
    },

    meetingUpdated: {
      subscribe: (_, { meetingId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.MEETING_UPDATED]);
            for await (const event of iter) {
              if (String(event.meetingUpdated.id) === String(meetingId)) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.meetingUpdated,
    },

    meetingInvited: {
      subscribe: (_, { userId }) => {
        return {
          [Symbol.asyncIterator]: async function* () {
            const iter = pubsub.subscribe([EVENTS.MEETING_INVITED]);
            for await (const event of iter) {
              if (String(event.meetingInvited.toUserId) === String(userId)) yield event;
            }
          },
        };
      },
      resolve: (payload) => payload.meetingInvited,
    },
  },

  Meeting: {
    creator: (parent) => stmts.userById.get(parent.creator_id),
    participants: (parent) => stmts.meetingParticipants.all(parent.id),
    isActive: (parent) => !!parent.is_active,
    createdAt: (parent) => parent.created_at,
  },
};
