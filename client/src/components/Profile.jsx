// ============================================================
// Profile.jsx — Page profil avec édition
// ============================================================

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import PostCard from "./PostCard";
import { getAvatarGradient } from "../utils";
import { GET_POSTS } from "./Feed";
import useStore from "../store";

const GET_USER_PROFILE = gql`
  query GetUserProfile($id: ID!) {
    user(id: $id) {
      id name email bio isOnline postCount
      posts {
        id title content imageUrl createdAt
        author { id name }
        comments { id text createdAt parentId author { id name } }
        likeCount
        likes { id }
      }
    }
  }
`;

const UPDATE_USER = gql`
  mutation UpdateUser($id: ID!, $name: String, $email: String, $bio: String) {
    updateUser(id: $id, name: $name, email: $email, bio: $bio) {
      id name email bio
    }
  }
`;

export default function Profile() {
  const profileUser = useStore((s) => s.profileUser);
  const currentUser = useStore((s) => s.currentUser);
  const showToast = useStore((s) => s.showToast);
  const setView = useStore((s) => s.setView);
  const { data, loading, refetch } = useQuery(GET_USER_PROFILE, { variables: { id: profileUser.id } });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profileUser.name);
  const [email, setEmail] = useState(profileUser.email);
  const [bio, setBio] = useState("");

  const [updateUser] = useMutation(UPDATE_USER, {
    onCompleted: (data) => {
      setEditing(false);
      showToast("Profil modifié !");
      refetch();
    },
    onError: (err) => showToast(err.message, "error"),
  });

  const profile = data?.user;
  const isMe = currentUser && String(currentUser.id) === String(profileUser.id);

  // Sync bio from fetched data
  if (profile && bio === "" && profile.bio) setBio(profile.bio);

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) { showToast("Tous les champs sont requis", "error"); return; }
    await updateUser({ variables: { id: profileUser.id, name: name.trim(), email: email.trim(), bio: bio.trim() } });
  };

  const inputClasses = "w-full py-2.5 px-3 border rounded-lg text-sm bg-transparent outline-none transition-all duration-200 placeholder:opacity-50";

  const handleFocus = (e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-soft)"; };
  const handleBlur = (e) => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 pb-16">
      <div className="flex items-center gap-3 mb-6">
        <button className="w-8 h-8 rounded-full border grid place-items-center text-sm cursor-pointer shrink-0 transition-colors duration-150" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)", color: "var(--text-secondary)" }} onClick={() => setView("feed")}>←</button>
        <h2 className="text-lg font-bold tracking-tight" style={{ color: "var(--text)" }}>Profil</h2>
      </div>

      {loading ? (
        <div className="text-center py-12 px-4" style={{ color: "var(--text-tertiary)" }}><p>Chargement...</p></div>
      ) : !profile ? (
        <div className="text-center py-12 px-4" style={{ color: "var(--text-tertiary)" }}><p>Utilisateur introuvable</p></div>
      ) : (
        <>
          {/* Profile card */}
          <div className="bg-white border rounded-2xl p-8 text-center shadow-xs mb-6" style={{ borderColor: "var(--border)" }}>
            <div className="relative inline-block mb-4">
              <div className="w-20 h-20 rounded-full grid place-items-center text-2xl font-extrabold text-white" style={{ background: getAvatarGradient(profile.id) }}>
                {profile.name.charAt(0)}
              </div>
              {profile.isOnline && <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 border-[3px] border-white rounded-full" style={{ background: "var(--success)" }} />}
            </div>

            {editing ? (
              <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
                <input className={inputClasses} style={{ borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" onFocus={handleFocus} onBlur={handleBlur} />
                <input className={inputClasses} style={{ borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit" }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" onFocus={handleFocus} onBlur={handleBlur} />
                <textarea className={`${inputClasses} resize-y min-h-[60px]`} style={{ borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit" }} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Bio (optionnel)" rows={2} maxLength={200} onFocus={handleFocus} onBlur={handleBlur} />
                <div className="flex gap-2 justify-end">
                  <button className="py-2 px-4 border rounded-full bg-transparent text-sm cursor-pointer transition-colors duration-150" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)", fontFamily: "inherit" }} onClick={() => { setEditing(false); setName(profileUser.name); setEmail(profileUser.email); setBio(profile.bio || ""); }}>Annuler</button>
                  <button className="py-2 px-5 text-white border-none rounded-full text-sm font-bold cursor-pointer transition-colors duration-200" style={{ background: "var(--accent)", fontFamily: "inherit" }} onClick={handleSave}>Enregistrer</button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="text-xl font-extrabold mb-1" style={{ color: "var(--text)" }}>{profile.name}</h3>
                  <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{profile.email}</p>
                  {profile.bio && <p className="text-sm mt-3 leading-relaxed break-words whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{profile.bio}</p>}
                </div>
                {isMe && (
                  <button className="inline-flex items-center gap-1.5 mx-auto py-2 px-3.5 border rounded-full bg-transparent text-xs font-semibold cursor-pointer transition-all duration-150 mt-2" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)", fontFamily: "inherit" }} onClick={() => setEditing(true)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Modifier le profil
                  </button>
                )}
              </>
            )}

            <div className="flex justify-center gap-10 pt-5 mt-5" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="text-center">
                <div className="text-lg font-bold" style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{profile.postCount}</div>
                <div className="text-[0.65rem] uppercase tracking-wider mt-0.5 font-semibold" style={{ color: "var(--text-tertiary)" }}>Publications</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold" style={{ fontFamily: "var(--font-mono)", color: profile.isOnline ? "var(--success)" : "var(--text)" }}>
                  {profile.isOnline ? "En ligne" : "Hors ligne"}
                </div>
                <div className="text-[0.65rem] uppercase tracking-wider mt-0.5 font-semibold" style={{ color: "var(--text-tertiary)" }}>Statut</div>
              </div>
            </div>
          </div>

          {/* Posts */}
          <div className="mt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Publications ({profile.posts.length})</h4>
            {profile.posts.length === 0 ? (
              <div className="text-center py-12 px-4" style={{ color: "var(--text-tertiary)" }}><p>Aucune publication</p></div>
            ) : (
              <div className="flex flex-col gap-4">
                {profile.posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
