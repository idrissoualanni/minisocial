// ============================================================
// IncomingCall.jsx — Notification d'appel entrant
// ============================================================

import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "../store";
import type { User } from "@/types";

interface JoinMeetingData {
  joinMeeting: {
    id: string;
    title: string;
    isActive: boolean;
  } | null;
}

interface Invitation {
  meetingId: string;
  fromUser?: { name?: string };
  meetingTitle?: string;
}

interface IncomingCallProps {
  invitation: Invitation | null;
  onDismiss: () => void;
}

const JOIN_MEETING = gql`
  mutation JoinMeeting($meetingId: ID!) {
    joinMeeting(meetingId: $meetingId) {
      id title isActive
    }
  }
`;

export default function IncomingCall({ invitation, onDismiss }: IncomingCallProps) {
  const currentUser = useStore((s) => s.currentUser);
  const openMeeting = useStore((s) => s.openMeeting);
  const showToast = useStore((s) => s.showToast);

  const [joinMeeting] = useMutation<JoinMeetingData>(JOIN_MEETING);

  const handleAccept = async () => {
    if (!invitation) return;
    try {
      const { data } = await joinMeeting({
        variables: { meetingId: invitation.meetingId },
      });
      if (data?.joinMeeting) {
        openMeeting(data.joinMeeting);
        showToast("Appel rejoint !");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erreur inconnue", "error");
    }
    onDismiss();
  };

  const handleDecline = () => {
    showToast("Appel refusé");
    onDismiss();
  };

  if (!invitation) return null;

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-[340px] mx-4 overflow-hidden"
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-xl), 0 0 60px rgba(99,102,241,0.15)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header gradient */}
        <div
          className="py-6 px-5 text-center"
          style={{
            background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
          }}
        >
          <div
            className="w-16 h-16 rounded-full mx-auto mb-3 grid place-items-center text-white text-xl font-bold"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            {invitation.fromUser?.name?.charAt(0) || "?"}
          </div>
          <p className="text-white font-bold text-[1.1rem]">
            {invitation.fromUser?.name || "Utilisateur"}
          </p>
          <p className="text-white/70 text-[0.8rem] mt-1">
            t'appelle pour "{invitation.meetingTitle}"
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-4 p-5">
          <button
            className="flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-150 hover:scale-105"
            style={{
              background: "var(--error)",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: "56px",
              height: "56px",
              fontSize: "1.3rem",
              fontFamily: "inherit",
            }}
            onClick={handleDecline}
            title="Refuser"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
              <line x1="1" y1="1" x2="23" y2="23" strokeWidth="2.5"/>
            </svg>
          </button>
          <button
            className="flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-150 hover:scale-105"
            style={{
              background: "var(--success)",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: "56px",
              height: "56px",
              fontSize: "1.3rem",
              fontFamily: "inherit",
              animation: "callPulse 1.5s infinite",
            }}
            onClick={handleAccept}
            title="Accepter"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </button>
        </div>

        <p className="text-center text-[0.72rem] pb-3" style={{ color: "var(--text-tertiary)" }}>
          Refuser · Accepter
        </p>
      </div>
    </div>
  );
}
