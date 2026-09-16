/** Curator account that can see catalog ops (uploads, stills, stars). */
export const OWNER_EMAIL = "dascolin@gmail.com";

export function isOwnerEmail(
  email: string | null | undefined,
  allowed = OWNER_EMAIL,
): boolean {
  return (email ?? "").trim().toLowerCase() === allowed.trim().toLowerCase();
}

/** Production: owner only. Local Vite: also `local@dev`. */
export function canViewCatalogOps(
  email: string | null | undefined,
  isDev = false,
): boolean {
  if (isOwnerEmail(email)) return true;
  return Boolean(isDev && (email ?? "").trim().toLowerCase() === "local@dev");
}
