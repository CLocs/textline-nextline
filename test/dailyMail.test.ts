import { describe, expect, it } from "vitest";
import { handleRequest } from "../api/src/index.js";
import {
  cardsForMail,
  escapeHtml,
  formatMailDate,
  globalDailyPool,
  mailChoices,
  mailDateIso,
  renderDailyMail,
  runDailyMail,
  sendDailyMails,
  setDailyMailOptIn,
  unsubscribeDailyMail,
} from "../api/src/dailyMail.js";
import { packMailCatalog, mailCuesForTitle, clipMailText } from "../src/lib/game/dailyMailCues.js";
import { parseDailyMailCatalog } from "../src/lib/game/dailyMailCatalog.js";
import type { MailCue } from "../src/lib/game/dailyMailCatalog.js";
import type { Title } from "../src/types/content.js";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-01T16:00:00.000Z");

function cue(titleId: string, lineIndex: number, prompt: string): MailCue {
  return {
    titleId,
    lineIndex,
    title: titleId,
    prompt,
    correct: `${prompt} next`,
    distractors: [`${prompt} other`, `${prompt} else`],
  };
}

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
};
type SessionRow = { id: string; user_id: string; expires_at: string };
type MailRow = { user_id: string; opted_in: number; unsub_token: string; updated_at: string };
type SendRow = { user_id: string; sent_on: string; created_at: string };
type StarRow = { title_id: string; line_index: number; player_id: string; loved: number };

