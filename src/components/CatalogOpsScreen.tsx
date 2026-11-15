import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../types/content";
import type { AuthUser } from "../lib/auth/session";
import {
  buildCatalogOpsRows,
  defaultOpsSortDir,
  formatCoveragePct,
  formatRemoteStillStatus,
  mergeStillCounts,
  sortCatalogOpsRows,
  type CatalogOpsRow,
  type CatalogOpsSortDir,
  type CatalogOpsSortKey,
} from "../lib/content/catalogOps";
import {
  loadProtectedTitleIdsBrowser,
  loadStillsCoverage,
  loadUploadsSnapshot,
} from "../lib/content/catalogOpsData";
import { fetchOpsCatalog } from "../lib/ops/api";
import { fetchTitleRequests, type TitleRequestListItem } from "../lib/content/titleRequestsApi";
import {
  fetchRemoteStillCounts,
  fetchStudioCoverage,
  startRemoteStillCountRefresh,
  studioHealth,
  type RemoteStillCounts,
} from "../lib/content/stillsStudioApi";
import { DEFAULT_STUDIO_SHOW } from "../lib/content/stillsStudioTypes";
import { StillsStudioPanel } from "./StillsStudioPanel";

type Props = {
  user: AuthUser;
  entries: CatalogEntry[];
  onBack: () => void;
};

const COLUMNS: { key: CatalogOpsSortKey; label: string }[] = [
  { key: "label", label: "Title" },
  { key: "kind", label: "Kind" },
  { key: "curated", label: "Curated" },
  { key: "stars", label: "Stars" },
  { key: "plays", label: "Plays" },
  { key: "stills", label: "Stills" },
  { key: "missing", label: "Missing" },
  { key: "stillPct", label: "% lines" },
  { key: "media", label: "Media" },
];

function mediaLabel(row: CatalogOpsRow): string {
  if (row.media === "ok") return "on disk";
  if (row.media === "split") return "split encode";
  if (row.media === "n/a") return "—";
  return "missing";
}

function sortMark(active: boolean, dir: CatalogOpsSortDir): string {
  if (!active) return "↕";
  return dir === "asc" ? "↑" : "↓";
}

