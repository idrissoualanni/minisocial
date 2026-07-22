// ============================================================
// GroupChat.jsx — Messagerie de groupe
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useSubscription, useApolloClient } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { getAvatarGradient, timeAgo } from "../utils";
import useStore from "../store";
import type { Group, User } from "@/types";

type GroupTarget = { id: string; name: string; members?: { user: { id: string; name: string; isOnline: boolean }; isCreator: boolean }[] } | null;

interface GroupMessage {
  id: string;
  text: string;
  createdAt: string;
  sender: { id: string; name: string };
  group: { id: string; name: string };
}

interface GroupMessagesData {
  groupMessages: GroupMessage[];
}

interface SendGroupMessageData {
  sendGroupMessage: GroupMessage;
}

interface GroupMessageSentData {
  groupMessageSent: GroupMessage;
}

const GET_GROUP_MESSAGES = gql`
  query GetGroupMessages($groupId: ID!, $limit: Int) {
    groupMessages(groupId: $groupId, limit: $limit) {
      id text createdAt
      sender { id name }
      group { id name }
    }
  }
`;

const SEND_GROUP_MESSAGE = gql`
  mutation SendGroupMessage($text: String!, $groupId: ID!) {
    sendGroupMessage(text: $text, groupId: $groupId) {
      id text createdAt
      sender { id name }
      group { id name }
    }
  }
`;

const GROUP_MSG_SUB = gql`
  subscription OnGroupMsg($groupId: ID!) {
    groupMessageSent(groupId: $groupId) {
      id text createdAt
      sender { id name }
      group { id name }
    }
  }
`;

function formatTime(isoStr: string): string {
  if (!isoStr) return "";
  const d = new Date(isoStr.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function GroupChat() {
  const rawGroup = useStore((s) => s.groupTarget) as GroupTarget;
  const currentUser = useStore((s) => s.currentUser);
  const closeChat = useStore((s) => s.closeChat);
  const showToast = useStore((s) => s.showToast);
  const openProfile = useStore((s) => s.openProfile);
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { cache } = useApolloClient();

  if (!rawGroup) return null;
  if (!currentUser) return null;
  const group = rawGroup;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const addToCache = useCallback((newMsg: GroupMessage) => {
    if (!group?.id) return;
    try {
      const variables = { groupId: group!.id, limit: 50 };
      const existing = cache.readQuery<GroupMessagesData>({ query: GET_GROUP_MESSAGES, variables });
      if (existing && !existing.groupMessages.some((m) => m.id === newMsg.id)) {
        cache.writeQuery({
          query: GET_GROUP_MESSAGES,
          variables,
          data: { groupMessages: [...existing.groupMessages, newMsg] },
        });
      }
    } catch {}
  }, [cache, group?.id]);

  const { data, loading } = useQuery<GroupMessagesData>(GET_GROUP_MESSAGES, {
    variables: { groupId: group.id, limit: 50 },
    skip: !group?.id,
  });

  const [sendGroupMessage] = useMutation<SendGroupMessageData>(SEND_GROUP_MESSAGE, {
    update: (cache, { data }) => { if (data) addToCache(data.sendGroupMessage); },
  });

  useSubscription<GroupMessageSentData>(GROUP_MSG_SUB, {
    variables: { groupId: group.id },
    skip: !group?.id,
    onData: ({ data: { data } }) => {
      const newMsg = data?.groupMessageSent;
      if (!newMsg) return;
      if (String(newMsg.sender.id) === String(currentUser.id)) return;
      addToCache(newMsg);
      scrollToBottom();
    },
  });

  useEffect(() => { scrollToBottom(); }, [data, scrollToBottom]);

  const handleSend = async () => {
    if (!messageText.trim()) return;
    try {
      await sendGroupMessage({
        variables: { text: messageText.trim(), groupId: group.id },
      });
      setMessageText("");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erreur inconnue", "error");
    }
  };

  const messages = data?.groupMessages || [];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)" }}>
      {/* Header */}
      <div className="flex items-center" style={{ gap: "var(--sp-3)", padding: "var(--sp-3) var(--sp-4)", borderBottom: "1px solid var(--border)" }}>
        <button className="w-[30px] h-[30px] rounded-full grid place-items-center text-base cursor-pointer transition-all duration-150 shrink-0 hover:opacity-70" style={{ border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--text-secondary)" }} onClick={closeChat}>←</button>
        <div className="flex items-center gap-2">
          <div className="text-[1.3rem] grid place-items-center shrink-0" style={{ width: "38px", height: "38px", background: "var(--surface-sunken)", borderRadius: "var(--radius-md)" }}>👥</div>
          <div>
            <strong style={{ color: "var(--text)" }}>{group.name}</strong>
            <div style={{ fontSize: "0.68rem", color: "var(--text-tertiary)", fontWeight: 400 }}>
              {group.members?.length || 0} membre{(group.members?.length || 0) > 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-3 flex flex-col" style={{ gap: "var(--sp-2)" }}>
          {loading ? (
            <div className="text-center py-8 text-[0.82rem]" style={{ color: "var(--text-tertiary)" }}>Chargement...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 px-4 text-[0.85rem]" style={{ color: "var(--text-tertiary)" }}>
              Commence la conversation dans {group.name} !
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = String(msg.sender.id) === String(currentUser.id);
              return (
                <div key={msg.id} className={`flex max-w-[75%] ${isMine ? "self-end" : "self-start"}`}>
                  <div className="text-[0.82rem] leading-[1.45]" style={{
                    padding: "var(--sp-3) var(--sp-4)",
                    borderRadius: isMine ? "var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)" : "var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)",
                    background: isMine ? "var(--accent)" : "var(--surface-sunken)",
                    color: isMine ? "var(--text-inverse)" : "var(--text)",
                  }}>
                    {!isMine && (
                      <div
                        className="text-[0.7rem] font-bold cursor-pointer transition-opacity duration-150 hover:opacity-75"
                        style={{ color: "var(--accent)", marginBottom: "2px" }}
                        onClick={() => openProfile?.(msg.sender as User)}
                      >
                        {msg.sender.name}
                      </div>
                    )}
                    <div className="break-words">{msg.text}</div>
                    <div className="mt-[0.2rem] flex items-center" style={{ fontSize: "0.62rem", gap: "var(--sp-1)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", opacity: 0.8 }}>{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="flex items-center shrink-0" style={{ gap: "var(--sp-2)", padding: "var(--sp-3) var(--sp-4)", borderTop: "1px solid var(--border)" }}>
          <input
            type="text"
            placeholder={`Écrire dans ${group.name}...`}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
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
