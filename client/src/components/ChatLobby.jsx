// ============================================================
// ChatLobby.jsx — Liste contacts + groupes
// ============================================================

import { useState } from "react";
import { useQuery, useMutation, useSubscription, useApolloClient } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { getAvatarGradient, timeAgo } from "../utils";
import CreateGroup from "./CreateGroup";
import useStore from "../store";

const GET_PREVIEWS = gql`
  query GetPreviews($userId: ID!) {
    conversationPreviews(userId: $userId) {
      unreadCount
      user { id name email isOnline }
      lastMessage {
        id text read createdAt
        sender { id name }
        receiver { id name }
      }
    }
  }
`;

const GET_PENDING = gql`
  query GetPending($userId: ID!) {
    pendingRequests(userId: $userId) {
      id status createdAt
      sender { id name email isOnline }
      receiver { id name }
    }
  }
`;

const GET_PERMISSION = gql`
  query GetPermission($userId1: ID!, $userId2: ID!) {
    chatPermission(userId1: $userId1, userId2: $userId2) {
      id status
      sender { id name }
      receiver { id name }
    }
  }
`;

const MY_GROUPS = gql`
  query MyGroups($userId: ID!) {
    myGroups(userId: $userId) {
      id name createdAt
      creator { id name }
      members { user { id name isOnline } isCreator }
    }
  }
`;

const REQUEST_CHAT = gql`
  mutation RequestChat($receiverId: ID!) {
    requestChat(receiverId: $receiverId) {
      id status
      sender { id name }
      receiver { id name }
    }
  }
`;

const ACCEPT_CHAT = gql`
  mutation AcceptChat($permissionId: ID!) {
    acceptChat(permissionId: $permissionId) {
      id status
      sender { id name }
      receiver { id name }
    }
  }
`;

const REJECT_CHAT = gql`
  mutation RejectChat($permissionId: ID!) {
    rejectChat(permissionId: $permissionId) {
      id status
      sender { id name }
      receiver { id name }
    }
  }
`;

const PERMISSION_SUB = gql`
  subscription OnPerm($userId: ID!) {
    chatPermissionUpdated(userId: $userId) {
      id status
      sender { id name }
      receiver { id name }
    }
  }
`;

