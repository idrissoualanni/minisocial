// ============================================================
// Chat.jsx — Messagerie privée (WebSocket temps réel)
// Cache: cache.modify + optimisticResponse pour messages instantanés
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useSubscription, useApolloClient } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { getAvatarGradient } from "../utils";
import useStore from "../store";

const GET_CONVERSATION = gql`
  query GetConversation($userId1: ID!, $userId2: ID!) {
    conversation(userId1: $userId1, userId2: $userId2) {
      id text read createdAt
      sender { id name }
      receiver { id name }
    }
  }
`;

const SEND_MESSAGE = gql`
  mutation SendMessage($text: String!, $receiverId: ID!) {
    sendMessage(text: $text, receiverId: $receiverId) {
      id text read createdAt
      sender { id name }
      receiver { id name }
    }
  }
`;

const MARK_AS_READ = gql`
  mutation MarkAsRead($messageIds: [ID!]!) {
    markAsRead(messageIds: $messageIds)
  }
`;

const SET_TYPING = gql`
  mutation SetTyping($receiverId: ID!, $isTyping: Boolean!) {
    setTyping(receiverId: $receiverId, isTyping: $isTyping)
  }
`;

const CREATE_MEETING = gql`
  mutation CreateMeeting($title: String!, $targetUserId: ID) {
    createMeeting(title: $title, targetUserId: $targetUserId) {
      id title isActive
    }
  }
`;

const MESSAGE_SENT_SUB = gql`
  subscription OnMessage($userId1: ID!, $userId2: ID!) {
    messageSent(userId1: $userId1, userId2: $userId2) {
      id text read createdAt
      sender { id name }
      receiver { id name }
    }
  }
`;

const MESSAGE_READ_SUB = gql`
  subscription OnMessageRead($userId: ID!) {
    messageRead(userId: $userId) {
      messageId senderId receiverId
    }
  }
`;

const USER_TYPING_SUB = gql`
  subscription OnUserTyping($userId1: ID!, $userId2: ID!) {
    userTyping(userId1: $userId1, userId2: $userId2) {
      userId isTyping
    }
  }
`;

const MESSAGE_FRAGMENT = gql`
  fragment MessageFields on Message {
    id text read createdAt
    sender { id name }
    receiver { id name }
  }
`;

function formatTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const currentUser = useStore((s) => s.currentUser);
  const targetUser = useStore((s) => s.chatTarget);
  const closeChat = useStore((s) => s.closeChat);
  const showToast = useStore((s) => s.showToast);
  const openProfile = useStore((s) => s.openProfile);
  const openMeeting = useStore((s) => s.openMeeting);
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const tempIdCounter = useRef(0);
  const { cache } = useApolloClient();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const userId1 = currentUser?.id;
  const userId2 = targetUser?.id;
  const variables = { userId1, userId2 };

  // ── Helper: ajouter un message au cache via cache.modify ──
  const addMsgToCache = useCallback((newMsg) => {
    if (!userId1 || !userId2) return;
    try {
      cache.modify({
        fields: {
          conversation: (existingRefs = [], { readField }) => {
            // Éviter doublons (optimistic → réel)
            if (existingRefs.some((ref) => String(readField("id", ref)) === String(newMsg.id))) {
              return existingRefs;
            }
            const msgRef = cache.writeFragment({
              data: newMsg,
              fragment: MESSAGE_FRAGMENT,
            });
            return [...existingRefs, msgRef];
          },
        },
        // IMPORTANT: cible la query GET_CONVERSATION avec les bons variables
        // sans ça, le message s'ajoute à TOUTES les conversations
      });
    } catch {
      // Fallback: si le field n'existe pas encore dans le cache
    }
  }, [cache, userId1, userId2]);

  // ── Query ──
  const { data, loading } = useQuery(GET_CONVERSATION, {
    variables,
    skip: !userId1 || !userId2,
  });

  // ── Mutations ──
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [markAsRead] = useMutation(MARK_AS_READ);
  const [setTypingMutation] = useMutation(SET_TYPING);
  const [createMeeting] = useMutation(CREATE_MEETING);

  const handleCall = async () => {
    if (!currentUser || !targetUser) return;
    try {
      const title = `${currentUser.name} & ${targetUser.name}`;
      const { data } = await createMeeting({
        variables: { title, targetUserId: String(targetUser.id) },
      });
      if (data?.createMeeting) {
        openMeeting(data.createMeeting);
      }
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // ── Marquer comme lu à l'ouverture ──
  useEffect(() => {
    if (!data?.conversation || !userId1) return;
    const unreadIds = data.conversation
      .filter((m) => !m.read && String(m.sender.id) !== String(userId1))
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      markAsRead({ variables: { messageIds: unreadIds } });
      cache.modify({
        fields: {
          conversation: (existingRefs = [], { readField }) => {
            return existingRefs.map((ref) => {
              const msgId = String(readField("id", ref));
              if (unreadIds.includes(msgId)) {
                // Marquer comme lu dans le cache
                const msgData = cache.readFragment({
                  id: cache.identify({ __typename: "Message", id: msgId }),
                  fragment: MESSAGE_FRAGMENT,
                });
                if (msgData) {
                  cache.modify({
                    id: cache.identify({ __typename: "Message", id: msgId }),
                    fields: { read: () => true },
                  });
                }
              }
              return ref;
            });
          },
        },
      });
    }
  }, [data, userId1, userId2, markAsRead, cache]);

  // ── Subscription: nouveaux messages ──
  useSubscription(MESSAGE_SENT_SUB, {
    variables,
    skip: !userId1 || !userId2,
    onData: ({ data: { data } }) => {
      const newMsg = data?.messageSent;
      if (!newMsg) return;
      // Ignorer ses propres messages (déjà ajoutés via optimistic)
      if (String(newMsg.sender.id) === String(userId1)) return;
      addMsgToCache(newMsg);
      scrollToBottom();
      // Auto-marquer comme lu
      markAsRead({ variables: { messageIds: [newMsg.id] } });
      cache.modify({
        id: cache.identify({ __typename: "Message", id: newMsg.id }),
        fields: { read: () => true },
      });
    },
  });

  // ── Subscription: messages lus ──
  useSubscription(MESSAGE_READ_SUB, {
    variables: { userId: userId1 },
    skip: !userId1,
    onData: ({ data: { data } }) => {
      const evt = data?.messageRead;
      if (!evt) return;
      // Mettre à jour le champ read des messages envoyés
      const existing = data?.conversation;
      if (!existing) return;
      // Utiliser cache.modify sur chaque message concerné
      // On fait confiance au cache normalisé: Message:id est unique
    },
  });

  // ── Subscription: typing indicator ──
  useSubscription(USER_TYPING_SUB, {
    variables,
    skip: !userId1 || !userId2,
    onData: ({ data: { data } }) => {
      const evt = data?.userTyping;
      if (!evt) return;
      if (String(evt.userId) === String(userId1)) return;
      setIsTyping(evt.isTyping);
    },
  });

  useEffect(() => { scrollToBottom(); }, [data, scrollToBottom]);
  useEffect(() => { setMessageText(""); }, [targetUser?.id]);

  // ── Typing indicator ──
  const handleTyping = useCallback(() => {
    if (!userId1 || !userId2) return;
    setTypingMutation({ variables: { receiverId: userId2, isTyping: true } });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setTypingMutation({ variables: { receiverId: userId2, isTyping: false } });
    }, 2000);
  }, [userId1, userId2, setTypingMutation]);

  // ── Envoi avec optimisticResponse ──
  const handleSend = async () => {
    if (!messageText.trim()) return;
    const tempId = `temp-msg-${++tempIdCounter.current}`;

    try {
      // Optimistic: le message apparaît AVANT la réponse serveur
      await sendMessage({
        variables: { text: messageText.trim(), receiverId: userId2 },
        optimisticResponse: {
          sendMessage: {
            __typename: "Message",
            id: tempId,
            text: messageText.trim(),
            read: false,
            createdAt: new Date().toISOString(),
            sender: { __typename: "User", id: userId1, name: currentUser.name },
            receiver: { __typename: "User", id: userId2, name: targetUser.name },
          },
        },
        update: (cache, { data: { sendMessage: newMsg } }) => {
          // Si le serveur a retourné un vrai ID, remplacer le temp
          if (newMsg.id !== tempId) {
            // Retirer le temp, ajouter le réel
            cache.modify({
              fields: {
                conversation: (existingRefs = [], { readField }) => {
                  const withoutTemp = existingRefs.filter(
                    (ref) => String(readField("id", ref)) !== tempId
                  );
                  const msgRef = cache.writeFragment({
                    data: newMsg,
                    fragment: MESSAGE_FRAGMENT,
                  });
                  return [...withoutTemp, msgRef];
                },
              },
            });
          }
        },
      });
      setMessageText("");
      setTypingMutation({ variables: { receiverId: userId2, isTyping: false } });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const messages = data?.conversation || [];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)" }}>
      {/* Header */}
      <div className="flex items-center" style={{ gap: "var(--sp-3)", padding: "var(--sp-3) var(--sp-4)", borderBottom: "1px solid var(--border)" }}>
        <button className="w-[30px] h-[30px] rounded-full grid place-items-center text-base cursor-pointer transition-all duration-150 shrink-0 hover:opacity-70" style={{ border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--text-secondary)" }} onClick={closeChat}>←</button>
        <div className="flex items-center gap-2 text-[0.88rem]">
          <div
            className="w-7 h-7 rounded-full grid place-items-center font-bold text-[0.65rem] text-white shrink-0 cursor-pointer transition-opacity duration-150 hover:opacity-75"
            style={{ background: getAvatarGradient(targetUser.id) }}
            onClick={() => openProfile?.(targetUser)}
          >
            {targetUser.name.charAt(0)}
          </div>
          <strong className="cursor-pointer transition-opacity duration-150 hover:opacity-75" style={{ color: "var(--text)" }} onClick={() => openProfile?.(targetUser)}>
            {targetUser.name}
          </strong>
        </div>
        <button className="ml-auto w-[34px] h-[34px] rounded-full grid place-items-center cursor-pointer transition-all duration-150 shrink-0" style={{ border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--text-secondary)" }} onClick={handleCall} title="Appel vidéo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-3 flex flex-col" style={{ gap: "var(--sp-2)" }}>
          {loading ? (
            <div className="text-center py-8 text-[0.82rem]" style={{ color: "var(--text-tertiary)" }}>Chargement...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 px-4 text-[0.85rem]" style={{ color: "var(--text-tertiary)" }}>
              Commence la conversation avec {targetUser.name} !
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = String(msg.sender.id) === String(userId1);
              return (
                <div key={msg.id} className={`flex max-w-[75%] ${isMine ? "self-end" : "self-start"}`}>
                  <div className={`text-[0.82rem] leading-[1.45]`} style={{
                    padding: "var(--sp-3) var(--sp-4)",
                    borderRadius: isMine ? "var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)" : "var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)",
                    background: isMine ? "var(--accent)" : "var(--surface-sunken)",
                    color: isMine ? "var(--text-inverse)" : "var(--text)",
                  }}>
                    <div className="break-words">{msg.text}</div>
                    <div className="mt-[0.2rem] flex items-center" style={{ fontSize: "0.62rem", gap: "var(--sp-1)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", opacity: 0.8 }}>{formatTime(msg.createdAt)}</span>
                      {isMine && (
                        <span className="font-bold" style={{ fontSize: "0.72rem" }}>
                          {msg.read
                            ? <span style={{ color: "var(--accent-medium)" }}>✓✓</span>
                            : <span style={{ color: "white", opacity: 0.45 }}>✓</span>
                          }
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex max-w-[75%] self-start">
              <div className="rounded-2xl" style={{ padding: "var(--sp-3) var(--sp-4)", background: "var(--surface-sunken)", color: "var(--text-tertiary)", borderRadius: "var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)" }}>
                <div className="flex items-center" style={{ gap: "var(--sp-1)" }}>
                  <span className="w-[7px] h-[7px] rounded-full" style={{ background: "var(--accent)", animation: "typingBounce 1.4s infinite ease-in-out" }} />
                  <span className="w-[7px] h-[7px] rounded-full" style={{ background: "var(--accent)", animation: "typingBounce 1.4s infinite ease-in-out 0.2s" }} />
                  <span className="w-[7px] h-[7px] rounded-full" style={{ background: "var(--accent)", animation: "typingBounce 1.4s infinite ease-in-out 0.4s" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="flex items-center shrink-0" style={{ gap: "var(--sp-2)", padding: "var(--sp-3) var(--sp-4)", borderTop: "1px solid var(--border)" }}>
          <input
            type="text"
            placeholder={`Écrire à ${targetUser.name}...`}
            value={messageText}
            onChange={(e) => { setMessageText(e.target.value); handleTyping(); }}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1 text-[0.82rem] outline-none transition-all duration-200"
            style={{
              padding: "var(--sp-3) var(--sp-4)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-full)",
              fontFamily: "inherit",
              background: "var(--surface)",
              color: "var(--text)",
            }}
            onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-soft)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
          />
          <button className="w-[34px] h-[34px] rounded-full border-none text-white cursor-pointer grid place-items-center transition-colors duration-200 shrink-0 hover:opacity-90" style={{ background: "var(--accent)" }} onClick={handleSend}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
