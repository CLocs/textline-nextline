import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../types/content";
import type { AuthUser } from "../lib/auth/session";
import {
  buildCatalogOpsRows,
  defaultOpsSortDir,
  formatCoveragePct,
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
import { fetchStudioCoverage, studioHealth } from "../lib/content/stillsStudioApi";
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
  const [tab, setTab] = useState<"catalog" | "stills">("catalog");
  const [stillsShow, setStillsShow] = useState(DEFAULT_STUDIO_SHOW);
  const [stillsTitleId, setStillsTitleId] = useState<string | null>(null);
  const [stillsAutoBatch, setStillsAutoBatch] = useState(false);
  const [stillCounts, setStillCounts] = useState<Record<string, number>>(() => loadStillsCoverage());

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
        const titles = await fetchStudioCoverage();
        if (!cancelled && Object.keys(titles).length > 0) setStillCounts(titles);
      } catch {
        /* bundled stills-coverage.json remains */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      </div>

      {tab === "stills" ? (
        <StillsStudioPanel
          key={`${stillsShow}:${stillsTitleId ?? ""}:${stillsAutoBatch ? "batch" : ""}`}
          initialShow={stillsShow}
          initialTitleId={stillsTitleId}
          initialAutoBatch={stillsAutoBatch}
        />
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
