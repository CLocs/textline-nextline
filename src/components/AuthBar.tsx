import type { AuthUser } from "../lib/auth/session";
import { useChatsUnreadCount } from "../lib/chats/useChatsUnreadCount";

type Props = {
  user: AuthUser;
  onProfile: () => void;
  onChats: () => void;
  onCatalog?: () => void;
};

function ChatsBellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Zm8-6.2V11a8 8 0 1 0-16 0v4.8L2 18v1h20v-1l-2-2.2Z"
      />
    </svg>
  );
}

export function AuthBar({ user, onProfile, onChats, onCatalog }: Props) {
  const unread = useChatsUnreadCount();
  const chatsLabel = `Chats, ${unread} unread`;

  return (
    <div className="auth-bar">
      {onCatalog ? (
        <button type="button" className="button ghost" onClick={onCatalog}>
          Catalog
        </button>
      ) : null}
      <button
        type="button"
        className="button ghost inbox-notify"
        aria-label={chatsLabel}
        title={chatsLabel}
        onClick={onChats}
      >
        <ChatsBellIcon />
        {unread > 0 ? <span className="inbox-notify-badge">{unread}</span> : null}
      </button>
      <button
        type="button"
        className="button ghost auth-user-button"
        title={`${user.email} — open profile`}
        onClick={onProfile}
      >
        {user.displayName ?? user.email}
      </button>
    </div>
  );
}
