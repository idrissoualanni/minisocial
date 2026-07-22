import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { getAvatarGradient } from "../../utils";
import useStore from "../../store";
import type { GraphUser } from "../../types";
import type React from "react";

const GET_USERS = gql`
  query GetUsers {
    users {
      id
      name
      email
      postCount
      isOnline
    }
  }
`;

interface GetUsersData {
  users: GraphUser[];
}

export default function Sidebar() {
  const openProfile = useStore((s) => s.openProfile);
  const { data, loading } = useQuery<GetUsersData>(GET_USERS);

  if (loading) return <p style={{ color: "var(--text-tertiary)" }}>Chargement...</p>;

  const users = data?.users || [];

  return (
    <>
      {/* Statistiques */}
      <div className="bg-white border rounded-xl p-5 shadow-xs" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-sm font-bold mb-4 tracking-tight" style={{ color: "var(--text)" }}>Statistiques</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg" style={{ background: "var(--accent-soft)" }}>
            <div className="text-xl font-bold" style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{users.length}</div>
            <div className="text-[0.65rem] uppercase tracking-wider mt-1 font-medium" style={{ color: "var(--text-tertiary)" }}>Membres</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: "var(--success-soft)" }}>
            <div className="text-xl font-bold" style={{ fontFamily: "var(--font-mono)", color: "var(--success)" }}>
              {users.filter((u) => u.isOnline).length}
            </div>
            <div className="text-[0.65rem] uppercase tracking-wider mt-1 font-medium" style={{ color: "var(--text-tertiary)" }}>En ligne</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: "var(--surface-sunken)" }}>
            <div className="text-xl font-bold" style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
              {users.reduce((sum, u) => sum + u.postCount, 0)}
            </div>
            <div className="text-[0.65rem] uppercase tracking-wider mt-1 font-medium" style={{ color: "var(--text-tertiary)" }}>Publications</div>
          </div>
        </div>
      </div>

      {/* Membres */}
      <div className="bg-white border rounded-xl p-5 shadow-xs" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-sm font-bold mb-4 tracking-tight" style={{ color: "var(--text)" }}>Membres</h3>
        <div className="flex flex-col gap-1">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-2 px-2 rounded-lg transition-colors duration-150" style={{ "--hover-bg": "var(--surface-sunken)" } as React.CSSProperties}>
              <div className="relative flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-full grid place-items-center font-bold text-xs text-white cursor-pointer transition-opacity duration-150 hover:opacity-75"
                  style={{ background: getAvatarGradient(u.id) }}
                  onClick={() => openProfile?.(u)}
                >
                  {u.name.charAt(0)}
                </div>
                {u.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white rounded-full" style={{ background: "var(--success)" }} />}
              </div>
              <div>
                <div className="font-semibold text-sm cursor-pointer transition-opacity duration-150 hover:opacity-75" style={{ color: "var(--text)" }} onClick={() => openProfile?.(u)}>{u.name}</div>
                <div className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                  {u.postCount} publication{u.postCount > 1 ? "s" : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
