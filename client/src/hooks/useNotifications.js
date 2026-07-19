// ============================================================
// useNotifications.js — Hook pour les notifications natives
// ============================================================
// Demande la permission au navigateur au montage.
// Expose une fonction notify() pour envoyer des notifs système.
// ============================================================

import { useEffect, useCallback, useRef } from "react";

/**
 * Demande la permission pour les notifications natives au montage.
 */
export function useNotificationSetup() {
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
}

/**
 * Retourne une fonction pour envoyer une notification native.
 * @returns {(title: string, body: string) => void}
 */
export function useNotify() {
  const permissionRef = useRef(
    "Notification" in window ? Notification.permission : "denied"
  );

  useEffect(() => {
    if ("Notification" in window) {
      permissionRef.current = Notification.permission;
    }
  });

  const notify = useCallback((title, body) => {
    if (
      "Notification" in window &&
      permissionRef.current === "granted"
    ) {
      new Notification(title, {
        body,
        icon: "/vite.svg",
        badge: "/vite.svg",
      });
    }
  }, []);

  return notify;
}