export function CatalogOpsScreen({ user, entries, onBack }: Props) {
  const [starCounts, setStarCounts] = useState<Record<string, number>>({});
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const [live, setLive] = useState(false);
  const [sortKey, setSortKey] = useState<CatalogOpsSortKey>("label");
  const [sortDir, setSortDir] = useState<CatalogOpsSortDir>("asc");
  const [tab, setTab] = useState<"catalog" | "stills" | "requests">("catalog");
  const [requests, setRequests] = useState<TitleRequestListItem[] | null>(null);
  const [stillsShow, setStillsShow] = useState(DEFAULT_STUDIO_SHOW);
  const [stillsTitleId, setStillsTitleId] = useState<string | null>(null);
  const [stillsAutoBatch, setStillsAutoBatch] = useState(false);
  const [diskCounts, setDiskCounts] = useState<Record<string, number> | null>(null);
  const [remoteCounts, setRemoteCounts] = useState<RemoteStillCounts>({
    updatedAt: null,
    titles: {},
    refreshing: false,
    listed: 0,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void fetchOpsCatalog().then((titles) => {
      if (cancelled) return;
      const stars: Record<string, number> = {};
      const plays: Record<string, number> = {};
      for (const row of titles) {
        stars[row.titleId] = row.starCount;
        plays[row.titleId] = row.playCount;
      }
      setStarCounts(stars);
      setPlayCounts(plays);
      setLive(titles.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void studioHealth().then(async (ok) => {
      if (!ok || cancelled) return;
      try {
        const counts = await fetchRemoteStillCounts();
        if (!cancelled) setRemoteCounts(counts);
      } catch {
        /* bundled or on-disk counts remain until a refresh */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!remoteCounts.refreshing) return;
    let cancelled = false;
    async function pull() {
      try {
        const counts = await fetchRemoteStillCounts();
        if (!cancelled) setRemoteCounts(counts);
      } catch {
        /* keep the last snapshot */
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [remoteCounts.refreshing]);

  useEffect(() => {
    if (tab !== "catalog") return;
    let cancelled = false;
    void studioHealth().then(async (ok) => {
      if (!ok || cancelled) return;
      try {
        const titles = await fetchStudioCoverage();
        if (!cancelled) setDiskCounts(titles);
      } catch {
        /* bundled stills-coverage.json remains */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "requests") return;
    let cancelled = false;
    void fetchTitleRequests().then((rows) => {
      if (!cancelled) setRequests(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const stillCounts = useMemo(() => {
    if (remoteCounts.updatedAt) return mergeStillCounts(diskCounts ?? {}, remoteCounts.titles);
    if (diskCounts && Object.keys(diskCounts).length > 0) return diskCounts;
    return loadStillsCoverage();
  }, [diskCounts, remoteCounts]);

  const rows = useMemo(() => {
    const built = buildCatalogOpsRows({
      entries,
      protectedIds: loadProtectedTitleIdsBrowser(),
      stillCounts,
      starCounts,
      playCounts,
      uploads: loadUploadsSnapshot(),
    });
    return sortCatalogOpsRows(built, sortKey, sortDir);
  }, [entries, starCounts, playCounts, stillCounts, sortKey, sortDir]);

  const movies = rows.filter((row) => row.kind === "movie");
  const onDisk = movies.filter((row) => row.media === "ok" || row.media === "split").length;
  const withStills = rows.filter((row) => row.stillCount > 0).length;

  function handleSort(key: CatalogOpsSortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultOpsSortDir(key));
  }

  async function refreshR2() {
    try {
      setRemoteCounts(await startRemoteStillCountRefresh());
    } catch (err) {
      setRemoteCounts((prev) => ({
        ...prev,
        refreshing: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  function openStills(row: CatalogOpsRow, autoBatch = false) {
    if (row.kind === "movie") {
      setStillsShow("Movies");
      setStillsTitleId(row.key);
    } else {
      setStillsShow(row.label);
      setStillsTitleId(null);
    }
    setStillsAutoBatch(autoBatch && row.kind === "movie");
    setTab("stills");
  }

  return (
    <section className="panel">
      <div className="section-header">
        <button type="button" className="button ghost back-link" onClick={onBack}>
          ← Library
        </button>
        <h2>Catalog</h2>
        <p className="muted">
          {user.email} · {onDisk}/{movies.length} movies on disk · {withStills} titles with stills
          {live ? "" : " · star/play counts need a signed-in owner session"}
        </p>
      </div>

      <div className="ops-tabs">
        <button
          type="button"
          className={`button ghost${tab === "catalog" ? " is-active" : ""}`}
          onClick={() => setTab("catalog")}
        >
          Catalog
        </button>
        <button
          type="button"
          className={`button ghost${tab === "stills" ? " is-active" : ""}`}
          onClick={() => {
            setStillsShow(DEFAULT_STUDIO_SHOW);
            setStillsTitleId(null);
            setStillsAutoBatch(false);
            setTab("stills");
          }}
        >
          Stills
        </button>
        <button
          type="button"
          className={`button ghost${tab === "requests" ? " is-active" : ""}`}
          onClick={() => setTab("requests")}
        >
          Requests
        </button>
      </div>

      {tab === "catalog" || tab === "stills" ? (
        <div className="ops-r2-refresh">
          <button
            type="button"
            className="button"
            disabled={remoteCounts.refreshing}
            aria-busy={remoteCounts.refreshing}
            onClick={() => void refreshR2()}
          >
            {remoteCounts.refreshing ? "Refreshing R2…" : "Refresh R2 counts"}
          </button>
          <p className="muted">{formatRemoteStillStatus(remoteCounts)}</p>
        </div>
      ) : null}

      {tab === "stills" ? (
        <StillsStudioPanel
          key={`${stillsShow}:${stillsTitleId ?? ""}:${stillsAutoBatch ? "batch" : ""}`}
          initialShow={stillsShow}
          initialTitleId={stillsTitleId}
          initialAutoBatch={stillsAutoBatch}
          remoteStillCounts={remoteCounts.titles}
        />
      ) : null}

      {tab === "requests" ? (
        requests === null ? (
          <p className="muted">Loading requests…</p>
        ) : requests.length === 0 ? (
          <p className="empty">No movie requests yet.</p>
        ) : (
          <ul className="title-list">
            {requests.map((row) => (
              <li key={`${row.tmdbId}:${row.createdAt}:${row.displayName}`}>
                <div className="title-card">
                  <span className="title-card-copy">
                    <span className="title-card-name">
                      {row.title} ({row.year})
                    </span>
                    <span className="muted">
                      {row.displayName} · TMDB {row.tmdbId} · {row.createdAt.slice(0, 10)}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "catalog" ? (
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const active = col.key === sortKey;
                return (
                  <th key={col.key} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      className={`ops-sort${active ? " active" : ""}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      <span className="ops-sort-mark" aria-hidden="true">
                        {sortMark(active, sortDir)}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  {row.label}
                  {row.episodeCount != null ? (
                    <span className="muted"> · {row.episodeCount} eps</span>
                  ) : null}
                  {row.kind === "show" || row.kind === "movie" ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="button ghost ops-review-stills"
                        onClick={() => openStills(row)}
                      >
                        Review stills
                      </button>
                    </>
                  ) : null}
                </td>
                <td>{row.kind}</td>
                <td>{row.curated ? "yes" : ""}</td>
                <td>{row.starCount || ""}</td>
                <td>{row.playCount || ""}</td>
                <td>
                  {row.stillCount || ""}
                  {row.starCount > 0 && row.stillCount > 0 ? (
                    <span className="muted"> · {formatCoveragePct(row.stillCount, row.starCount)} stars</span>
                  ) : null}
                </td>
                <td>
                  {row.missingCount > 0 ? row.missingCount : ""}
                  {row.missingCount > 0 && row.kind === "movie" ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="button ghost ops-review-stills"
                        onClick={() => openStills(row, true)}
                      >
                        Extract missing
                      </button>
                    </>
                  ) : null}
                </td>
                <td>{row.stillCount > 0 ? formatCoveragePct(row.stillCount, row.lineCount) : ""}</td>
                <td title={row.mediaFiles.join("\n")}>{mediaLabel(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : null}
    </section>
  );
}
