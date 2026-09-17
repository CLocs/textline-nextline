import { useEffect, useState } from "react";
import { acceptFriendInvite, fetchInvitePreview } from "../lib/friends/api";

type Props = {
  token: string;
  onDone: () => void;
  onBack: () => void;
};

export function FriendAcceptScreen({ token, onDone, onBack }: Props) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [alreadyFriends, setAlreadyFriends] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchInvitePreview(token).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setDisplayName(result.displayName);
      setIsSelf(Boolean(result.isSelf));
      setAlreadyFriends(Boolean(result.alreadyFriends));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    setBusy(true);
    setError(null);
    const result = await acceptFriendInvite(token);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setAccepted(true);
    setAlreadyFriends(Boolean(result.alreadyFriends));
  }

  return (
    <section className="panel">
      <div className="section-header">
        <button type="button" className="button ghost back-link" onClick={onBack}>
          ← Home
        </button>
        <h2>Add friend</h2>
      </div>

      {loading ? (
        <p className="muted">Looking up invite…</p>
      ) : error && !displayName ? (
        <p className="feedback wrong" role="alert">
          {error}
        </p>
      ) : isSelf ? (
        <p className="muted">This is your own friend link. Send it to someone else.</p>
      ) : alreadyFriends || accepted ? (
        <>
          <p>
            {alreadyFriends && !accepted
              ? `You and ${displayName} are already friends.`
              : `You and ${displayName} are now friends.`}
          </p>
          <button type="button" className="button primary" onClick={onDone}>
            View friends
          </button>
        </>
      ) : (
        <>
          <p>
            <strong>{displayName}</strong> invited you to be friends.
          </p>
          <p className="muted">You&apos;ll each show up on the other&apos;s friends list. No public directory.</p>
          <button type="button" className="button primary" disabled={busy} onClick={() => void handleAccept()}>
            {busy ? "Adding…" : "Accept"}
          </button>
        </>
      )}

      {error && displayName ? (
        <p className="feedback wrong" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
