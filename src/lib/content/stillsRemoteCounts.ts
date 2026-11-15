import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { countRemoteStills } from "./stillsR2.js";

export type RemoteStillCounts = {
  updatedAt: string | null;
  titles: Record<string, number>;
  refreshing: boolean;
  listed: number;
  error: string | null;
};

type StoredCounts = { updatedAt: string | null; titles: Record<string, number> };

type Memory = RemoteStillCounts & { packageRoot: string };

let memory: Memory | null = null;
let inflight: Promise<void> | null = null;

export function remoteStillCountsPath(packageRoot: string): string {
  return join(packageRoot, "inbox", "stills-r2-counts.json");
}

export function resetRemoteStillCountCache(): void {
  memory = null;
  inflight = null;
}

/** Resolves when the current list finishes. Already idle when nothing is running. */
export function remoteStillCountRefreshDone(): Promise<void> {
  return inflight ?? Promise.resolve();
}

function emptyStored(): StoredCounts {
  return { updatedAt: null, titles: {} };
}

function loadStored(packageRoot: string): StoredCounts {
  const path = remoteStillCountsPath(packageRoot);
  if (!existsSync(path)) return emptyStored();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredCounts>;
    const titles: Record<string, number> = {};
    if (raw.titles && typeof raw.titles === "object") {
      for (const [id, count] of Object.entries(raw.titles)) {
        if (typeof count === "number" && Number.isFinite(count) && count >= 0) titles[id] = count;
      }
    }
    return {
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
      titles,
    };
  } catch {
    return emptyStored();
  }
}

function saveStored(packageRoot: string, stored: StoredCounts): void {
  const path = remoteStillCountsPath(packageRoot);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(stored, null, 2)}\n`);
  renameSync(tmp, path);
}

function ensure(packageRoot: string): Memory {
  if (!memory || memory.packageRoot !== packageRoot) {
    const stored = loadStored(packageRoot);
    memory = {
      packageRoot,
      updatedAt: stored.updatedAt,
      titles: stored.titles,
      refreshing: false,
      listed: 0,
      error: null,
    };
  }
  return memory;
}

function publish(row: Memory): RemoteStillCounts {
  return {
    updatedAt: row.updatedAt,
    titles: { ...row.titles },
    refreshing: row.refreshing,
    listed: row.listed,
    error: row.error,
  };
}

export function readRemoteStillCounts(packageRoot: string): RemoteStillCounts {
  return publish(ensure(packageRoot));
}

export type RemoteStillCountSource = (
  packageRoot: string,
  onListed: (listed: number) => void,
) => Promise<Record<string, number>>;

async function defaultSource(
  packageRoot: string,
  onListed: (listed: number) => void,
): Promise<Record<string, number>> {
  const result = await countRemoteStills(packageRoot, { onListed });
  return result.titles;
}

/**
 * Start one bucket list. A second call while that list is running returns the
 * same in-flight snapshot and does not list again. The tally is written to
 * inbox/stills-r2-counts.json when it finishes.
 */
export function startRemoteStillCountRefresh(
  packageRoot: string,
  source: RemoteStillCountSource = defaultSource,
): RemoteStillCounts {
  const row = ensure(packageRoot);
  if (inflight) return publish(row);
  row.refreshing = true;
  row.listed = 0;
  row.error = null;
  let pending: Promise<Record<string, number>>;
  try {
    pending = Promise.resolve(
      source(packageRoot, (listed) => {
        if (memory?.packageRoot === packageRoot) memory.listed = listed;
      }),
    );
  } catch (error) {
    row.refreshing = false;
    row.error = error instanceof Error ? error.message : String(error);
    return publish(row);
  }
  inflight = pending
    .then((titles) => {
      const stored = { updatedAt: new Date().toISOString(), titles };
      saveStored(packageRoot, stored);
      if (memory?.packageRoot !== packageRoot) return;
      memory.updatedAt = stored.updatedAt;
      memory.titles = titles;
      memory.refreshing = false;
      memory.error = null;
    })
    .catch((error: unknown) => {
      if (memory?.packageRoot !== packageRoot) return;
      memory.refreshing = false;
      memory.error = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      inflight = null;
    });
  return publish(row);
}
