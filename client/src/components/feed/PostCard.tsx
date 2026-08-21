// ============================================================
// PostCard.jsx — Post avec édition, likes, commentaires threadés
// Cache: cache.modify + optimisticResponse (pas de readQuery/map/writeQuery)
// ============================================================

import { useState } from "react";
import { useMutation, useSubscription, useApolloClient } from "@apollo/client/react";
import { gql, type Reference } from "@apollo/client";
import CommentItem from "./CommentItem";
import ImageCropModal from "../shared/ImageCropModal";
import { getAvatarGradient, timeAgo } from "../../utils";
import useStore from "../../store";
import type { Post } from "../../types";
import type { User } from "../../store";

interface PostCardProps {
  post: Post;
}

const ADD_COMMENT = gql`
  mutation AddComment($text: String!, $postId: ID!, $parentId: ID) {
    addComment(text: $text, postId: $postId, parentId: $parentId) {
      id text createdAt
      author { id name }
      post { id }
      parentId
    }
  }
`;

const DELETE_POST = gql`
  mutation DeletePost($id: ID!) {
    deletePost(id: $id)
  }
`;

const UPDATE_POST = gql`
  mutation UpdatePost($id: ID!, $title: String, $content: String, $imageUrl: String) {
    updatePost(id: $id, title: $title, content: $content, imageUrl: $imageUrl) {
      id title content imageUrl createdAt
      author { id name }
    }
  }
`;

const TOGGLE_LIKE = gql`
  mutation ToggleLike($postId: ID!) {
    toggleLike(postId: $postId)
  }
`;

const LIKE_TOGGLED = gql`
  subscription OnLikeToggled {
    likeToggled { postId likeCount userId }
  }
`;

