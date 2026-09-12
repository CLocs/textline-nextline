import { useState, type FormEvent } from "react";
import { updateMyDisplayName } from "../lib/auth/api";
import type { AuthUser } from "../lib/auth/session";

type Props = {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
  onLogout: () => void;
};

export function AuthBar({ user, onUpdated, onLogout }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateMyDisplayName(draft);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onUpdated(result.user);
    setEditing(false);
  }

  function startEdit() {
    setDraft(user.displayName ?? "");
    setError(null);
    setEditing(true);
  }

  return (
    <div className="auth-bar">
      {editing ? (
        <form className="auth-name-form" onSubmit={(event) => void handleSave(event)}>
          <label className="sr-only" htmlFor="display-name">
            Display name
          </label>
          <input
            id="display-name"
            type="text"
            maxLength={40}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            placeholder="Your name"
          />
          <button type="submit" className="button primary" disabled={saving || !draft.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            className="auth-user auth-user-button"
            title={`${user.email} — click to edit display name`}
            onClick={startEdit}
          >
            {user.displayName ?? user.email}
          </button>
          <button type="button" className="button ghost" onClick={onLogout}>
            Log out
          </button>
        </>
      )}
      {error && (
        <p className="feedback wrong auth-name-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
