import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CatalogEntry } from "../types/content";
import type { AuthUser } from "../lib/auth/session";
import { updateMyDisplayName } from "../lib/auth/api";
import { fetchMyRuns, type StoredRun } from "../lib/runs/api";
import { historyTitleLabel, summarizeRuns } from "../lib/content/playedRails";
import { GAME_MODES, type GameMode } from "../types/game";
import type { ProfileTab } from "../lib/routing/hash";

type Props = {
  user: AuthUser;
  tab: ProfileTab;
  entries: CatalogEntry[];
  onTab: (tab: ProfileTab) => void;
  onBack: () => void;
  onUpdated: (user: AuthUser) => void;
};

function modeLabel(mode: GameMode): string {
  return GAME_MODES.find((item) => item.id === mode)?.label ?? mode;
}

function gameLabel(run: StoredRun): string {
  const length = run.length === "mini" ? "Mini" : "Full";
  return `${length} · ${modeLabel(run.mode)}`;
}

function scoreLabel(run: StoredRun): string {
  return `${run.correctCount} / ${run.questionTotal} · ${run.wrongCount} wrong · ${run.skipCount} skip`;
}

export function ProfileScreen({ user, tab, entries, onTab, onBack, onUpdated }: Props) {
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
      </div>

      {tab === "account" && (
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
                  <div className="title-card">
                    <span className="title-card-name">
                      {gameLabel(run)} · {historyTitleLabel(run.titleId, entries)}
                    </span>
                    <span className="title-card-meta">{scoreLabel(run)}</span>
                  </div>
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
    </section>
  );
}