function createDb() {
  const users: UserRow[] = [
    {
      id: ALICE,
      email: "alice@example.com",
      display_name: "Ada",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: BOB,
      email: "bob@example.com",
      display_name: "Bob",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  const sessions: SessionRow[] = [
    { id: "sess-alice", user_id: ALICE, expires_at: "2099-01-01T00:00:00.000Z" },
  ];
  const mail: MailRow[] = [
    {
      user_id: ALICE,
      opted_in: 1,
      unsub_token: "a".repeat(64),
      updated_at: "2026-09-01T00:00:00.000Z",
    },
    {
      user_id: BOB,
      opted_in: 0,
      unsub_token: "b".repeat(64),
      updated_at: "2026-09-01T00:00:00.000Z",
    },
  ];
  const sends: SendRow[] = [];
  const stars: StarRow[] = [
    { title_id: "loved", line_index: 1, player_id: ALICE, loved: 1 },
    { title_id: "mine", line_index: 2, player_id: ALICE, loved: 0 },
    { title_id: "mine", line_index: 3, player_id: ALICE, loved: 0 },
    { title_id: "bob", line_index: 9, player_id: BOB, loved: 0 },
  ];

  function statement(sql: string, args: unknown[]) {
    return {
            async first<T>(): Promise<T | null> {
              if (sql.includes("FROM sessions")) {
                const [sessionId] = args as [string];
                const session = sessions.find((row) => row.id === sessionId);
                const user = users.find((row) => row.id === session?.user_id);
                if (!session || !user) return null;
                return {
                  session_id: session.id,
                  session_expires: session.expires_at,
                  id: user.id,
                  email: user.email,
                  display_name: user.display_name,
                  created_at: user.created_at,
                } as T;
              }
              if (sql.includes("SELECT opted_in FROM daily_mail")) {
                const [userId] = args as [string];
                const row = mail.find((item) => item.user_id === userId);
                return (row ? { opted_in: row.opted_in } : null) as T | null;
              }
              if (sql.includes("SELECT unsub_token FROM daily_mail")) {
                const [userId] = args as [string];
                const row = mail.find((item) => item.user_id === userId);
                return (row ? { unsub_token: row.unsub_token } : null) as T | null;
              }
              if (sql.includes("FROM daily_mail_sends")) {
                const [userId, sentOn] = args as [string, string];
                const row = sends.find((item) => item.user_id === userId && item.sent_on === sentOn);
                return (row ? { user_id: row.user_id } : null) as T | null;
              }
              return null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              if (sql.includes("WHERE loved = 1")) {
                const seen = new Set<string>();
                const results = [];
                for (const star of stars) {
                  if (star.loved !== 1) continue;
                  const key = `${star.title_id}:${star.line_index}`;
                  if (seen.has(key)) continue;
                  seen.add(key);
                  results.push({ title_id: star.title_id, line_index: star.line_index });
                }
                return { results: results as T[] };
              }
              if (sql.includes("COUNT(*) AS count")) {
                const counts = new Map<string, { title_id: string; line_index: number; count: number }>();
                for (const star of stars) {
                  const key = `${star.title_id}:${star.line_index}`;
                  const existing = counts.get(key);
                  if (existing) existing.count += 1;
                  else {
                    counts.set(key, {
                      title_id: star.title_id,
                      line_index: star.line_index,
                      count: 1,
                    });
                  }
                }
                return { results: [...counts.values()] as T[] };
              }
              if (sql.includes("FROM daily_mail m")) {
                const results = mail
                  .filter((row) => row.opted_in === 1)
                  .map((row) => {
                    const user = users.find((item) => item.id === row.user_id);
                    return {
                      id: row.user_id,
                      email: user?.email ?? "",
                      display_name: user?.display_name ?? null,
                      unsub_token: row.unsub_token,
                    };
                  });
                return { results: results as T[] };
              }
              if (sql.includes("WHERE player_id = ?")) {
                const [playerId] = args as [string];
                return {
                  results: stars
                    .filter((star) => star.player_id === playerId)
                    .map((star) => ({ title_id: star.title_id, line_index: star.line_index })) as T[],
                };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes("INSERT INTO daily_mail_sends")) {
                const [userId, sentOn, createdAt] = args as [string, string, string];
                if (!sends.some((row) => row.user_id === userId && row.sent_on === sentOn)) {
                  sends.push({ user_id: userId, sent_on: sentOn, created_at: createdAt });
                }
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO daily_mail")) {
                const [userId, optedIn, token, updatedAt] = args as [string, number, string, string];
                mail.push({
                  user_id: userId,
                  opted_in: optedIn,
                  unsub_token: token,
                  updated_at: updatedAt,
                });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("WHERE unsub_token = ?")) {
                const [updatedAt, token] = args as [string, string];
                const row = mail.find((item) => item.unsub_token === token);
                if (!row) return { meta: { changes: 0 } };
                row.opted_in = 0;
                row.updated_at = updatedAt;
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE daily_mail SET opted_in = ?")) {
                const [optedIn, updatedAt, userId] = args as [number, string, string];
                const row = mail.find((item) => item.user_id === userId);
                if (!row) return { meta: { changes: 0 } };
                row.opted_in = optedIn;
                row.updated_at = updatedAt;
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
    };
  }

  const db = {
    prepare(sql: string) {
      const bound = statement(sql, []);
      return {
        ...bound,
        bind(...args: unknown[]) {
          return statement(sql, args);
        },
      };
    },
  };

  return { db: db as unknown as D1Database, mail, sends, users };
}

const cues: MailCue[] = [
  cue("loved", 1, "Loved line"),
  cue("mine", 2, "Mine one"),
  cue("mine", 3, "Mine two"),
  cue("bob", 9, "Bob only"),
];

describe("daily mail catalog", () => {
  it("packs and parses framed cues", () => {
    const parsed = parseDailyMailCatalog(packMailCatalog(cues));
    expect(parsed).toEqual(cues);
    expect(parseDailyMailCatalog({ cues: [["nope"]] })).toEqual([]);
  });

  it("keeps a playable prompt and drops a line with no next line", () => {
    const title: Title = {
      id: "demo",
      title: "Demo",
      sourceFilename: "demo.srt",
      importedAt: "2026-01-01",
      lineCount: 4,
      lines: [
        { index: 0, text: "Hello there friend", kind: "dialogue", startMs: 0, endMs: 1 },
        { index: 1, text: "General Kenobi", kind: "dialogue", startMs: 1, endMs: 2 },
        { index: 2, text: "[Door]", kind: "sdh", startMs: 2, endMs: 3 },
        { index: 3, text: "A surprise to be sure", kind: "dialogue", startMs: 3, endMs: 4 },
      ],
    };
    const built = mailCuesForTitle(title, [0, 3], "Demo");
    expect(built).toHaveLength(1);
    expect(built[0]?.prompt).toBe("Hello there friend");
    expect(built[0]?.correct).toBe("General Kenobi");
    expect(built[0]?.distractors).toContain("A surprise to be sure");
    expect(clipMailText(`  ${"word ".repeat(80)}`)).toMatch(/…$/);
  });
});

describe("daily mail render", () => {
  it("uses the New York calendar day", () => {
    expect(mailDateIso(NOW)).toBe("2026-09-01");
    expect(mailDateIso(new Date("2026-01-15T04:30:00.000Z"))).toBe("2026-01-14");
    expect(formatMailDate("2026-09-01")).toBe("September 1");
  });

  it("links every choice to that card and does not mark the answer", () => {
    const cards = cardsForMail(
      "2026-09-01",
      cues,
      globalDailyPool(
        [
          { titleId: "loved", lineIndex: 1, count: 4 },
          { titleId: "mine", lineIndex: 2, count: 1 },
          { titleId: "mine", lineIndex: 3, count: 1 },
        ],
        [{ titleId: "loved", lineIndex: 1 }],
        new Set(cues.map((item) => `${item.titleId}:${item.lineIndex}`)),
      ),
      [
        { titleId: "mine", lineIndex: 2, count: 1, loved: false },
        { titleId: "mine", lineIndex: 3, count: 1, loved: false },
      ],
    );
    expect(cards[0]?.cue.prompt).toBe("Loved line");
    expect(cards.slice(1).map((card) => card.cue.prompt).sort()).toEqual(["Mine one", "Mine two"]);
    const mail = renderDailyMail({
      date: "2026-09-01",
      origin: "https://textlinenextline.com",
      unsubToken: "a".repeat(64),
      displayName: "Ada",
      cards,
    });
    expect(mail.subject).toBe("Today’s three · September 1");
    expect(mail.html).toContain("https://textlinenextline.com/#/daily/0");
    expect(mail.html).toContain("https://textlinenextline.com/#/daily/1");
    expect(mail.html).toContain("https://textlinenextline.com/#/daily/2");
    expect(mail.html).toContain("/stills/loved/1.jpg");
    expect(mail.html).toContain(`#/unsub?token=${"a".repeat(64)}`);
    expect(mail.html).not.toContain("correct");
    expect(mail.html).not.toContain("choice=");
    expect(mail.text).toContain("Loved line next");
    expect(mailChoices(cues[0]!, "2026-09-01").sort()).toEqual(
      ["Loved line next", "Loved line other", "Loved line else"].sort(),
    );
    expect(escapeHtml(`<script>"`)).toBe("&lt;script&gt;&quot;");
  });
});

describe("daily mail send", () => {
  it("emails opted-in players once, then skips the same day", async () => {
    const { db, sends } = createDb();
    const calls: { to: string; html: string }[] = [];
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { to: string[]; html: string };
      calls.push({ to: body.to[0] ?? "", html: body.html });
      return new Response("{}", { status: 200 });
    };
    const env = {
      DB: db,
      APP_ORIGIN: "https://textlinenextline.com",
      RESEND_API_KEY: "test-key",
      RESEND_FROM: "Textline <auth@textlinenextline.com>",
    };
    const first = await sendDailyMails(env, cues, NOW, fetchImpl);
    expect(first).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.to).toBe("alice@example.com");
    expect(calls[0]?.html).toContain("Loved line");
    expect(calls[0]?.html).toContain("Mine one");
    expect(calls[0]?.html).toContain("Mine two");
    expect(calls[0]?.html).not.toContain("Bob only");
    expect(sends).toHaveLength(1);

    const second = await sendDailyMails(env, cues, NOW, fetchImpl);
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("does not record a send when Resend rejects it", async () => {
    const { db, sends } = createDb();
    const fetchImpl = async () => new Response("nope", { status: 502 });
    const result = await sendDailyMails(
      {
        DB: db,
        APP_ORIGIN: "https://textlinenextline.com",
        RESEND_API_KEY: "test-key",
      },
      cues,
      NOW,
      fetchImpl,
    );
    expect(result.failed).toBe(1);
    expect(sends).toHaveLength(0);
  });

  it("turns mail off from the unsubscribe token", async () => {
    const { db, mail } = createDb();
    const bad = await unsubscribeDailyMail(db, "nope");
    expect(bad).toEqual({ error: "Invalid link", status: 400 });
    const ok = await unsubscribeDailyMail(db, "a".repeat(64));
    expect(ok).toEqual({ ok: true });
    expect(mail.find((row) => row.user_id === ALICE)?.opted_in).toBe(0);
    const again = await sendDailyMails(
      { DB: db, APP_ORIGIN: "https://textlinenextline.com", RESEND_API_KEY: "test-key" },
      cues,
      NOW,
      async () => new Response("{}", { status: 200 }),
    );
    expect(again.sent).toBe(0);
  });

  it("serves opt-in on the API and loads the catalog for the cron", async () => {
    const { db } = createDb();
    const env = {
      DB: db,
      ALLOWED_ORIGINS: "http://localhost:5173",
      APP_ORIGIN: "https://textlinenextline.com",
      RESEND_API_KEY: "test-key",
    };
    const denied = await handleRequest(
      new Request("http://api.test/api/daily/mail"),
      env,
    );
    expect(denied.status).toBe(401);

    const saved = await handleRequest(
      new Request("http://api.test/api/daily/mail", {
        method: "PUT",
        headers: { Authorization: "Bearer sess-alice", "Content-Type": "application/json" },
        body: JSON.stringify({ optedIn: false }),
      }),
      env,
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ optedIn: false });

    const restored = await handleRequest(
      new Request("http://api.test/api/daily/mail", {
        method: "PUT",
        headers: { Authorization: "Bearer sess-alice", "Content-Type": "application/json" },
        body: JSON.stringify({ optedIn: true }),
      }),
      env,
    );
    expect(restored.status).toBe(200);

    const turnedOn = await setDailyMailOptIn(db, BOB, true);
    expect(turnedOn.optedIn).toBe(true);

    const page = await handleRequest(
      new Request(`http://api.test/api/daily/mail/unsubscribe?token=${"b".repeat(64)}`),
      env,
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Daily quotes are off");

    const calls: string[] = [];
    const result = await runDailyMail(env, NOW, async (url) => {
      calls.push(String(url));
      if (String(url).includes("daily-mail-catalog.json")) {
        return new Response(JSON.stringify(packMailCatalog(cues)), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    expect(calls[0]).toContain("/daily-mail-catalog.json");
    expect(result.sent).toBe(1);
  });
});