export default function ChatLobby() {
  const currentUser = useStore((s) => s.currentUser);
  const showToast = useStore((s) => s.showToast);
  const openChat = useStore((s) => s.openChat);
  const openGroupChat = useStore((s) => s.openGroupChat);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const { data: previewsData, refetch: refetchPreviews } = useQuery(GET_PREVIEWS, {
    variables: { userId: currentUser?.id }, skip: !currentUser,
  });
  const { data: pendingData, refetch: refetchPending } = useQuery(GET_PENDING, {
    variables: { userId: currentUser?.id }, skip: !currentUser,
  });
  const { data: groupsData, refetch: refetchGroups } = useQuery(MY_GROUPS, {
    variables: { userId: currentUser?.id }, skip: !currentUser,
  });

  const [requestChat] = useMutation(REQUEST_CHAT, {
    onCompleted: () => { showToast("Demande envoyée !"); refetchPreviews(); },
    onError: (err) => showToast(err.message, "error"),
  });
  const [acceptChat] = useMutation(ACCEPT_CHAT, {
    onCompleted: (data) => {
      showToast(`${data.acceptChat.sender.name} a accepté !`);
      refetchPreviews(); refetchPending();
      openChat(data.acceptChat.sender);
    },
    onError: (err) => showToast(err.message, "error"),
  });
  const [rejectChat] = useMutation(REJECT_CHAT, {
    onCompleted: () => { showToast("Demande refusée"); refetchPending(); refetchPreviews(); },
    onError: (err) => showToast(err.message, "error"),
  });

  useSubscription(PERMISSION_SUB, {
    variables: { userId: currentUser?.id }, skip: !currentUser,
    onData: () => { refetchPending(); refetchPreviews(); },
  });

  const previews = previewsData?.conversationPreviews || [];
  const pendingRequests = pendingData?.pendingRequests || [];
  const groups = groupsData?.myGroups || [];

  if (!currentUser) {
    return (
      <div className="h-full grid place-items-center" style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>
        <p>Connecte-toi pour accéder au chat</p>
      </div>
    );
  }

  const sorted = [...previews].sort((a, b) => {
    if (a.lastMessage && b.lastMessage) return b.lastMessage.createdAt?.localeCompare(a.lastMessage.createdAt) || 0;
    if (a.lastMessage) return -1;
    if (b.lastMessage) return 1;
    return 0;
  });

  if (showCreateGroup) {
    return (
      <CreateGroup
        onCreated={(g) => { setShowCreateGroup(false); refetchGroups(); }}
        onCancel={() => setShowCreateGroup(false)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ padding: "var(--sp-4) var(--sp-5)" }}>
      {/* Demandes entrantes */}
      {pendingRequests.length > 0 && (
        <div style={{ marginBottom: "var(--sp-5)" }}>
          <h4 style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: "var(--sp-3)" }}>Demandes en attente</h4>
          {pendingRequests.map((req) => (
            <div key={req.id} style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-medium)", borderRadius: "var(--radius-md)" }} className="flex items-center justify-between py-3 px-3 mb-2">
              <div className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <div className="w-7 h-7 rounded-full grid place-items-center font-bold text-[0.65rem] text-white" style={{ background: getAvatarGradient(req.sender.id) }}>
                    {req.sender.name.charAt(0)}
                  </div>
                  {req.sender.isOnline && <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full" style={{ background: "var(--success)", border: "1.5px solid var(--surface)" }} />}
                </div>
                <span className="text-[0.82rem] font-bold" style={{ color: "var(--text)" }}>{req.sender.name}</span>
              </div>
              <div className="flex" style={{ gap: "var(--sp-1)" }}>
                <button className="w-[30px] h-[30px] rounded-full border-none text-[0.85rem] font-bold cursor-pointer grid place-items-center text-white transition-transform duration-150 hover:scale-110" style={{ background: "var(--success)" }} onClick={() => acceptChat({ variables: { permissionId: req.id } })}>✓</button>
                <button className="w-[30px] h-[30px] rounded-full border-none text-[0.85rem] font-bold cursor-pointer grid place-items-center text-white transition-transform duration-150 hover:scale-110" style={{ background: "var(--error)" }} onClick={() => rejectChat({ variables: { permissionId: req.id } })}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Groupes */}
      <div style={{ marginBottom: "var(--sp-5)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "var(--sp-3)" }}>
          <h4 style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: 0 }}>Groupes ({groups.length})</h4>
          <button className="rounded-full font-bold cursor-pointer transition-all duration-150 hover:opacity-80" style={{ background: "transparent", border: "1px solid var(--border)", padding: "var(--sp-1) var(--sp-3)", fontSize: "0.7rem", color: "var(--accent)", fontFamily: "inherit" }} onClick={() => setShowCreateGroup(true)}>+ Nouveau</button>
        </div>
        {groups.length === 0 ? (
          <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", textAlign: "center", padding: "var(--sp-4) 0" }}>Aucun groupe pour l'instant</div>
        ) : (
          <div className="flex flex-col" style={{ gap: "2px" }}>
            {groups.map((g) => (
              <div key={g.id} className="flex items-center cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-hover)]" style={{ gap: "var(--sp-3)", padding: "var(--sp-3)", borderRadius: "var(--radius-md)" }} onClick={() => openGroupChat(g)}>
                <div className="text-[1.3rem] grid place-items-center shrink-0" style={{ width: "38px", height: "38px", background: "var(--surface-sunken)", borderRadius: "var(--radius-md)" }}>👥</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.82rem] font-bold" style={{ color: "var(--text)" }}>{g.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                    {g.members.length} membre{g.members.length > 1 ? "s" : ""}
                    <span style={{ color: "var(--success)" }}>
                      · {g.members.filter((m) => m.user.isOnline).length} en ligne
                    </span>
                  </div>
                </div>
                <div className="flex ml-auto">
                  {g.members.slice(0, 3).map((m) => (
                    <div key={m.user.id} className="rounded-full grid place-items-center text-[0.55rem] font-bold text-white first:ml-0" style={{ width: "1.5rem", height: "1.5rem", marginLeft: "-6px", border: "2px solid var(--surface)", background: getAvatarGradient(m.user.id) }}>
                      {m.user.name.charAt(0)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contacts */}
      <div style={{ marginBottom: "var(--sp-5)" }}>
        <h4 style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: "var(--sp-3)" }}>Conversations</h4>
        <div className="flex flex-col" style={{ gap: "2px" }}>
          {sorted.map((preview) => (
            <ContactRow
              key={preview.user.id}
              preview={preview}
              requestChat={requestChat}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Ligne de contact ---
function ContactRow({ preview, requestChat }) {
  const currentUser = useStore((s) => s.currentUser);
  const openChatFn = useStore((s) => s.openChat);
  const showToast = useStore((s) => s.showToast);
  const openProfile = useStore((s) => s.openProfile);
  const { user, lastMessage, unreadCount } = preview;

  const { data } = useQuery(GET_PERMISSION, {
    variables: { userId1: currentUser.id, userId2: user.id }, skip: !currentUser,
    fetchPolicy: "cache-and-network",
  });

  const status = data?.chatPermission?.status;

  const handleClick = () => {
    if (status === "accepted") {
      openChatFn(user);
    } else if (status === "pending") {
      showToast("Demande déjà en attente", "error");
    } else {
      requestChat({ variables: { receiverId: user.id } });
    }
  };

  return (
    <div className="flex items-center cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-hover)]" style={{ gap: "var(--sp-3)", padding: "var(--sp-3) var(--sp-4)", borderRadius: "var(--radius-md)" }}>
      <div className="relative shrink-0" onClick={(e) => { e.stopPropagation(); openProfile?.(user); }}>
        <div className="w-[42px] h-[42px] rounded-full grid place-items-center font-bold text-[0.85rem] text-white shrink-0 cursor-pointer transition-opacity duration-150 hover:opacity-75" style={{ background: getAvatarGradient(user.id) }}>
          {user.name.charAt(0)}
        </div>
        {user.isOnline && <span className="absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full" style={{ background: "var(--success)", border: "2px solid var(--surface)" }} />}
      </div>

      <div className="flex-1 min-w-0" onClick={handleClick}>
        <div className="text-[0.82rem] font-bold cursor-pointer transition-opacity duration-150 hover:opacity-75" style={{ color: "var(--text)" }} onClick={(e) => { e.stopPropagation(); openProfile?.(user); }}>
          {user.name}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {lastMessage ? (
            <>
              {lastMessage.sender.id === currentUser.id && <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Toi : </span>}
              {lastMessage.text.length > 40 ? lastMessage.text.substring(0, 40) + "..." : lastMessage.text}
              {lastMessage.createdAt && <span className="opacity-70" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "0.65rem" }}> · {timeAgo(lastMessage.createdAt)}</span>}
            </>
          ) : (
            <span className="italic opacity-60">
              {status === "accepted" ? "Commencer à discuter" :
               status === "pending" ? "En attente..." :
               "Demander à discuter"}
            </span>
          )}
        </div>
      </div>

      {unreadCount > 0 && <span className="text-[0.65rem] font-bold min-w-[20px] h-5 rounded-full grid place-items-center px-[5px] shrink-0" style={{ background: "var(--accent)", color: "white" }}>{unreadCount}</span>}
    </div>
  );
}
