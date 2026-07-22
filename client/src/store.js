// client/src/store.js
import { create } from "zustand";
import { persist } from "zustand/middleware";

let toastId = 0;

const useStore = create(
  persist(
    (set, get) => ({
      // --- Auth (synced from Better Auth session via App.jsx GET_ME) ---
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),

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

      toast: null,
    }),
    {
      name: "minisocial-store",
      partialize: (state) => ({
        currentUser: state.currentUser,
      }),
    }
  )
);

export default useStore;
