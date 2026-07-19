// ============================================================
// useHeartbeat.js — Signale la présence toutes les 15s
// ============================================================

import { useEffect } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import useStore from "../store";

const UPDATE_LAST_SEEN = gql`
  mutation UpdateLastSeen {
    updateLastSeen
  }
`;

export function useHeartbeat(currentUser) {
  const storeUser = useStore((s) => s.currentUser);
  const user = currentUser || storeUser;
  const [updateLastSeen] = useMutation(UPDATE_LAST_SEEN);

  useEffect(() => {
    if (!user) return;

    // Heartbeat immédiat
    updateLastSeen();

    // Puis toutes les 15 secondes
    const interval = setInterval(() => {
      updateLastSeen();
    }, 15_000);

    return () => clearInterval(interval);
  }, [user?.id, updateLastSeen]);
}
