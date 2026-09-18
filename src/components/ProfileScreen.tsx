import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CatalogEntry } from "../types/content";
import type { AuthUser } from "../lib/auth/session";
import { fetchSharedRuns, updateMyDisplayName } from "../lib/auth/api";
import { fetchMyRuns, shareCompletedRun, type StoredRun } from "../lib/runs/api";
import { cohortSummary } from "../lib/runs/cohort";
import { historyTitleLabel, summarizeRuns } from "../lib/content/playedRails";
import { GAME_MODES, type GameMode } from "../types/game";
import type { ProfileTab } from "../lib/routing/hash";
import { FriendsPanel } from "./FriendsPanel";
import { InboxPanel } from "./InboxPanel";

type Props = {
  user: AuthUser;
  tab: ProfileTab;
  entries: CatalogEntry[];
  onTab: (tab: ProfileTab) => void;
  onBack: () => void;
  onUpdated: (user: AuthUser) => void;
  onPlayShare: (shareId: string) => void;
  onLogout: () => void;
};

function modeLabel(mode: GameMode): string {
  return GAME_MODES.find((item) => item.id === mode)?.label ?? mode;
}

function gameLabel(run: StoredRun): string {
  const length = run.length === "mini" ? "Mini" : "Full";
  return `${length} · ${modeLabel(run.mode)}`;
}

function thumbLabel(thumb: StoredRun["thumb"]): string | null {
  if (thumb === "up") return "Thumbs up";
  if (thumb === "down") return "Thumbs down";
  return null;
}

function scoreLabel(run: StoredRun): string {
  const score = `${run.correctCount} / ${run.questionTotal} · ${run.wrongCount} wrong · ${run.skipCount} skip`;
  const thumb = thumbLabel(run.thumb);
  return thumb ? `${score} · ${thumb}` : score;
}

function canShareMini(run: StoredRun): boolean {
  return run.length === "mini" && Boolean(run.shareId || run.questionQueue?.length);
}

function playShareUrl(shareId: string): string {
  return `${window.location.origin}/#/play/${shareId}`;
}

