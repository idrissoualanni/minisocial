import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  role?: string;
}

interface Toast {
  id: number;
  msg: string;
  type: string;
}

interface StoreState {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;

  view: string;
  setView: (view: string) => void;

  chatTarget: User | null;
  groupTarget: { id: string; name: string } | null;
  profileUser: User | null;
  meetingTarget: { id: string; [key: string]: unknown } | null;

  openChat: (user: User) => void;
  openGroupChat: (group: { id: string; name: string }) => void;
  openProfile: (user: User) => void;
  openMeeting: (meeting: { id: string; [key: string]: unknown }) => void;
  closeChat: () => void;

  toasts: Toast[];
  addToast: (msg: string, type?: string, duration?: number) => number;
  removeToast: (id: number) => void;
  showToast: (msg: string, type?: string) => void;

  toast: null;
}

let toastId = 0;

const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),

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
