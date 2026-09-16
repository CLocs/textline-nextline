/** Private R2 bucket served by the Pages Function at `/stills/*`. */
export const STILLS_R2_BUCKET = "textline-stills";

/** wrangler.toml / Pages Function binding name. */
export const STILLS_R2_BINDING = "STILLS";

const TITLE_ID_RE = /^[a-z0-9-]+$/i;
const STILL_FILE_RE = /^(\d+)\.jpe?g$/i;
const STILL_PATH_RE = /^\/stills\/([a-z0-9-]+)\/(\d+\.jpe?g)$/i;

/** `oceans-thirteen-2007/1334.jpg` — or null if the name is unsafe. */
export function stillObjectKey(titleId: string, fileName: string): string | null {
  if (!TITLE_ID_RE.test(titleId)) return null;
  const match = fileName.trim().match(STILL_FILE_RE);
  if (!match) return null;
  return `${titleId}/${match[1]}.jpg`;
}

/** Map `/stills/{titleId}/{n}.jpg` to an R2 object key. */
export function stillKeyFromPathname(pathname: string): string | null {
  const path = pathname.split("?")[0] ?? "";
  const match = path.match(STILL_PATH_RE);
  if (!match) return null;
  return stillObjectKey(match[1]!, match[2]!);
}
