import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useSubscription, useApolloClient } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "../store";
import MeetingControls from "./MeetingControls";
import type { User } from "@/types";

interface MeetingSignal {
  meetingId: string;
  fromUserId: string;
  toUserId: string;
  type: string;
  payload: string;
}

interface MeetingParticipant {
  id: string;
}

interface MeetingParticipantsData {
  meeting: {
    id: string;
    participants: MeetingParticipant[];
  };
}

interface MeetingUpdatedData {
  meetingUpdated: {
    id: string;
    participants: MeetingParticipant[];
  };
}

interface MeetingSignalData {
  meetingSignal: MeetingSignal;
}

interface RemoteVideoProps {
  userId: string;
  stream: MediaStream;
}

const JOIN_MEETING = gql`
  mutation JoinMeeting($meetingId: ID!) {
    joinMeeting(meetingId: $meetingId) { id }
  }
`;

const LEAVE_MEETING = gql`
  mutation LeaveMeeting($meetingId: ID!) {
    leaveMeeting(meetingId: $meetingId)
  }
`;

const SEND_SIGNAL = gql`
  mutation SendSignal($meetingId: ID!, $toUserId: ID!, $type: String!, $payload: String) {
    sendMeetingSignal(meetingId: $meetingId, toUserId: $toUserId, type: $type, payload: $payload)
  }
`;

const GET_MEETING_PARTICIPANTS = gql`
  query GetMeetingParticipants($id: ID!) {
    meeting(id: $id) { id participants { id } }
  }
`;

const SIGNAL_SUB = gql`
  subscription OnMeetingSignal($meetingId: ID!) {
    meetingSignal(meetingId: $meetingId) {
      meetingId fromUserId toUserId type payload
    }
  }
`;

const MEETING_UPDATED_SUB = gql`
  subscription OnMeetingUpdated($meetingId: ID!) {
    meetingUpdated(meetingId: $meetingId) {
      id participants { id }
    }
  }
`;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceTransportPolicy: "all",
};

