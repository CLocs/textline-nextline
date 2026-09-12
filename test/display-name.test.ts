import { describe, expect, it } from "vitest";
import { normalizeDisplayName } from "../api/src/crypto.js";
import { updateDisplayName } from "../api/src/auth.js";

describe("display names", () => {
  it("normalizes display names", () => {
    expect(normalizeDisplayName("  Colin  ")).toBe("Colin");
    expect(normalizeDisplayName("")).toBeNull();
    expect(normalizeDisplayName("x".repeat(41))).toBeNull();
  });

  it("updates a user display name", async () => {
    const users = [
      {
        id: "u1",
        email: "colin@example.com",
        display_name: "colin",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];

    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                if (sql.includes("UPDATE users SET display_name")) {
                  const [name, id] = args as [string, string];
                  const user = users.find((row) => row.id === id);
                  if (user) user.display_name = name;
                }
                return { success: true };
              },
              async first<T>() {
                if (sql.includes("FROM users WHERE id")) {
                  const [id] = args as [string];
                  return (users.find((row) => row.id === id) as T) ?? null;
                }
                return null;
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const result = await updateDisplayName(db, "u1", "  Colin  ");
    expect(result).toMatchObject({
      id: "u1",
      displayName: "Colin",
      email: "colin@example.com",
    });
  });
});
