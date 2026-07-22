import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "../../store";
import { getAvatarGradient } from "../../utils";
import UploadImage from "../shared/UploadImage";
import type { Post } from "@/types";

interface CreatePostData {
  createPost: Post;
}

interface PostsData {
  posts: Post[];
}

const POST_FIELDS = `
  id title content imageUrl createdAt
  author { id name }
  comments { id text createdAt parentId author { id name } }
  likeCount
  likes { id }
`;

const CREATE_POST = gql`
  mutation CreatePost($title: String!, $content: String!, $imageUrl: String) {
    createPost(title: $title, content: $content, imageUrl: $imageUrl) {
      ${POST_FIELDS}
    }
  }
`;

const GET_POSTS = gql`
  query GetPosts {
    posts {
      ${POST_FIELDS}
    }
  }
`;

export default function Composer() {
  const currentUser = useStore((s) => s.currentUser);
  const showToast = useStore((s) => s.showToast);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [createPost] = useMutation<CreatePostData>(CREATE_POST);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    if (!currentUser) {
      showToast("Sélectionne d'abord un utilisateur", "error");
      return;
    }
    setPublishing(true);
    try {
      await createPost({
        variables: { title: title.trim(), content: content.trim(), imageUrl: imagePreview || null },
        update: (cache, { data }) => {
          if (!data?.createPost) return;
          const existing = cache.readQuery<PostsData>({ query: GET_POSTS });
          cache.writeQuery({
            query: GET_POSTS,
            data: { posts: [data.createPost, ...(existing?.posts ?? [])] },
          });
        },
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
        <input
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
        <div className="w-8 h-8 rounded-full grid place-items-center font-bold text-[0.7rem] text-white shrink-0" style={{ background: avatarBg }}>
          {currentUser ? currentUser.name.charAt(0) : "?"}
        </div>
        <textarea
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
          className="py-2 px-6 border-none rounded-full text-[0.82rem] font-bold cursor-pointer transition-all duration-200 font-['Inter',inherit] hover:-translate-y-px active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          onClick={handleSubmit}
          disabled={publishing || !currentUser}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          {publishing ? "Publication..." : "Publier"}
        </button>
      </div>
    </div>
  );
}
