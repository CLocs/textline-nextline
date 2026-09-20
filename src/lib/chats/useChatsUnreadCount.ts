import { useCallback, useEffect, useState } from "react";
import { isAuthApiEnabled } from "../auth/api.js";
import { isLocalDevSession } from "../auth/session.js";
import {
  chatsUnreadBreakdown,
  chatsUnreadTotal,
  fetchChats,
  type ChatThreadSummary,
} from "./api.js";

const UNREAD_POLL_MS = 12000;

function useChatsThreads(): ChatThreadSummary[] {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const apiReady = isAuthApiEnabled() && !isLocalDevSession();

  const refresh = useCallback(() => {
    if (!apiReady) {
      setThreads([]);
      return;
    }
    void fetchChats().then((result) => {
      if ("error" in result) return;
      setThreads(result);
    });
  }, [apiReady]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onFocusOrVisible() {
      if (document.visibilityState === "hidden") return;
      refresh();
    }
    const intervalId = window.setInterval(onFocusOrVisible, UNREAD_POLL_MS);
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [refresh]);

  return threads;
}

export function useChatsUnreadCount(): number {
  return chatsUnreadTotal(useChatsThreads());
}

export function useChatsUnreadBreakdown(): { quote: number; text: number } {
  return chatsUnreadBreakdown(useChatsThreads());
}
