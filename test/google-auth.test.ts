import { describe, expect, it, vi, beforeEach } from "vitest";
import { signInWithEmail, signInWithGoogle } from "../api/src/auth.js";
import { handleRequest, type Env } from "../api/src/index.js";

vi.mock("../api/src/google.js", () => ({
  verifyGoogleIdToken: vi.fn(async (idToken: string, clientId: string) => {
    if (clientId !== "test-google-client") {
      return { error: "Google Sign-In is not configured", status: 503 };
    }
    if (idToken === "bad") {
      return { error: "Invalid or expired Google credential", status: 401 };
    }
    if (idToken === "unverified") {
      return { error: "Google account email is not verified", status: 401 };
    }
    return {
      email: "friend@gmail.com",
      emailVerified: true,
      name: "Friend",
      sub: "google-sub-1",
    };
  }),
}));

type UserRow = { id: string; email: string; display_name: string | null; created_at: string };
type SessionRow = { id: string; user_id: string; expires_at: string };

function createUserSessionDb() {
  const users: UserRow[] = [];
  const sessions: SessionRow[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO users")) {
                const [id, email, displayName, createdAt] = args as [
                  string,
                  string,
                  string,
                  string,
                ];
                users.push({
                  id,
                  email,
                  display_name: displayName,
                  created_at: createdAt,
                });
              } else if (sql.includes("INSERT INTO sessions")) {
                const [id, userId, expiresAt] = args as [string, string, string];
                sessions.push({ id, user_id: userId, expires_at: expiresAt });
              }
            },
            async first() {
              if (sql.includes("FROM users WHERE email")) {
                const [email] = args as [string];
                return users.find((u) => u.email === email) ?? null;
              }
              if (sql.includes("FROM users WHERE id")) {
                const [id] = args as [string];
                return users.find((u) => u.id === id) ?? null;
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, users, sessions };
}

describe("Google / email sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signInWithEmail creates user + session", async () => {
    const { db, users, sessions } = createUserSessionDb();
    const result = await signInWithEmail(db, "DasColin@gmail.com");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.user.email).toBe("dascolin@gmail.com");
    expect(users).toHaveLength(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].user_id).toBe(result.user.id);
  });

  it("signInWithGoogle uses verified claims and same session path", async () => {
    const { db, users, sessions } = createUserSessionDb();
    const result = await signInWithGoogle(
      { DB: db, GOOGLE_CLIENT_ID: "test-google-client" },
      "good-token",
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.user.email).toBe("friend@gmail.com");
    expect(result.user.displayName).toBe("Friend");
    expect(users).toHaveLength(1);
    expect(sessions).toHaveLength(1);
  });

  it("signInWithGoogle fails when client id unset", async () => {
    const { db } = createUserSessionDb();
    const result = await signInWithGoogle({ DB: db }, "good-token");
    expect(result).toEqual({
      error: "Google Sign-In is not configured",
      status: 503,
    });
  });

  it("GET /api/auth/config exposes googleClientId", async () => {
    const { db } = createUserSessionDb();
    const env = {
      DB: db,
      ALLOWED_ORIGINS: "http://localhost:5173",
      GOOGLE_CLIENT_ID: "test-google-client",
    } as Env;
    const response = await handleRequest(
      new Request("http://localhost/api/auth/config", {
        headers: { Origin: "http://localhost:5173" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { googleClientId: string | null };
    expect(body.googleClientId).toBe("test-google-client");
  });

  it("POST /api/auth/google creates a session", async () => {
    const { db, sessions } = createUserSessionDb();
    const env = {
      DB: db,
      ALLOWED_ORIGINS: "http://localhost:5173",
      GOOGLE_CLIENT_ID: "test-google-client",
    } as Env;
    const response = await handleRequest(
      new Request("http://localhost/api/auth/google", {
        method: "POST",
        headers: {
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken: "good-token" }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      user: { email: string };
      sessionToken: string;
    };
    expect(body.user.email).toBe("friend@gmail.com");
    expect(body.sessionToken).toBeTruthy();
    expect(sessions).toHaveLength(1);
  });
});
