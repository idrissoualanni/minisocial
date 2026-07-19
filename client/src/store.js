// client/src/store.js
import { create } from "zustand";
import { persist } from "zustand/middleware";

let toastId = 0;

const useStore = create(
  persist(
    (set, get) => ({
      // --- Auth ---
      currentUser: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (user, access, refresh) =>
        set({ currentUser: user, accessToken: access, refreshToken: refresh }),

      logout: () => {
        const { refreshToken } = get();
        if (refreshToken) {
          fetch("http://localhost:4000/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `mutation { logout(refreshToken: "${refreshToken}") }`,
            }),
          }).catch(() => {});
        }
        set({ currentUser: null, accessToken: null, refreshToken: null });
      },

      updateProfile: (updates) =>
        set((state) => ({
          currentUser: state.currentUser ? { ...state.currentUser, ...updates } : null,
        })),

      // --- UI ---
      view: "feed",
      setView: (view) => set({ view }),

      chatTarget: null,
      groupTarget: null,
      profileUser: null,
      meetingTarget: null,

      openChat: (user) => set({ chatTarget: user, groupTarget: null, view: "chat" }),
      openGroupChat: (group) => set({ groupTarget: group, chatTarget: null, view: "chat" }),
      openProfile: (user) => set({ profileUser: user, view: "profile" }),
      openMeeting: (meeting) => set({ meetingTarget: meeting, view: "meeting" }),
      closeChat: () => set({ chatTarget: null, groupTarget: null }),

      // --- Toast queue (multi-toasts avec niveaux) ---
      toasts: [],

      addToast: (msg, type = "info", duration = 4000) => {
        const id = ++toastId;
        set((state) => ({
          toasts: [...state.toasts, { id, msg, type }],
        }));
        if (duration > 0) {
          setTimeout(() => {
            set((state) => ({
              toasts: state.toasts.filter((t) => t.id !== id),
            }));
          }, duration);
        }
        return id;
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      // --- Rétrocompatibilité ---
      showToast: (msg, type = "success") => {
        const state = get();
        state.addToast(msg, type === "error" ? "error" : type === "success" ? "success" : "info", 3000);
      },

      toast: null, // legacy, non utilisé
    }),
    {
      name: "minisocial-store",
      partialize: (state) => ({
        currentUser: state.currentUser,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

export default useStore;
