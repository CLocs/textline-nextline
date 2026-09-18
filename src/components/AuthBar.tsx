import type { AuthUser } from "../lib/auth/session";
import { useInboxUnfilledCount } from "../lib/inbox/useInboxUnfilledCount";

type Props = {
  user: AuthUser;
  onProfile: () => void;
  onInbox: () => void;
  onCatalog?: () => void;
};

function InboxBellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Zm8-6.2V11a8 8 0 1 0-16 0v4.8L2 18v1h20v-1l-2-2.2Z"
      />
    </svg>
  );
}

export function AuthBar({ user, onProfile, onInbox, onCatalog }: Props) {
  const unfilled = useInboxUnfilledCount();
  const inboxLabel = `Inbox, ${unfilled} unfilled quote${unfilled === 1 ? "" : "s"}`;

  return (
    <div className="auth-bar">
      {onCatalog ? (
        <button type="button" className="button ghost" onClick={onCatalog}>
          Catalog
        </button>
      ) : null}
      {unfilled > 0 ? (
        <button
          type="button"
          className="button ghost inbox-notify"
          aria-label={inboxLabel}
          title={inboxLabel}
          onClick={onInbox}
        >
          <InboxBellIcon />
          <span className="inbox-notify-badge">{unfilled}</span>
        </button>
      ) : null}
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
