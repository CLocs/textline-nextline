import type { AuthUser } from "../lib/auth/session";

type Props = {
  user: AuthUser;
  onProfile: () => void;
  onLogout: () => void;
};

export function AuthBar({ user, onProfile, onLogout }: Props) {
  return (
    <div className="auth-bar">
      <button
        type="button"
        className="auth-user auth-user-button"
        title={`${user.email} — open profile`}
        onClick={onProfile}
      >
        {user.displayName ?? user.email}
      </button>
      <button type="button" className="button ghost" onClick={onLogout}>
        Log out
      </button>
    </div>
  );
}
