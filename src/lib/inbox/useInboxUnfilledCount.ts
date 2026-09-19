import { useCallback, useEffect, useState } from "react";
import { isAuthApiEnabled } from "../auth/api.js";
import { isLocalDevSession } from "../auth/session.js";
import { fetchInbox, type InboxItem } from "./api.js";
import { countUnfilledInbox, INBOX_SOLVED_EVENT } from "./solved.js";

export function useInboxUnfilledCount(): number {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [, setSolvedTick] = useState(0);
  const apiReady = isAuthApiEnabled() && !isLocalDevSession();

  const refresh = useCallback(() => {
    if (!apiReady) {
      setItems([]);
      return;
    }
    void fetchInbox().then((result) => {
      if ("error" in result) return;
      setItems(result.items);
    });
  }, [apiReady]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function bump() {
      setSolvedTick((n) => n + 1);
    }
    window.addEventListener(INBOX_SOLVED_EVENT, bump);
    window.addEventListener("storage", bump);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(INBOX_SOLVED_EVENT, bump);
      window.removeEventListener("storage", bump);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return countUnfilledInbox(items);
}
