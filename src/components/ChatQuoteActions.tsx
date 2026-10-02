import { useState } from "react";
import { isStarred, toggleStar } from "../lib/stars/sync";
import { getStoredUser } from "../lib/auth/session";
import { isPilotCurator } from "../lib/content/curators";
import { LineSendControl } from "./LineSendControl";

type Props = {
  titleId: string;
  lineIndex: number;
  lineText: string;
};

/** Star + reshare for any chat quote card. */
export function ChatQuoteActions({ titleId, lineIndex, lineText }: Props) {
  const [starred, setStarred] = useState(() => isStarred(titleId, lineIndex));
  const [busy, setBusy] = useState(false);

  async function handleStar() {
    if (busy) return;
    setBusy(true);
    const next = await toggleStar(titleId, lineIndex, lineText);
    setStarred(next);
    setBusy(false);
  }

  const canCurate = isPilotCurator(getStoredUser());

  return (
    <div className="chat-quote-actions">
      {canCurate ? (
        <button
          type="button"
          className={`curate-star chat-quote-star${starred ? " starred" : ""}`}
          aria-pressed={starred}
          aria-label={starred ? "Unstar line" : "Star line"}
          disabled={busy}
          onClick={() => void handleStar()}
        >
          {starred ? "★" : "☆"}
        </button>
      ) : null}
      <LineSendControl titleId={titleId} lineIndex={lineIndex} />
    </div>
  );
}
