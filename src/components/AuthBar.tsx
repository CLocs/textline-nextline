import type { AuthUser } from "../lib/auth/session";

type Props = {
  user: AuthUser;
  onProfile: () => void;
  onCatalog?: () => void;
};

export function AuthBar({ user, onProfile, onCatalog }: Props) {
  return (
    <div className="auth-bar">
      {onCatalog ? (
        <button type="button" className="button ghost" onClick={onCatalog}>
          Catalog
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
