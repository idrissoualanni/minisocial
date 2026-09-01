import { useState } from "react";
import useStore from "../../store";
import { getAvatarGradient } from "../../utils";
import UploadImage from "../shared/UploadImage";
import { useCreatePost } from "@/hooks/usePostMutations";

export default function Composer() {
  const currentUser = useStore((s) => s.currentUser);
  const showToast = useStore((s) => s.showToast);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const createPost = useCreatePost();

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    if (!currentUser) {
      showToast("Sélectionne d'abord un utilisateur", "error");
      return;
    }
    setPublishing(true);
    try {
      await createPost.mutateAsync({
        title: title.trim(),
        content: content.trim(),
        imageUrl: imagePreview || null,
      });
      showToast("Publication partagée !");
      setTitle("");
      setContent("");
      setImagePreview(null);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Erreur inconnue", "error");
    }
    setPublishing(false);
  };

  const avatarBg = currentUser
    ? getAvatarGradient(currentUser.id)
    : "linear-gradient(135deg, #6366F1, #8B5CF6)";

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-xs)" }} className="p-6 mb-6 transition-shadow duration-200 hover:shadow-[var(--shadow-sm)]">
      <div className="flex gap-4 items-center mb-4">
        <label htmlFor="composer-title" className="visually-hidden">Titre de la publication</label>
        <input
          id="composer-title"
          type="text"
          placeholder="Titre de ta publication..."
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ background: "var(--surface)", color: "var(--text)" }}
          className="flex-1 border-none text-[1.05rem] font-bold outline-none placeholder:text-[var(--text-tertiary)] placeholder:font-normal font-['Inter',inherit]"
        />
      </div>
      <div className="flex gap-4 items-start">
        <div className="w-8 h-8 rounded-full grid place-items-center font-bold text-[0.7rem] text-white shrink-0" style={{ background: avatarBg }} aria-hidden="true">
          {currentUser ? currentUser.name.charAt(0) : "?"}
        </div>
        <label htmlFor="composer-content" className="visually-hidden">Contenu de la publication</label>
        <textarea
          id="composer-content"
          placeholder="Quoi de neuf ?"
          rows={2}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ background: "var(--surface)", color: "var(--text)" }}
          className="flex-1 border-none text-[0.95rem] resize-none min-h-[50px] outline-none leading-[1.6] placeholder:text-[var(--text-tertiary)] font-['Inter',inherit]"
        />
      </div>
      <UploadImage
        imagePreview={imagePreview}
        onImageSelect={setImagePreview}
        onImageRemove={() => setImagePreview(null)}
      />
      <div style={{ borderTop: "1px solid var(--border)" }} className="flex items-center justify-between mt-4 pt-4">
        <span style={{ color: "var(--text-tertiary)" }} className="text-[0.75rem] font-['DM_Mono',monospace]">
          Publié en tant que{" "}
          <strong style={{ color: "var(--text-secondary)" }}>{currentUser ? currentUser.name : "..."}</strong>
        </span>
        <button
          style={{ background: "var(--accent)", color: "#fff" }}
          className="flex items-center justify-center gap-2 py-2 px-6 border-none rounded-full text-[0.82rem] font-bold cursor-pointer transition-all duration-200 font-['Inter',inherit] hover:-translate-y-px hover:bg-[var(--accent-hover)] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          onClick={handleSubmit}
          disabled={publishing || !currentUser}
          aria-busy={publishing}
        >
          {publishing && (
            <svg className="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          )}
          {publishing ? "Publication..." : "Publier"}
        </button>
      </div>
    </div>
  );
}
