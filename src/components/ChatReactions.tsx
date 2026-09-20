import { useState } from "react";
import {
  CHAT_REACTION_EMOJIS,
  toggleChatReaction,
  type ChatReaction,
} from "../lib/chats/api";

type Props = {
  targetKind: "text" | "quote";
  targetId: string;
  reactions: ChatReaction[];
  peerUserId?: string;
  groupId?: string;
  onReactions: (reactions: ChatReaction[]) => void;
};

export function ChatReactions({
  targetKind,
  targetId,
  reactions,
  peerUserId,
  groupId,
  onReactions,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleToggle(emoji: string) {
    if (busy || !targetId) return;
    setBusy(true);
    const result = await toggleChatReaction({
      targetKind,
      targetId,
      emoji,
      peerUserId,
      groupId,
    });
    setBusy(false);
    if ("error" in result) return;
    onReactions(result.reactions);
    setOpen(false);
  }

  return (
    <div className="chats-reactions">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`chats-reaction-chip${reaction.reacted ? " is-mine" : ""}`}
          disabled={busy}
          aria-pressed={reaction.reacted}
          onClick={() => void handleToggle(reaction.emoji)}
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}
      <div className="chats-reaction-add-wrap">
        <button
          type="button"
          className="button ghost chats-reaction-add"
          aria-expanded={open}
          aria-label="Add reaction"
          disabled={busy}
          onClick={() => setOpen((value) => !value)}
        >
          :)
        </button>
        {open ? (
          <div className="chats-reaction-picker" role="listbox" aria-label="Reactions">
            {CHAT_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="chats-reaction-pick"
                disabled={busy}
                onClick={() => void handleToggle(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
