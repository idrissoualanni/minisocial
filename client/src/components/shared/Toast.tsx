// ============================================================
// Toast.tsx — Système de notifications multi-toasts
// Niveaux : info | success | warning | error
// Accessibilité : aria-live (annonce lecteur d'écran sans vol de focus),
// bouton de fermeture nommé, fermeture clavier Escape.
// ============================================================

import useStore from "../../store";
import type { CSSProperties, ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";

const STYLES: Record<ToastType, CSSProperties> = {
  success: { background: "var(--success-soft)", borderColor: "var(--success)", color: "var(--success)" },
  error:   { background: "var(--error-soft)", borderColor: "var(--error)", color: "var(--error)" },
  warning: { background: "var(--warning-soft)", borderColor: "var(--warning)", color: "var(--warning)" },
  info:    { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" },
};

const ICONS: Record<ToastType, ReactNode> = {
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
    </svg>
  ),
};

const TYPE_LABEL: Record<ToastType, string> = {
  success: "Succès",
  error: "Erreur",
  warning: "Attention",
  info: "Information",
};

export default function Toast() {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  return (
    <div
      className="fixed bottom-6 right-6 z-[1000] flex flex-col gap-2.5 pointer-events-none max-w-sm"
      role="status"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 py-3 px-4 rounded-xl border-l-4 text-sm font-semibold cursor-pointer transition-all duration-300 ease-in"
          style={{
            ...STYLES[t.type as ToastType],
            boxShadow: "var(--shadow-md)",
            animation: "toastSlideIn 0.3s ease forwards",
            opacity: 0,
          }}
          onClick={() => removeToast(t.id)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") {
              e.stopPropagation();
              removeToast(t.id);
            }
          }}
        >
          {ICONS[t.type as ToastType] || ICONS.info}
          <span className="flex-1 leading-snug">
            <span className="visually-hidden">{TYPE_LABEL[t.type as ToastType]} : </span>
            {t.msg}
          </span>
          <button
            className="shrink-0 opacity-40 hover:opacity-100 focus-visible:opacity-100 transition-opacity bg-transparent border-none cursor-pointer text-inherit p-0 leading-none"
            aria-label={`Fermer la notification : ${t.msg}`}
            onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
