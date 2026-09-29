import type { AuthUser } from "../lib/auth/session";
import { useChatsUnreadCount } from "../lib/chats/useChatsUnreadCount";

type Props = {
  user: AuthUser;
  onProfile: () => void;
  onChats: () => void;
  onHome?: () => void;
  onSearch?: () => void;
  onBrowseLibrary?: () => void;
  onCatalog?: () => void;
};

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11.47 3.84a.75.75 0 0 1 1.06 0l8.25 8.25a.75.75 0 1 1-1.06 1.06l-.97-.97V19.5A1.5 1.5 0 0 1 17.25 21h-3a.75.75 0 0 1-.75-.75V15h-3v5.25a.75.75 0 0 1-.75.75h-3A1.5 1.5 0 0 1 5.25 19.5v-7.32l-.97.97a.75.75 0 1 1-1.06-1.06l8.25-8.25Z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.5 3a7.5 7.5 0 0 1 5.95 12.08l3.74 3.73a1 1 0 0 1-1.42 1.42l-3.73-3.74A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
      />
    </svg>
  );
}

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

export function AuthBar({
  user,
  onProfile,
  onChats,
  onHome,
  onSearch,
  onBrowseLibrary,
  onCatalog,
}: Props) {
  const unread = useChatsUnreadCount();
  const chatsLabel = `Chats, ${unread} unread`;
  const hasTools = Boolean(onHome || onSearch || onBrowseLibrary || onCatalog);

  return (
    <>
      <div className="auth-bar-account">
        <button
          type="button"
          className="button ghost auth-nav-button inbox-notify"
          aria-label={chatsLabel}
          title={chatsLabel}
          onClick={onChats}
        >
          <ChatsMessageIcon />
          Chats
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
      {hasTools ? (
        <nav className="auth-bar-tools" aria-label="Library">
          {onHome ? (
            <button type="button" className="button ghost auth-nav-button" onClick={onHome}>
              <HomeIcon />
              Home
            </button>
          ) : null}
          {onSearch ? (
            <button type="button" className="button ghost auth-nav-button" onClick={onSearch}>
              <SearchIcon />
              Search
            </button>
          ) : null}
          {onBrowseLibrary ? (
            <button type="button" className="button ghost" onClick={onBrowseLibrary}>
              Browse full library
            </button>
          ) : null}
          {onCatalog ? (
            <button type="button" className="button ghost" onClick={onCatalog}>
              Catalog
            </button>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
