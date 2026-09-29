import { useEffect, useRef, useState } from "react";
import {
  fetchAvatarObjectUrl,
  isAuthApiEnabled,
  prepareAvatarFile,
  removeMyAvatar,
  uploadMyAvatar,
} from "../lib/auth/api";
import { isLocalDevSession, type AuthUser } from "../lib/auth/session";
import { friendInitials } from "../lib/friends/faces";

type Props = {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
};

export function ProfileAvatar({ user, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = isAuthApiEnabled() && !isLocalDevSession();
  const name = user.displayName?.trim() || "You";

  useEffect(() => {
    if (!live || !user.avatarAt) {
      setSrc(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    void fetchAvatarObjectUrl(user.id).then((next) => {
      if (cancelled) {
        if (next) URL.revokeObjectURL(next);
        return;
      }
      url = next;
      setSrc(next);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [live, user.avatarAt, user.id]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const jpeg = await prepareAvatarFile(file);
      const result = await uploadMyAvatar(jpeg);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onUpdated({ ...user, avatarAt: result.avatarAt });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that image");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    const result = await removeMyAvatar();
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onUpdated({ ...user, avatarAt: null });
  }

  return (
    <div className="profile-avatar">
      <span className="friend-face profile-avatar-face" aria-hidden="true">
        {src ? (
          <img className="friend-face-photo" src={src} alt="" />
        ) : (
          <span className="friend-face-initials">{friendInitials(name)}</span>
        )}
      </span>
      <div className="profile-avatar-actions">
        {live ? (
          <>
            <input
              ref={inputRef}
              className="profile-avatar-file"
              type="file"
              accept="image/*"
              aria-label="Upload profile photo"
              disabled={busy}
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <button
              type="button"
              className="button ghost"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Working…" : user.avatarAt ? "Change photo" : "Upload photo"}
            </button>
            {user.avatarAt ? (
              <button type="button" className="button ghost" disabled={busy} onClick={() => void handleRemove()}>
                Remove
              </button>
            ) : null}
          </>
        ) : (
          <p className="muted">Profile photos need a signed-in account on the live API.</p>
        )}
        {error ? (
          <p className="feedback wrong" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
