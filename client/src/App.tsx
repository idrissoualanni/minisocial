// client/src/App.tsx
import { useSubscription } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "./store";
import { useSession, signOut } from "./lib/auth-client";
import { useMe } from "./hooks/useMe";
import Header from "./components/layout/Header";
import Feed from "./components/feed/Feed";
import ChatLobby from "./components/chat/ChatLobby";
import Chat from "./components/chat/Chat";
import GroupChat from "./components/chat/GroupChat";
import Profile from "./components/profile/Profile";
import Search from "./components/search/Search";
import Toast from "./components/shared/Toast";
import Meeting from "./components/meeting/Meeting";
import IncomingCall from "./components/meeting/IncomingCall";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import { useEffect, useState } from "react";
import { useNotificationSetup } from "./hooks/useNotifications";
import { useHeartbeat } from "./hooks/useHeartbeat";
import useSystemNotifications from "./hooks/useSystemNotifications";

interface IncomingCall {
  meetingId: string;
  meetingTitle: string;
  fromUser?: { id: string; name: string };
  toUserId: string;
}

const MEETING_INVITED_SUB = gql`
  subscription OnMeetingInvited($userId: ID!) {
    meetingInvited(userId: $userId) {
      meetingId meetingTitle
      fromUser { id name }
      toUserId
    }
  }
`;

export default function App() {
  const { data: session, isPending } = useSession();
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const view = useStore((s) => s.view);
  const chatTarget = useStore((s) => s.chatTarget);
  const groupTarget = useStore((s) => s.groupTarget);
  const profileUser = useStore((s) => s.profileUser);
  const meetingTarget = useStore((s) => s.meetingTarget);

  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  // Fetch full user data from our app_users via TanStack Query
  const { data: currentUser } = useMe(session);

  // Sync currentUser into Zustand store so child components can access it
  useEffect(() => {
    setCurrentUser(currentUser ?? null);
  }, [currentUser, setCurrentUser]);

  // Clear store on logout
  useEffect(() => {
    if (!session && !isPending) {
      setCurrentUser(null);
    }
  }, [session, isPending, setCurrentUser]);

  useNotificationSetup();
  useHeartbeat(currentUser ?? null);
  useSystemNotifications();

  // --- Subscription appel entrant ---
  useSubscription<{ meetingInvited: IncomingCall }>(MEETING_INVITED_SUB, {
    variables: { userId: currentUser?.id },
    skip: !currentUser,
    onData: ({ data: { data } }) => {
      const inv = data?.meetingInvited;
      if (!inv) return;
      if (String(inv.fromUser?.id) === String(currentUser?.id)) return;
      if (view === "meeting") return;
      setIncomingCall(inv);
    },
  });

  // --- Loading state ---
  if (isPending) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p>Chargement...</p>
        </div>
        <Toast />
      </div>
    );
  }

  // --- Non authentifié ---
  if (!session) {
    return (
      <>
        {authView === "login" ? (
          <LoginPage onSwitchToRegister={() => setAuthView("register")} />
        ) : (
          <RegisterPage onSwitchToLogin={() => setAuthView("login")} />
        )}
        <Toast />
      </>
    );
  }

  // --- Authentifié ---
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-['Inter',-apple-system,BlinkMacSystemFont,sans-serif]">
      <Header user={currentUser} onSignOut={signOut} />

      {view === "feed" && (
        <div className="max-w-[720px] mx-auto p-6">
          <main className="min-w-0"><Feed /></main>
        </div>
      )}

      {view === "search" && (
        <div className="max-w-[720px] mx-auto p-6">
          <main className="min-w-0"><Search /></main>
        </div>
      )}

      {view === "chat" && (
        <div className="max-w-[720px] mx-auto p-6 h-[calc(100dvh-60px)] max-[860px]:p-4">
          {groupTarget ? <GroupChat /> : chatTarget ? <Chat /> : <ChatLobby />}
        </div>
      )}

      {view === "profile" && profileUser && <Profile />}
      {view === "meeting" && meetingTarget && <Meeting />}

      <Toast />
      {incomingCall && (
        <IncomingCall
          invitation={incomingCall}
          onDismiss={() => setIncomingCall(null)}
        />
      )}
    </div>
  );
}
