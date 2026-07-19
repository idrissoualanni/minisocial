// client/src/App.jsx
import { useQuery, useSubscription } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "./store";
import Header from "./components/Header";
import Feed from "./components/Feed";
import ChatLobby from "./components/ChatLobby";
import Chat from "./components/Chat";
import GroupChat from "./components/GroupChat";
import Profile from "./components/Profile";
import Search from "./components/Search";
import Sidebar from "./components/Sidebar";
import Toast from "./components/Toast";
import Meeting from "./components/Meeting";
import IncomingCall from "./components/IncomingCall";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import { useState } from "react";
import { useNotificationSetup } from "./hooks/useNotifications";
import { useHeartbeat } from "./hooks/useHeartbeat";
import useSystemNotifications from "./hooks/useSystemNotifications";

const GET_USERS = gql`
  query GetUsers {
    users { id name email postCount isOnline }
  }
`;

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
  const currentUser = useStore((s) => s.currentUser);
  const view = useStore((s) => s.view);
  const chatTarget = useStore((s) => s.chatTarget);
  const groupTarget = useStore((s) => s.groupTarget);
  const profileUser = useStore((s) => s.profileUser);
  const meetingTarget = useStore((s) => s.meetingTarget);
  const toast = useStore((s) => s.toast);

  const [authView, setAuthView] = useState("login");
  const [incomingCall, setIncomingCall] = useState(null);

  useNotificationSetup();
  useHeartbeat(currentUser);
  useSystemNotifications();

  useQuery(GET_USERS, { skip: !currentUser });

  // --- Subscription appel entrant ---
  useSubscription(MEETING_INVITED_SUB, {
    variables: { userId: currentUser?.id },
    skip: !currentUser,
    onData: ({ data: { data } }) => {
      const inv = data?.meetingInvited;
      if (!inv) return;
      // Ignorer si on est l'appelant
      if (String(inv.fromUser?.id) === String(currentUser?.id)) return;
      // Ignorer si on est déjà en meeting
      if (view === "meeting") return;
      setIncomingCall(inv);
    },
  });

  // --- Non authentifié ---
  if (!currentUser) {
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
      <Header />

      {view === "feed" && (
        <div className="max-w-[1120px] mx-auto grid grid-cols-[1fr_300px] gap-8 p-6 max-[860px]:grid-cols-1">
          <main className="min-w-0"><Feed /></main>
          <aside className="flex flex-col gap-5 max-[860px]:order-[-1]"><Sidebar /></aside>
        </div>
      )}

      {view === "search" && (
        <div className="max-w-[1120px] mx-auto grid grid-cols-[1fr_300px] gap-8 p-6 max-[860px]:grid-cols-1">
          <main className="min-w-0"><Search /></main>
          <aside className="flex flex-col gap-5 max-[860px]:order-[-1]"><Sidebar /></aside>
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
