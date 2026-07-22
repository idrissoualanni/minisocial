// ============================================================
// CommentItem.jsx — Commentaire avec réponses threadées
// ============================================================

import { getAvatarGradient, timeAgo } from "../utils";
import useStore from "../store";

export default function CommentItem({ comment, onReply, replies = [], depth = 0 }) {
  const openProfile = useStore((s) => s.openProfile);

  return (
    <div className={`flex gap-2.5 py-2 ${depth > 0 ? "pl-0" : ""}`}>
      <div
        className="w-8 h-8 rounded-full grid place-items-center font-bold text-[0.7rem] text-white shrink-0 cursor-pointer transition-opacity duration-150 hover:opacity-75"
        style={{ background: getAvatarGradient(comment.author.id) }}
        onClick={() => openProfile?.(comment.author)}
      >
        {comment.author.name.charAt(0)}
      </div>
      <div style={{ background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)" }} className="flex-1 py-2.5 px-3.5">
        <div>
          <span style={{ color: "var(--text)" }} className="font-bold text-[0.78rem] cursor-pointer transition-opacity duration-150 hover:underline hover:opacity-100" onClick={() => openProfile?.(comment.author)}>
            {comment.author.name}
          </span>
          <span style={{ color: "var(--text-tertiary)" }} className="text-[0.65rem] ml-1.5 font-['DM_Mono',monospace]">{timeAgo(comment.createdAt)}</span>
        </div>
        <div style={{ color: "var(--text-secondary)" }} className="text-[0.82rem] mt-0.5 break-words whitespace-pre-wrap">{comment.text}</div>
        <button className="bg-transparent border-none text-[0.7rem] font-bold cursor-pointer font-['Inter',inherit] py-0.5 px-0 transition-colors duration-150" style={{ color: "var(--text-tertiary)" }} onMouseEnter={(e) => e.target.style.color = "var(--accent)"} onMouseLeave={(e) => e.target.style.color = "var(--text-tertiary)"} onClick={() => onReply?.(comment)}>
          Répondre
        </button>

        {/* Réponses imbriquées */}
        {replies.length > 0 && depth < 3 && (
          <div className="mt-1.5 pl-3.5 flex flex-col gap-1.5" style={{ borderLeft: "2px solid var(--border)" }}>
            {replies.map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                onReply={onReply}
                replies={[]}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
