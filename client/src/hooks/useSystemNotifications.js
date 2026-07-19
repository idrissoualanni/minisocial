// ============================================================
// useSystemNotifications.js — Notifications critiques système
// ============================================================
// Intercepte :
//   - Coupures / reconnexions réseau (online/offline)
//   - Erreurs GraphQL (401 auth expiré, 429 rate limit, 500 serveur)
//   - Reconnexion WebSocket
//   - Erreurs non attrapées (unhandled rejection)
// ============================================================

import { useEffect, useRef } from "react";
import useStore from "../store";

export default function useSystemNotifications() {
  const addToast = useStore((s) => s.addToast);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    // --- Réseau offline → online ---
    const handleOnline = () => {
      if (wasOfflineRef.current) {
        addToast("Connexion rétablie", "success", 4000);
        wasOfflineRef.current = false;
      }
    };

    const handleOffline = () => {
      wasOfflineRef.current = true;
      addToast(
        "Connexion perdue — les données peuvent ne pas être à jour",
        "warning",
        0 // permanent jusqu'à rétablissement
      );
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Vérifier l'état initial
    if (!navigator.onLine) {
      wasOfflineRef.current = true;
      addToast(
        "Vous êtes hors ligne",
        "warning",
        0
      );
    }

    // --- Unhandled promise rejections (erreurs non attrapées) ---
    const handleUnhandledRejection = (e) => {
      const reason = e.reason;
      const msg = reason?.message || String(reason);

      // Erreurs GraphQL connues — on les laisse passer aux composants
      if (msg.includes("GraphQL error") || msg.includes("Failed to fetch")) {
        // Ne pas dupliquer si c'est une erreur réseau déjà gérée par offline
        if (navigator.onLine) {
          addToast("Erreur de communication avec le serveur", "error", 5000);
        }
        return;
      }

      // Rate limiting
      if (msg.includes("429") || msg.includes("rate limit") || msg.includes("Trop de requêtes")) {
        addToast("Trop de requêtes — réessaie dans quelques secondes", "warning", 6000);
        return;
      }

      // Autres erreurs
      if (msg.includes("ECONNREFUSED") || msg.includes("NetworkError")) {
        addToast("Le serveur est injoignable", "error", 6000);
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [addToast]);
}

/**
 * Hook à appeler dans un composant pour intercepter les erreurs Apollo
 * et les convertir en notifications système.
 *
 * Usage dans un composant :
 *   const { data, error } = useQuery(MA_QUERY);
 *   useApolloErrorToast(error);
 */
export function useApolloErrorToast(error) {
  const addToast = useStore((s) => s.addToast);
  const lastErrorRef = useRef(null);

  useEffect(() => {
    if (!error) return;
    // Éviter les doublons (même message dans les 2s)
    const key = error.message;
    if (lastErrorRef.current === key) return;
    lastErrorRef.current = key;
    setTimeout(() => { lastErrorRef.current = null; }, 2000);

    const msg = error.message;

    if (msg.includes("Unauthenticated") || msg.includes("401") || msg.includes("Token")) {
      addToast("Session expirée — reconnecte-toi", "error", 6000);
    } else if (msg.includes("429") || msg.includes("rate limit") || msg.includes("Trop de requêtes")) {
      addToast("Trop de requêtes — patiente un instant", "warning", 6000);
    } else if (msg.includes("Not found") || msg.includes("404")) {
      addToast("Ressource introuvable", "warning", 4000);
    } else if (msg.includes("Network") || msg.includes("Failed to fetch")) {
      addToast("Erreur réseau — vérifie ta connexion", "error", 5000);
    } else {
      addToast(`Erreur: ${msg}`, "error", 5000);
    }
  }, [error, addToast]);
}
