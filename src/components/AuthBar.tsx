import type { AuthUser } from "../lib/auth/session";
import { useChatsUnreadCount } from "../lib/chats/useChatsUnreadCount";

type Props = {
  user: AuthUser;
  onProfile: () => void;
  onChats: () => void;
  onSearch?: () => void;
  onCatalog?: () => void;
};

function ChatsMessageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9A2.5 2.5 0 0 1 17.5 17H9.2L5 20.6a.75.75 0 0 1-1.2-.6V5.5ZM6.5 4.5a1 1 0 0 0-1 1V18l2.9-2.5a1 1 0 0 1 .6-.2h8.5a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-11Z"
      />
    </svg>
  );
}

export function AuthBar({ user, onProfile, onChats, onSearch, onCatalog }: Props) {
  const unread = useChatsUnreadCount();
  const chatsLabel = `Chats, ${unread} unread`;

  return (
    <div className="auth-bar">
      {onSearch ? (
        <button type="button" className="button ghost" onClick={onSearch}>
          Search
        </button>
      ) : null}
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
        <ChatsMessageIcon />
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
