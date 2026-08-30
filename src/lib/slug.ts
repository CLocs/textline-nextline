export function slugify(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned || "untitled";
}
