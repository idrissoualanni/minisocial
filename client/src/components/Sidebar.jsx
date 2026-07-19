import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { getAvatarGradient } from "../utils";
import useStore from "../store";

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

const CREATE_USER = gql`
  mutation CreateUser($name: String!, $email: String!) {
    createUser(name: $name, email: $email) {
      id name email postCount
    }
  }
`;

export default function Sidebar() {
  const currentUser = useStore((s) => s.currentUser);
  const showToast = useStore((s) => s.showToast);
  const openProfile = useStore((s) => s.openProfile);
  const { data, loading } = useQuery(GET_USERS);
  const [createUser] = useMutation(CREATE_USER, {
    // ✅ MISE À JOUR CACHE : ajoute le nouvel user à la liste
    update: (cache, { data: { createUser: newUser } }) => {
      const existing = cache.readQuery({ query: GET_USERS });
      cache.writeQuery({
        query: GET_USERS,
        data: { users: [...existing.users, newUser] },
      });
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const handleAddUser = async () => {
    if (!newName.trim() || !newEmail.trim()) {
      showToast("Remplis tous les champs", "error");
      return;
    }
    try {
      const { data } = await createUser({
        variables: { name: newName.trim(), email: newEmail.trim() },
      });
      showToast(`${newName.trim()} a rejoint MiniSocial !`);
      setNewName("");
      setNewEmail("");
      setShowForm(false);
      // Auto-sélectionner le nouvel utilisateur
      handleUserSelect(data.createUser);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleUserSelect = (user) => {
    const { accessToken, refreshToken, setAuth } = useStore.getState();
    setAuth(user, accessToken, refreshToken);
  };

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
            <div key={u.id} className="flex items-center gap-3 py-2 px-2 rounded-lg transition-colors duration-150" style={{ "--hover-bg": "var(--surface-sunken)" }}>
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
        <button
          className="text-sm font-semibold bg-transparent border-none cursor-pointer mt-3 text-left transition-colors duration-150"
          style={{ color: "var(--accent)" }}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Annuler" : "+ Ajouter un membre"}
        </button>
        {showForm && (
          <div className="flex flex-col gap-3 mt-3">
            <input
              type="text"
              placeholder="Prénom Nom"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full py-2.5 px-3 border rounded-lg text-sm bg-transparent outline-none transition-all duration-200 placeholder:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit" }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-soft)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
            />
            <input
              type="email"
              placeholder="email@exemple.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full py-2.5 px-3 border rounded-lg text-sm bg-transparent outline-none transition-all duration-200 placeholder:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit" }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-soft)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
            />
            <button className="py-2.5 px-5 text-white border-none rounded-full text-sm font-bold cursor-pointer transition-colors duration-200" style={{ background: "var(--accent)", fontFamily: "inherit" }} onClick={handleAddUser}>
              Créer le compte
            </button>
          </div>
        )}
      </div>

      {/* User select */}
      <div className="bg-white border rounded-xl p-5 shadow-xs" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-sm font-bold mb-4 tracking-tight" style={{ color: "var(--text)" }}>Tu es connecté en tant que</h3>
        <select
          className="w-full py-2.5 px-3 border rounded-lg text-sm outline-none cursor-pointer"
          style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface-sunken)", fontFamily: "inherit" }}
          value={currentUser?.id || ""}
          onChange={(e) => {
            const user = users.find((u) => u.id === e.target.value);
            if (user) handleUserSelect(user);
          }}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
