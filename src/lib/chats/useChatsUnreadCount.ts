import { useCallback, useEffect, useState } from "react";
import { isAuthApiEnabled } from "../auth/api.js";
import { isLocalDevSession } from "../auth/session.js";
import {
  chatsUnreadBreakdown,
  chatsUnreadTotal,
  fetchChats,
  type ChatThreadSummary,
} from "./api.js";

export function useChatsUnreadCount(): number {
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
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return chatsUnreadTotal(threads);
}

export function useChatsUnreadBreakdown(): { quote: number; text: number } {
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
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return chatsUnreadBreakdown(threads);
}
