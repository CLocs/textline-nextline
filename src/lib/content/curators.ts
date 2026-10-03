import { OWNER_EMAIL } from "./owner.js";

/**
 * Temporary pilot: only Colin and nalongi may star or love lines.
 * nalongi matches a display name of "nalongi" or an email whose local part is nalongi.
 */
const NALONGI = "nalongi";

export function isPilotCurator(
  user: { email?: string | null; displayName?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  const email = (user.email ?? "").trim().toLowerCase();
  if (email === OWNER_EMAIL) return true;
  const local = email.split("@")[0] ?? "";
  if (local === NALONGI) return true;
  return (user.displayName ?? "").trim().toLowerCase() === NALONGI;
}
