export type RemoteStill = {
  size: number;
  etag: string;
};

/**
 * Decide whether a local JPEG must be uploaded.
 * Missing key or a different byte size always uploads.
 * Same size compares MD5 to the R2 etag when both are a plain 32-char hex digest.
 * Multipart etags (contain a dash) and a missing hash trust the size match.
 */
export function stillNeedsUpload(
  local: { size: number; md5?: string },
  remote: RemoteStill | undefined,
): boolean {
  if (!remote) return true;
  if (!Number.isFinite(remote.size) || remote.size !== local.size) return true;
  if (!local.md5) return false;
  const etag = remote.etag.trim().replace(/^"|"$/g, "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(etag)) return false;
  return etag !== local.md5.toLowerCase();
}