async function copyShareUrl(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

function HistoryMatchRow({
  run,
  entries,
}: {
  run: StoredRun;
  entries: CatalogEntry[];
}) {
  const [shareId, setShareId] = useState(run.shareId);
  const [cohortLine, setCohortLine] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  useEffect(() => {
    setShareId(run.shareId);
  }, [run.shareId]);

  useEffect(() => {
    if (!shareId) {
      setCohortLine(null);
      return;
    }
    let cancelled = false;
    void fetchSharedRuns(shareId).then((players) => {
      if (cancelled) return;
      setCohortLine(cohortSummary(players, run.questionTotal));
    });
    return () => {
      cancelled = true;
    };
  }, [shareId, run.questionTotal]);

  async function handleShare() {
    setShareBusy(true);
    setShareNote(null);
    if (shareId) {
      const url = playShareUrl(shareId);
      const copied = await copyShareUrl(url);
      setShareNote(copied ? `Link copied: ${url}` : url);
      setShareBusy(false);
      return;
    }

    const result = await shareCompletedRun(run.id);
    if ("error" in result) {
      setShareNote(result.error);
      setShareBusy(false);
      return;
    }

    setShareId(result.shareId);
    const copied = await copyShareUrl(result.url);
    setShareNote(copied ? `Link copied: ${result.url}` : result.url);
    setShareBusy(false);
  }

  return (
    <div className="history-match">
      <div className="title-card">
        <span className="title-card-name">
          {gameLabel(run)} · {historyTitleLabel(run.titleId, entries)}
        </span>
        <span className="title-card-meta">{scoreLabel(run)}</span>
      </div>
      {canShareMini(run) && (
        <div className="history-match-footer">
          <button
            type="button"
            className="button ghost"
            disabled={shareBusy}
            onClick={() => void handleShare()}
          >
            {shareBusy ? "Sharing…" : shareId ? "Copy share link" : "Share"}
          </button>
          {cohortLine && <p className="history-match-cohort">{cohortLine}</p>}
          {shareNote && <p className="share-message">{shareNote}</p>}
        </div>
      )}
    </div>
  );
}

export function ProfileScreen({ user, tab, entries, onTab, onBack, onUpdated, onPlayShare, onLogout }: Props) {
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(user.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchMyRuns().then((next) => {
      if (cancelled) return;
      setRuns(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDraft(user.displayName ?? "");
  }, [user.displayName]);

  const stats = useMemo(() => summarizeRuns(runs, entries), [runs, entries]);

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
  }

  return (
    <section className="panel">
      <div className="section-header">
        <button type="button" className="button ghost back-link" onClick={onBack}>
          ← Library
        </button>
        <h2>Profile</h2>
        <p className="muted">{user.email}</p>
      </div>

      <div className="row">
        <button
          type="button"
          className={tab === "account" ? "button primary" : "button ghost"}
          onClick={() => onTab("account")}
        >
          Account
        </button>
        <button
          type="button"
          className={tab === "history" ? "button primary" : "button ghost"}
          onClick={() => onTab("history")}
        >
          Match history
        </button>
        <button
          type="button"
          className={tab === "stats" ? "button primary" : "button ghost"}
          onClick={() => onTab("stats")}
        >
          Game stats
        </button>
        <button
          type="button"
          className={tab === "friends" ? "button primary" : "button ghost"}
          onClick={() => onTab("friends")}
        >
          Friends
        </button>
        <button
          type="button"
          className={tab === "inbox" ? "button primary" : "button ghost"}
          onClick={() => onTab("inbox")}
        >
          Inbox
        </button>
      </div>

      {tab === "account" && (
        <>
          <form className="auth-name-form" onSubmit={(event) => void handleSave(event)}>
            <label htmlFor="profile-display-name">Display name</label>
            <input
              id="profile-display-name"
              type="text"
              maxLength={40}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Your name"
            />
            <button type="submit" className="button primary" disabled={saving || !draft.trim()}>
              {saving ? "Saving…" : "Save"}
            </button>
            {error && (
              <p className="feedback wrong" role="alert">
                {error}
              </p>
            )}
          </form>
          <button type="button" className="button ghost profile-logout" onClick={onLogout}>
            Log out
          </button>
        </>
      )}

      {tab === "history" && (
        <>
          {loading ? (
            <p className="muted">Loading matches…</p>
          ) : runs.length === 0 ? (
            <p className="empty">No games recorded yet. Finish a run to see it here.</p>
          ) : (
            <ul className="title-list">
              {runs.map((run) => (
                <li key={run.id}>
                  <HistoryMatchRow run={run} entries={entries} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "stats" && (
        <>
          {loading ? (
            <p className="muted">Loading stats…</p>
          ) : (
            <>
              <dl className="score-grid">
                <div>
                  <dt>Games played</dt>
                  <dd>{stats.gamesPlayed}</dd>
                </div>
                <div>
                  <dt>Lines guessed</dt>
                  <dd>{stats.linesGuessed}</dd>
                </div>
                <div>
                  <dt>Titles touched</dt>
                  <dd>{stats.titlesTouched}</dd>
                </div>
              </dl>
              {stats.mostPlayed.length > 0 && (
                <div className="library-group">
                  <h3 className="library-group-heading">Most played</h3>
                  <ul className="title-list">
                    {stats.mostPlayed.map((row) => (
                      <li key={row.label}>
                        <div className="title-card">
                          <span className="title-card-name">{row.label}</span>
                          <span className="title-card-meta">
                            {row.playCount} game{row.playCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}
      {tab === "friends" && <FriendsPanel user={user} />}
      {tab === "inbox" && <InboxPanel entries={entries} />}
    </section>
  );
}
