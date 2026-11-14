import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readRemoteStillCounts,
  remoteStillCountRefreshDone,
  remoteStillCountsPath,
  resetRemoteStillCountCache,
  startRemoteStillCountRefresh,
} from "../src/lib/content/stillsRemoteCounts.js";

afterEach(() => {
  resetRemoteStillCountCache();
});

describe("remote still counts", () => {
  it("lists the bucket once and reloads the saved tally", async () => {
    const packageRoot = mkdtempSync(join(tmpdir(), "stills-r2-"));
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = startRemoteStillCountRefresh(packageRoot, async (_root, onListed) => {
      calls += 1;
      onListed(2000);
      await gate;
      return { "american-gangster-2007": 900, "friday-1995": 1472 };
    });
    const second = startRemoteStillCountRefresh(packageRoot, async () => {
      calls += 1;
      return { "ignored-1999": 1 };
    });
    expect(first.refreshing).toBe(true);
    expect(first.listed).toBe(2000);
    expect(second.refreshing).toBe(true);
    expect(calls).toBe(1);
    release();
    await remoteStillCountRefreshDone();
    const saved = readRemoteStillCounts(packageRoot);
    expect(saved.refreshing).toBe(false);
    expect(saved.error).toBeNull();
    expect(saved.titles["american-gangster-2007"]).toBe(900);
    expect(saved.titles["friday-1995"]).toBe(1472);
    expect(saved.updatedAt).toBeTruthy();
    resetRemoteStillCountCache();
    const reloaded = readRemoteStillCounts(packageRoot);
    expect(reloaded.titles).toEqual(saved.titles);
    expect(JSON.parse(readFileSync(remoteStillCountsPath(packageRoot), "utf8")).titles["friday-1995"]).toBe(1472);
    rmSync(packageRoot, { recursive: true, force: true });
  });

  it("keeps the previous tally when a list fails", async () => {
    const packageRoot = mkdtempSync(join(tmpdir(), "stills-r2-"));
    const path = remoteStillCountsPath(packageRoot);
    mkdirSync(join(packageRoot, "inbox"), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ updatedAt: "2026-11-01T00:00:00.000Z", titles: { "baby-driver-2017": 16 } }, null, 2)}\n`,
    );
    startRemoteStillCountRefresh(packageRoot, async () => {
      throw new Error("R2 list failed (429)");
    });
    await remoteStillCountRefreshDone();
    const saved = readRemoteStillCounts(packageRoot);
    expect(saved.refreshing).toBe(false);
    expect(saved.error).toBe("R2 list failed (429)");
    expect(saved.titles["baby-driver-2017"]).toBe(16);
    expect(saved.updatedAt).toBe("2026-11-01T00:00:00.000Z");
    rmSync(packageRoot, { recursive: true, force: true });
  });
});
