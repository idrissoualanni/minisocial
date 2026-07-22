// ============================================================
// Search.jsx — Recherche temps réel (debounce 300ms)
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import PostCard from "../feed/PostCard";
import type { Post } from "@/types";

interface SearchPostsData {
  search: Post[];
}

const SEARCH_POSTS = gql`
  query SearchPosts($query: String!) {
    search(query: $query) {
      id title content imageUrl createdAt
      author { id name }
      comments { id text createdAt parentId author { id name } }
      likeCount
      likes { id }
    }
  }
`;

export default function Search() {
  const [query, setQuery] = useState("");
  const [search, { data, loading }] = useLazyQuery<SearchPostsData>(SEARCH_POSTS, {
    fetchPolicy: "cache-and-network",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Ref pour garder la dernière valeur de query sans rerender
  const queryRef = useRef(query);
  queryRef.current = query;

  // Debounce : utilise le ref pour éviter les closures périmées
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) return;
    debounceRef.current = setTimeout(() => {
      search({ variables: { query: q } });
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value);

  const results = data?.search || [];
  const showResults = query.trim().length > 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex gap-2 items-center mb-6">
        <input
          ref={inputRef}
          type="text"
          placeholder="Rechercher un post, un auteur..."
          value={query}
          onChange={handleChange}
          autoFocus
          className="flex-1 py-3 px-4 border rounded-xl text-sm bg-white outline-none transition-all duration-200 placeholder:opacity-50"
          style={{
            borderColor: "var(--border)",
            color: "var(--text)",
            fontFamily: "inherit",
            boxShadow: "var(--shadow-sm)",
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-soft), var(--shadow-sm)"; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "var(--shadow-sm)"; }}
        />
        {query && (
          <button className="w-8 h-8 rounded-full border grid place-items-center shrink-0 transition-all duration-150" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)", color: "var(--text-tertiary)" }} onClick={() => { setQuery(""); inputRef.current?.focus(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {loading && showResults && (
        <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-tertiary)" }}>
          <div className="w-4 h-4 border-2 rounded-full" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          <span>Recherche...</span>
        </div>
      )}

      {!loading && showResults && results.length > 0 && (
        <div style={{ animation: "fadeIn 0.2s ease" }}>
          <div className="text-xs mb-3 font-semibold" style={{ color: "var(--text-tertiary)" }}>
            {results.length} résultat{results.length !== 1 ? "s" : ""} pour « {query} »
          </div>
          <div className="flex flex-col gap-4">
            {results.map((post) => (
              <PostCard
                key={post.id}
                post={post}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && showResults && data && results.length === 0 && (
        <div className="text-center py-12 px-4" style={{ color: "var(--text-tertiary)" }}>
          <p>Aucun résultat pour « {query} »</p>
        </div>
      )}

      {!showResults && (
        <div className="text-center py-16 px-4 flex flex-col items-center gap-3" style={{ color: "var(--text-tertiary)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="32" height="32" className="opacity-40">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p className="text-sm opacity-60">Tape pour rechercher — résultats en temps réel</p>
        </div>
      )}
    </div>
  );
}