export default function Meeting() {
  const meeting = useStore((s) => s.meetingTarget);
  const currentUser = useStore((s) => s.currentUser);
  const showToast = useStore((s) => s.showToast);
  const setView = useStore((s) => s.setView);

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCamOff, setIsCamOff] = useState<boolean>(false);
  const [peers, setPeers] = useState<Map<string, MediaStream>>(new Map());

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const iceBufferRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const joinedRef = useRef<boolean>(false);

  const apolloClient = useApolloClient();
  const [leaveMeeting] = useMutation(LEAVE_MEETING);
  const [sendSignal] = useMutation(SEND_SIGNAL);
  const [joinMeeting] = useMutation(JOIN_MEETING);

  const createPeer = useCallback((remoteUserId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current[remoteUserId] = pc;

    localStreamRef.current?.getTracks().forEach((track) => {
      if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
    });

    pc.ontrack = (e) => {
      setPeers((prev) => new Map(prev).set(remoteUserId, e.streams[0]));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && meeting?.id) {
        sendSignal({
          variables: {
            meetingId: meeting.id,
            toUserId: remoteUserId,
            type: "ice-candidate",
            payload: JSON.stringify(e.candidate),
          },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.iceConnectionState)) {
        pc.close();
        delete pcsRef.current[remoteUserId];
        setPeers((prev) => {
          const next = new Map(prev);
          next.delete(remoteUserId);
          return next;
        });
      }
    };

    const buffered = iceBufferRef.current[remoteUserId];
    if (buffered) {
      buffered.forEach((c) =>
        pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
      );
      delete iceBufferRef.current[remoteUserId];
    }

    return pc;
  }, [meeting?.id, sendSignal]);

  const createOfferFor = useCallback(
    async (remoteUserId: string) => {
      if (pcsRef.current[remoteUserId]) return;
      if (!meeting?.id) return;
      const pc = createPeer(remoteUserId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({
        variables: {
          meetingId: meeting.id,
          toUserId: remoteUserId,
          type: "offer",
          payload: JSON.stringify(offer),
        },
      });
    },
    [createPeer, meeting?.id, sendSignal]
  );

  useEffect(() => {
    if (!meeting?.id || !currentUser?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        await joinMeeting({ variables: { meetingId: meeting.id } });
        if (cancelled) return;

        const { data } = await apolloClient.query<MeetingParticipantsData>({
          query: GET_MEETING_PARTICIPANTS,
          variables: { id: meeting.id },
          fetchPolicy: "network-only",
        });
        if (cancelled || !data?.meeting?.participants) return;

        const selfId = String(currentUser!.id);
        const others = data.meeting.participants.filter(
          (p: MeetingParticipant) => String(p.id) !== selfId
        );
        for (const p of others) {
          if (cancelled) break;
          await createOfferFor(String(p.id));
        }
      } catch (err) {
        if (!cancelled)
          showToast("Impossible d'acceder a la camera/micro", "error");
      }
    })();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
    };
  }, [meeting?.id, currentUser?.id, joinMeeting, apolloClient, createOfferFor, showToast]);

  useSubscription<MeetingUpdatedData>(MEETING_UPDATED_SUB, {
    variables: { meetingId: meeting?.id },
    skip: !meeting?.id,
    onData: ({ data: { data } }) => {
      const updated = data?.meetingUpdated;
      if (!updated) return;
      const selfId = String(currentUser!.id);
      updated.participants.forEach((p: MeetingParticipant) => {
        const pid = String(p.id);
        if (pid !== selfId && !pcsRef.current[pid]) {
          createOfferFor(pid);
        }
      });
    },
  });

  useSubscription<MeetingSignalData>(SIGNAL_SUB, {
    variables: { meetingId: meeting?.id },
    skip: !meeting?.id,
    onData: async ({ data: { data } }) => {
      try {
        const sig = data?.meetingSignal;
        if (!sig || sig.fromUserId === String(currentUser!.id)) return;
        if (sig.toUserId !== String(currentUser!.id)) return;
        if (!meeting?.id) return;

        if (sig.type === "offer") {
          const pc = createPeer(sig.fromUserId);
          await pc.setRemoteDescription(
            new RTCSessionDescription(JSON.parse(sig.payload))
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({
            variables: {
              meetingId: meeting.id,
              toUserId: sig.fromUserId,
              type: "answer",
              payload: JSON.stringify(answer),
            },
          });
        } else if (sig.type === "answer") {
          const pc = pcsRef.current[sig.fromUserId];
          if (pc) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(JSON.parse(sig.payload))
            );
          }
        } else if (sig.type === "ice-candidate") {
          const candidate = JSON.parse(sig.payload);
          const pc = pcsRef.current[sig.fromUserId];
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            if (!iceBufferRef.current[sig.fromUserId]) {
              iceBufferRef.current[sig.fromUserId] = [];
            }
            iceBufferRef.current[sig.fromUserId].push(candidate);
          }
        }
      } catch (err) {
        console.error("Signal handler error:", err);
      }
    },
  });

  const handleHangup = async () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    Object.values(pcsRef.current).forEach((pc) => pc.close());
    pcsRef.current = {};
    if (meeting?.id) await leaveMeeting({ variables: { meetingId: meeting.id } });
    setView("feed");
    showToast("Reunion terminee");
  };

  const toggleMic = () => {
    localStreamRef.current
      ?.getAudioTracks()
      .forEach((t) => {
        t.enabled = isMuted;
      });
    setIsMuted(!isMuted);
  };

  const toggleCam = () => {
    localStreamRef.current
      ?.getVideoTracks()
      .forEach((t) => {
        t.enabled = isCamOff;
      });
    setIsCamOff(!isCamOff);
  };

  if (!meeting) return null;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">{String(meeting.title)}</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <p className="text-white text-sm p-2">Toi ({currentUser!.name})</p>
        </div>
        {Array.from(peers.entries()).map(([userId, stream]) => (
          <RemoteVideo key={userId} userId={userId} stream={stream} />
        ))}
      </div>
      <MeetingControls
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onHangup={handleHangup}
        isMuted={isMuted}
        isCamOff={isCamOff}
      />
    </div>
  );
}

function RemoteVideo({ userId, stream }: RemoteVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video">
      <video
        ref={ref}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <p className="text-white text-sm p-2">Utilisateur #{userId}</p>
    </div>
  );
}