export default function PostCard({ post }: PostCardProps) {
  const currentUser = useStore((s) => s.currentUser);
  const showToast = useStore((s) => s.showToast);
  const openProfile = useStore((s) => s.openProfile);
  const [showComments, setShowComments] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>("");
  const [replyTo, setReplyTo] = useState<Post["comments"][number] | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>(post.title);
  const [editContent, setEditContent] = useState<string>(post.content);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(post.imageUrl || null);
  const [showCropModal, setShowCropModal] = useState<boolean>(false);
  const { cache } = useApolloClient();

  const likedByMe = currentUser && post.likes?.some((u) => String(u.id) === String(currentUser.id));
  const likeCount = post.likeCount || 0;

  // ── LIKE: optimistic + cache.modify chirurgical ──
  const [toggleLike] = useMutation<{ toggleLike: boolean }>(TOGGLE_LIKE, {
    optimisticResponse: {
      toggleLike: !!likedByMe,
    },
    update: (cache, { data }) => {
      const liked = data?.toggleLike ?? false;
      // cache.modify cible directement l'objet Post:5 dans le cache
      // Pas besoin de lire → mapper → réécrire toute la query GET_POSTS
      const postId = cache.identify({ __typename: "Post", id: post.id });
      cache.modify({
        id: postId,
        fields: {
          likeCount: (existing = 0) => liked ? existing + 1 : existing - 1,
          likes: (existingRefs = [], { readField }) => {
            if (liked) {
              // Ajouter une référence vers l'utilisateur courant
              const userRef = cache.writeFragment({
                data: { __typename: "User", id: currentUser!.id, name: currentUser!.name },
                fragment: gql`fragment BriefUser on User { id name }`,
              });
              return [...existingRefs, userRef];
            } else {
              // Retirer la référence de l'utilisateur courant
              return existingRefs.filter(
                (ref: Reference) => String(readField("id", ref)) !== String(currentUser!.id)
              );
            }
          },
        },
      });
    },
  });

  // ── LIKE subscription: met à jour le compteur si un autre like ──
  useSubscription(LIKE_TOGGLED, {
    onData: ({ data: { data } }) => {
      const evt = (data as Record<string, { postId: string; likeCount: number; userId: string }> | null)?.likeToggled;
      if (!evt || String(evt.postId) !== String(post.id)) return;
      const postId = cache.identify({ __typename: "Post", id: post.id });
      if (!postId) return;
      cache.modify({
        id: postId,
        fields: {
          likeCount: () => evt.likeCount,
        },
      });
    },
  });

  const handleLike = async () => {
    if (!currentUser) { showToast("Sélectionne d'abord un utilisateur", "error"); return; }
    await toggleLike({ variables: { postId: post.id } });
  };

  // ── COMMENTAIRE: optimistic + cache.modify ──
  const [addComment] = useMutation(ADD_COMMENT, {
    optimisticResponse: {
      addComment: {
        __typename: "Comment" as const,
        id: `temp-comment-${Date.now()}`,
        text: commentText.trim(),
        createdAt: new Date().toISOString(),
        parentId: replyTo ? replyTo.id : null,
        author: { __typename: "User" as const, id: currentUser!.id, name: currentUser!.name },
        post: { __typename: "Post" as const, id: post.id },
      },
    },
    update: (cache, { data }) => {
      const newComment = (data as Record<string, { id: string; text: string; createdAt: string; parentId: string | null; author: { id: string; name: string }; post: { id: string } }> | null)?.addComment;
      if (!newComment) return;
      const postId = cache.identify({ __typename: "Post", id: post.id });
      cache.modify({
        id: postId,
        fields: {
          comments: (existingRefs = [], { readField }) => {
            // Éviter les doublons (optimistic → réel)
            const exists = existingRefs.some(
              (ref: Reference) => String(readField("id", ref)) === String(newComment.id)
            );
            if (exists) return existingRefs;
            const commentRef = cache.writeFragment({
              data: newComment,
              fragment: gql`fragment NewComment on Comment {
                id text createdAt parentId
                author { id name }
                post { id }
              }`,
            });
            return [...existingRefs, commentRef];
          },
        },
      });
    },
  });

  // ── SUPPRESSION: cache.modify evict ──
  const [deletePost] = useMutation(DELETE_POST, {
    optimisticResponse: { deletePost: true },
    update: (cache) => {
      // Retirer le post de la liste GET_POSTS
      cache.modify({
        fields: {
          posts: (existingRefs = [], { readField }) => {
            return existingRefs.filter(
              (ref: Reference) => String(readField("id", ref)) !== String(post.id)
            );
          },
        },
      });
    },
  });

  // ── ÉDITION: optimistic + cache.modify ──
  const [updatePost] = useMutation(UPDATE_POST, {
    optimisticResponse: {
      updatePost: {
        __typename: "Post" as const,
        id: post.id,
        title: editTitle.trim(),
        content: editContent.trim(),
        imageUrl: editImageUrl,
        createdAt: post.createdAt,
        author: post.author,
      },
    },
    update: (cache, { data }) => {
      const updated = (data as Record<string, { title: string; content: string; imageUrl: string | null }> | null)?.updatePost;
      if (!updated) return;
      const postId = cache.identify({ __typename: "Post", id: post.id });
      cache.modify({
        id: postId,
        fields: {
          title: () => updated.title,
          content: () => updated.content,
          imageUrl: () => updated.imageUrl,
        },
      });
    },
  });

  const handleSendComment = async () => {
    if (!currentUser) { showToast("Sélectionne d'abord un utilisateur", "error"); return; }
    if (!commentText.trim()) return;
    try {
      await addComment({
        variables: {
          text: commentText.trim(),
          postId: String(post.id),
          parentId: replyTo ? replyTo.id : null,
        },
      });
      setCommentText("");
      setReplyTo(null);
      setShowComments(true);
    } catch (err) { showToast(err instanceof Error ? err.message : "Erreur", "error"); }
  };

  const handleDelete = async () => {
    if (!currentUser) { showToast("Sélectionne d'abord un utilisateur", "error"); return; }
    if (!confirm("Supprimer cette publication ?")) return;
    try {
      await deletePost({ variables: { id: String(post.id) } });
      showToast("Publication supprimée");
    } catch (err) { showToast(err instanceof Error ? err.message : "Erreur", "error"); }
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) { showToast("Titre et contenu requis", "error"); return; }
    try {
      await updatePost({
        variables: {
          id: String(post.id),
          title: editTitle.trim(), content: editContent.trim(),
          imageUrl: editImageUrl,
        },
      });
      setEditing(false);
      showToast("Publication modifiée");
    } catch (err) { showToast(err instanceof Error ? err.message : "Erreur", "error"); }
  };

  const handleCancelEdit = () => {
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditImageUrl(post.imageUrl || null);
    setShowCropModal(false);
    setEditing(false);
  };

  const handleShare = async () => {
    const text = `📚 ${post.title}\n${post.content}\n\n— ${post.author.name}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, text });
      } catch (e) {
        // annulé par l'utilisateur
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Publication copiée dans le presse-papier");
      } catch {
        showToast("Impossible de copier", "error");
      }
    }
  };

  const isAuthor = currentUser && String(currentUser.id) === String(post.author.id);

  // Sépare les commentaires racines et les réponses
  const rootComments = post.comments.filter((c) => !c.parentId);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-xs)" }} className="p-6 transition-shadow duration-200 hover:shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full grid place-items-center font-bold text-[0.8rem] text-white shrink-0 cursor-pointer transition-opacity duration-150 hover:opacity-75" style={{ background: getAvatarGradient(post.author.id) }}
          onClick={() => openProfile?.(post.author as User)}>
          {post.author.name.charAt(0)}
        </div>
        <div>
          <div className="font-bold text-[0.88rem] cursor-pointer transition-opacity duration-150 hover:opacity-75" style={{ color: "var(--text)" }} onClick={() => openProfile?.(post.author as User)}>
            {post.author.name}
          </div>
          <div style={{ color: "var(--text-tertiary)" }} className="text-[0.72rem] font-['DM_Mono',monospace]">{timeAgo(post.createdAt)}</div>
        </div>
        {isAuthor && !editing && (
          <button style={{ border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--text-tertiary)" }} className="ml-auto w-[30px] h-[30px] rounded-full grid place-items-center cursor-pointer transition-all duration-150 shrink-0 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)]" onClick={() => setEditing(true)} title="Modifier">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <input style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", borderRadius: "var(--radius-sm)" }} className="w-full py-2.5 px-3 text-base font-bold font-['Inter',inherit] outline-none focus:ring-2 focus:ring-[var(--accent-soft)]" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          <textarea style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", borderRadius: "var(--radius-sm)" }} className="w-full py-2.5 px-3 text-[0.9rem] font-['Inter',inherit] outline-none resize-y min-h-[60px] focus:ring-2 focus:ring-[var(--accent-soft)]" value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} />
          {editImageUrl && (
            <div className="flex flex-col gap-1">
              <div className="relative overflow-hidden max-h-[200px]" style={{ borderRadius: "var(--radius-md)" }}>
                <img src={editImageUrl} alt="Aperçu" className="w-full h-[200px] object-cover block" style={{ borderRadius: "var(--radius-md)" }} />
                <button className="absolute bottom-2 right-2 flex items-center gap-1 py-1.5 px-3 border-none bg-black/65 text-white text-[0.78rem] font-semibold cursor-pointer backdrop-blur-[4px] transition-colors duration-200 hover:bg-black/85" onClick={() => setShowCropModal(true)} title="Rogner l'image">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                    <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
                    <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
                  </svg>
                  Rogner
                </button>
              </div>
              <button className="self-start bg-transparent border-none text-[var(--error)] text-[0.78rem] cursor-pointer p-0 hover:underline" onClick={() => setEditImageUrl(null)}>
                Supprimer l'image
              </button>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }} className="py-2 px-4 rounded-full bg-transparent text-[0.82rem] font-['Inter',inherit] cursor-pointer" onClick={handleCancelEdit}>Annuler</button>
            <button className="btn-primary" onClick={handleSaveEdit}>Enregistrer</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ color: "var(--text)" }} className="text-[1.05rem] font-bold mb-1 leading-[1.3] break-words">{post.title}</div>
          <div style={{ color: "var(--text-secondary)" }} className="text-[0.9rem] leading-[1.7] break-words whitespace-pre-wrap">
            {expanded || post.content.length <= 150 ? post.content : post.content.slice(0, 150) + "..."}
          </div>
          {post.content.length > 150 && (
            <button className="bg-transparent border-none text-[0.78rem] font-semibold text-[var(--accent)] cursor-pointer font-['Inter',inherit] p-0 mt-1 hover:underline" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Voir moins" : "Voir plus"}
            </button>
          )}
        </>
      )}

      {post.imageUrl && !editing && (
        <div className="mt-3 overflow-hidden" style={{ borderRadius: "var(--radius-sm)" }}>
          <img src={post.imageUrl} alt="Image du post" className="w-full max-h-[500px] object-cover block" style={{ borderRadius: "var(--radius-sm)" }} />
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--border)" }} className="flex items-center gap-5 mt-4 pt-3">
        <button className={`flex items-center gap-1 bg-transparent border-none text-[0.8rem] cursor-pointer font-['Inter',inherit] font-medium transition-colors duration-150 hover:text-[var(--accent)] ${likedByMe ? "!text-[var(--error)]" : ""}`} style={{ color: likedByMe ? "var(--error)" : "var(--text-tertiary)" }} onClick={handleLike}>
          <svg viewBox="0 0 24 24" fill={likedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          {likeCount > 0 && <span className="text-[0.75rem] font-bold">{likeCount}</span>}
        </button>

        <button className={`flex items-center gap-1 bg-transparent border-none text-[0.8rem] cursor-pointer font-['Inter',inherit] font-medium transition-colors duration-150 hover:text-[var(--accent)] ${showComments ? "!text-[var(--accent)]" : ""}`} style={{ color: "var(--text-tertiary)" }} onClick={() => setShowComments(!showComments)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {post.comments.length}
        </button>

        <button className="flex items-center gap-1 bg-transparent border-none text-[0.8rem] cursor-pointer font-['Inter',inherit] font-medium transition-colors duration-150 hover:text-[var(--accent)]" style={{ color: "var(--text-tertiary)" }} onClick={handleShare} title="Partager">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>

        {isAuthor && (
          <button className="flex items-center gap-1 bg-transparent border-none text-[0.8rem] cursor-pointer font-['Inter',inherit] font-medium transition-colors duration-150 hover:text-[var(--error)] ml-auto" style={{ color: "var(--text-tertiary)" }} onClick={handleDelete} title="Supprimer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        )}
      </div>

      {showComments && (
        <div style={{ borderTop: "1px solid var(--border)" }} className="mt-3 pt-3">
          <div className="flex flex-col gap-2">
            {rootComments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                onReply={setReplyTo}
                replies={post.comments.filter((r) => r.parentId === c.id) as never}
                depth={0}
              />
            ))}
          </div>
          {replyTo && (
            <div style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }} className="flex items-center gap-1 text-[0.75rem] text-[var(--accent-hover)] py-1.5 px-3 rounded-[var(--radius-sm)] mt-2">
              Réponse à <strong>{replyTo.author.name}</strong>
              <button className="ml-auto bg-transparent border-none text-[0.85rem] text-[var(--text-tertiary)] cursor-pointer leading-none hover:text-[var(--error)]" onClick={() => setReplyTo(null)}>✕</button>
            </div>
          )}
          <div className="flex gap-2 items-center mt-3">
            <input
              type="text"
              placeholder={replyTo ? `Répondre à ${replyTo.author.name}...` : "Écrire un commentaire..."}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
              style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", borderRadius: "var(--radius-full)" }}
              className="flex-1 py-2 px-3.5 text-[0.82rem] font-['Inter',inherit] outline-none transition-colors duration-200 focus:ring-2 focus:ring-[var(--accent-soft)] placeholder:text-[var(--text-tertiary)]"
            />
            <button style={{ background: "var(--accent)", color: "#fff" }} className="w-[34px] h-[34px] rounded-full border-none cursor-pointer grid place-items-center transition-colors duration-200 shrink-0" onClick={handleSendComment} onMouseEnter={(e) => (e.target as HTMLButtonElement).style.background = "var(--accent-hover)"} onMouseLeave={(e) => (e.target as HTMLButtonElement).style.background = "var(--accent)"}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
      {showCropModal && editImageUrl && (
        <ImageCropModal
          imageSrc={editImageUrl}
          onCrop={(cropped: string) => { setEditImageUrl(cropped); setShowCropModal(false); }}
          onCancel={() => setShowCropModal(false)}
        />
      )}
    </div>
  );
}
