// ============================================================
// CreateGroup.jsx — Formulaire création de groupe
// ============================================================

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { getAvatarGradient } from "../utils";
import useStore from "../store";
import type { Group } from "@/types";

interface GroupUser {
  id: string;
  name: string;
  isOnline: boolean;
}

interface GetUsersData {
  users: GroupUser[];
}

interface CreateGroupData {
  createGroup: Group;
}

interface CreateGroupProps {
  onCreated: (group: Group) => void;
  onCancel: () => void;
}

const GET_USERS = gql`
  query GetUsers {
    users { id name isOnline }
  }
`;

const CREATE_GROUP = gql`
  mutation CreateGroup($name: String!, $memberIds: [ID!]!) {
    createGroup(name: $name, memberIds: $memberIds) {
      id name
      creator { id name }
      members { user { id name } isCreator }
    }
  }
`;

export default function CreateGroup({ onCreated, onCancel }: CreateGroupProps) {
  const currentUser = useStore((s) => s.currentUser);
  const showToast = useStore((s) => s.showToast);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data } = useQuery<GetUsersData>(GET_USERS);

  const [createGroup] = useMutation<CreateGroupData>(CREATE_GROUP, {
    onCompleted: (data) => {
      showToast("Groupe créé !");
      if (data?.createGroup) onCreated(data.createGroup);
    },
    onError: (err) => showToast(err.message, "error"),
  });

  const toggleUser = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) { showToast("Donne un nom au groupe", "error"); return; }
    if (selectedIds.size === 0) { showToast("Ajoute au moins 1 membre", "error"); return; }
    await createGroup({
      variables: {
        name: name.trim(),
        memberIds: [...selectedIds],
      },
    });
  };

  const users = (data?.users || []).filter((u) => u.id !== currentUser?.id);

  return (
    <div className="mx-auto" style={{ maxWidth: "480px", padding: "var(--sp-6) var(--sp-5)" }}>
      <h3 className="text-base font-extrabold" style={{ color: "var(--text)", marginBottom: "var(--sp-4)" }}>Créer un groupe</h3>
      <input
        type="text"
        placeholder="Nom du groupe"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full text-[0.88rem] outline-none mb-4"
        style={{
          padding: "var(--sp-3) var(--sp-4)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          fontFamily: "inherit",
          background: "var(--surface)",
          color: "var(--text)",
        }}
        onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-soft)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
      />

      <div className="flex flex-col max-h-[300px] overflow-y-auto mb-4" style={{ gap: "var(--sp-1)" }}>
        {users.map((u) => (
          <button
            key={u.id}
            className="flex items-center gap-2 cursor-pointer text-[0.82rem] transition-all duration-150"
            style={{
              padding: "var(--sp-2) var(--sp-3)",
              border: selectedIds.has(u.id) ? "2px solid var(--accent)" : "2px solid transparent",
              borderRadius: "var(--radius-md)",
              background: selectedIds.has(u.id) ? "var(--accent-soft)" : "var(--surface-sunken)",
              fontFamily: "inherit",
              color: "var(--text)",
            }}
            onClick={() => toggleUser(u.id)}
          >
            <div
              className="w-7 h-7 rounded-full grid place-items-center font-bold text-[0.65rem] text-white shrink-0"
              style={{ background: getAvatarGradient(u.id) }}
            >
              {u.name.charAt(0)}
            </div>
            <span>{u.name}</span>
            {u.isOnline && <span className="w-2 h-2 rounded-full" style={{ background: "var(--success)", border: "1.5px solid var(--surface)" }} />}
          </button>
        ))}
      </div>

      <div className="flex justify-end" style={{ gap: "var(--sp-2)" }}>
        <button className="rounded-full text-[0.82rem] cursor-pointer transition-colors duration-150 hover:opacity-70" style={{ padding: "var(--sp-2) var(--sp-4)", border: "1px solid var(--border)", background: "transparent", fontFamily: "inherit", color: "var(--text-secondary)" }} onClick={onCancel}>Annuler</button>
        <button className="btn-primary" onClick={handleCreate} disabled={!name.trim() || selectedIds.size === 0}>
          Créer ({selectedIds.size + 1})
        </button>
      </div>
    </div>
  );
}
