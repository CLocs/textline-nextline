import { createMagicToken } from "./crypto.js";
import { fetchLovedStarsGlobal, fetchPopularStarsGlobal } from "./stars.js";
import {
  dailyCardsOn,
  lineKey,
  type DailyLine,
  type DailySlot,
} from "../../src/lib/game/dailyPick.js";
import {
  parseDailyMailCatalog,
  type MailCue,
} from "../../src/lib/game/dailyMailCatalog.js";

/** Morning send clock. 13:00 UTC is 8am or 9am in New York, still that calendar day. */
export const DAILY_MAIL_TIMEZONE = "America/New_York";

const POPULAR_LIMIT = 400;
const LOVED_LIMIT = 200;
const LETTERS = ["A", "B", "C", "D"];

export type MailCard = {
  cue: MailCue;
  slot: DailySlot;
};

type MailUser = {
  id: string;
  email: string;
  displayName: string | null;
  unsubToken: string;
};

export function mailDateIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_MAIL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function formatMailDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function globalDailyPool(
  popular: { titleId: string; lineIndex: number; count: number }[],
  loved: { titleId: string; lineIndex: number }[],
  framed: Set<string>,
): DailyLine[] {
  const map = new Map<string, DailyLine>();
  for (const row of popular) {
    const key = lineKey(row);
    if (!framed.has(key)) continue;
    map.set(key, {
      titleId: row.titleId,
      lineIndex: row.lineIndex,
      count: row.count,
      loved: false,
    });
  }
  for (const row of loved) {
    const key = lineKey(row);
    if (!framed.has(key)) continue;
    const existing = map.get(key);
    if (existing) existing.loved = true;
    else {
      map.set(key, {
        titleId: row.titleId,
        lineIndex: row.lineIndex,
        count: 1,
        loved: true,
      });
    }
  }
  return [...map.values()];
}

export function personalDailyPool(
  stars: { titleId: string; lineIndex: number }[],
  framed: Set<string>,
): DailyLine[] {
  const seen = new Set<string>();
  const pool: DailyLine[] = [];
  for (const star of stars) {
    const key = lineKey(star);
    if (!framed.has(key) || seen.has(key)) continue;
    seen.add(key);
    pool.push({
      titleId: star.titleId,
      lineIndex: star.lineIndex,
      count: 1,
      loved: false,
    });
  }
  return pool;
}

export function cardsForMail(
  date: string,
  cues: MailCue[],
  globalPool: DailyLine[],
  personalPool: DailyLine[],
): MailCard[] {
  const byKey = new Map<string, MailCue>();
  for (const cue of cues) {
    const key = lineKey(cue);
    if (!byKey.has(key)) byKey.set(key, cue);
  }
  const framed = new Set(byKey.keys());
  const global = globalPool.filter((line) => framed.has(lineKey(line)));
  const personal = personalPool.filter((line) => framed.has(lineKey(line)));
  return dailyCardsOn(date, global, personal).flatMap((card) => {
    const cue = byKey.get(lineKey(card));
    if (!cue) return [];
    const slot: DailySlot = card.slot === "global" ? "global" : "starred";
    return [{ cue, slot }];
  });
}

function seededRng(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = swap;
  }
  return copy;
}

export function mailChoices(cue: MailCue, date: string): string[] {
  return shuffle(
    [cue.correct, ...cue.distractors],
    seededRng(`${date}:${cue.titleId}:${cue.lineIndex}`),
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appOrigin(origin: string | undefined): string {
  const trimmed = origin?.trim();
  return (trimmed || "https://textlinenextline.com").replace(/\/$/, "");
}

export function dailyPlayUrl(origin: string, index: number): string {
  return `${appOrigin(origin)}/#/daily/${index}`;
}

export function unsubscribeUrl(origin: string, token: string): string {
  return `${appOrigin(origin)}/#/unsub?token=${encodeURIComponent(token)}`;
}

export function stillUrl(origin: string, cue: MailCue): string {
  return `${appOrigin(origin)}/stills/${encodeURIComponent(cue.titleId)}/${cue.lineIndex}.jpg`;
}

export function renderDailyMail(input: {
  date: string;
  origin: string;
  unsubToken: string;
  displayName?: string | null;
  cards: MailCard[];
}): { subject: string; html: string; text: string } {
  const when = formatMailDate(input.date);
  const subject = `Today’s three · ${when}`;
  const unsub = unsubscribeUrl(input.origin, input.unsubToken);
  const greeting = input.displayName?.trim()
    ? `Hi ${input.displayName.trim()},`
    : "Hi,";
  const textBlocks = [
    greeting,
    "",
    `Today’s three for ${when}. Tap a card to play that question, then the next, then wrap.`,
    "",
  ];
  const cardsHtml: string[] = [];

  input.cards.forEach((card, index) => {
    const play = dailyPlayUrl(input.origin, index);
    const choices = mailChoices(card.cue, input.date);
    const label = card.slot === "global" ? "Line of the day" : `Quote ${index + 1}`;
    textBlocks.push(`${index + 1}. ${label}`);
    textBlocks.push(card.cue.title);
    textBlocks.push(card.cue.prompt);
    choices.forEach((choice, choiceIndex) => {
      textBlocks.push(`${LETTERS[choiceIndex] ?? String(choiceIndex + 1)}. ${choice}`);
    });
    textBlocks.push(play);
    textBlocks.push("");

    const choiceHtml = choices
      .map((choice, choiceIndex) => {
        const letter = LETTERS[choiceIndex] ?? String(choiceIndex + 1);
        return `<a href="${escapeHtml(play)}" style="display:block;margin:0 0 8px;padding:10px 12px;background:#f4f8f5;border:1px solid #c5d7cb;border-radius:10px;color:#4f345a;text-decoration:none;font-size:16px;line-height:1.4;"><span style="display:inline-block;width:1.4em;font-weight:700;">${letter}</span> ${escapeHtml(choice)}</a>`;
      })
      .join("");

    const badge =
      card.slot === "global"
        ? `<p style="margin:12px 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#4f345a;"><span style="background:#c9f299;border-radius:999px;padding:2px 8px;">Line of the day</span></p>`
        : "";

    cardsHtml.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#f4f8f5;border:1px solid #d5e3da;border-radius:16px;">
      <tr><td style="padding:0;">
        <a href="${escapeHtml(play)}"><img src="${escapeHtml(stillUrl(input.origin, card.cue))}" alt="${escapeHtml(card.cue.prompt)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:16px 16px 0 0;" /></a>
      </td></tr>
      <tr><td style="padding:4px 16px 16px;">
        ${badge}
        <p style="margin:8px 0 4px;font-size:18px;line-height:1.4;color:#4f345a;">${escapeHtml(card.cue.prompt)}</p>
        <p style="margin:0 0 12px;font-size:14px;color:#5d4e6d;">${escapeHtml(card.cue.title)}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#5d4e6d;">What comes next?</p>
        ${choiceHtml}
      </td></tr>
    </table>`);
  });

  textBlocks.push(`Unsubscribe: ${unsub}`);
  const preview = input.cards[0]?.cue.prompt ?? "Three quotes for today.";
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#e8f0ea;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8f0ea;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
        <tr><td style="padding:0 0 16px;font-family:Georgia,'Iowan Old Style',serif;color:#4f345a;">
          <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#5d4e6d;">Textline → Nextline</p>
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:600;">Today’s three</h1>
          <p style="margin:0;font-size:16px;line-height:1.5;">${escapeHtml(greeting)} ${escapeHtml(when)}. Tap a card to play that question, then the next, then wrap.</p>
        </td></tr>
        <tr><td>${cardsHtml.join("")}</td></tr>
        <tr><td style="padding:8px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:13px;line-height:1.5;color:#5d4e6d;">
          <p style="margin:0;">You’re getting this because daily quotes are on in Profile.</p>
          <p style="margin:8px 0 0;"><a href="${escapeHtml(unsub)}" style="color:#4f345a;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text: textBlocks.join("\n") };
}

export async function getDailyMailPreference(
  db: D1Database,
  userId: string,
): Promise<{ optedIn: boolean }> {
  const row = await db
    .prepare(`SELECT opted_in FROM daily_mail WHERE user_id = ?`)
    .bind(userId)
    .first<{ opted_in: number }>();
  return { optedIn: Number(row?.opted_in) === 1 };
}

export async function setDailyMailOptIn(
  db: D1Database,
  userId: string,
  optedIn: boolean,
): Promise<{ optedIn: boolean }> {
  const existing = await db
    .prepare(`SELECT unsub_token FROM daily_mail WHERE user_id = ?`)
    .bind(userId)
    .first<{ unsub_token: string }>();
  const now = new Date().toISOString();
  const flag = optedIn ? 1 : 0;
  if (!existing) {
    await db
      .prepare(
        `INSERT INTO daily_mail (user_id, opted_in, unsub_token, updated_at) VALUES (?, ?, ?, ?)`,
      )
      .bind(userId, flag, createMagicToken(), now)
      .run();
  } else {
    await db
      .prepare(`UPDATE daily_mail SET opted_in = ?, updated_at = ? WHERE user_id = ?`)
      .bind(flag, now, userId)
      .run();
  }
  return { optedIn };
}

function isUnsubToken(token: string): boolean {
  return /^[a-f0-9]{32,128}$/i.test(token);
}

export async function unsubscribeDailyMail(
  db: D1Database,
  tokenRaw: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const token = tokenRaw.trim();
  if (!isUnsubToken(token)) return { error: "Invalid link", status: 400 };
  const result = await db
    .prepare(`UPDATE daily_mail SET opted_in = 0, updated_at = ? WHERE unsub_token = ?`)
    .bind(new Date().toISOString(), token)
    .run();
  if ((result.meta?.changes ?? 0) < 1) return { error: "Invalid link", status: 400 };
  return { ok: true };
}

export function unsubscribePage(ok: boolean): string {
  const message = ok
    ? "Daily quotes are off. You can turn them back on from Profile."
    : "That unsubscribe link didn’t work. Turn daily quotes off from Profile.";
  return `<!DOCTYPE html><html><body style="margin:0;background:#e8f0ea;font-family:Georgia,serif;color:#4f345a;">
    <main style="max-width:32rem;margin:3rem auto;padding:1.5rem;">
      <h1 style="font-size:1.6rem;">Daily quotes</h1>
      <p>${message}</p>
      <p><a href="/" style="color:#4f345a;">Back to Textline</a></p>
    </main>
  </body></html>`;
}

async function listOptedInUsers(db: D1Database): Promise<MailUser[]> {
  const result = await db
    .prepare(
      `SELECT u.id, u.email, u.display_name, m.unsub_token
       FROM daily_mail m
       JOIN users u ON u.id = m.user_id
       WHERE m.opted_in = 1`,
    )
    .all<{ id: string; email: string; display_name: string | null; unsub_token: string }>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    unsubToken: row.unsub_token,
  }));
}

async function listUserStars(
  db: D1Database,
  userId: string,
): Promise<{ titleId: string; lineIndex: number }[]> {
  const result = await db
    .prepare(`SELECT title_id, line_index FROM stars WHERE player_id = ?`)
    .bind(userId)
    .all<{ title_id: string; line_index: number }>();
  return (result.results ?? []).map((row) => ({
    titleId: row.title_id,
    lineIndex: row.line_index,
  }));
}

async function alreadySent(db: D1Database, userId: string, sentOn: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT user_id FROM daily_mail_sends WHERE user_id = ? AND sent_on = ?`)
    .bind(userId, sentOn)
    .first<{ user_id: string }>();
  return Boolean(row);
}

async function recordSend(db: D1Database, userId: string, sentOn: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO daily_mail_sends (user_id, sent_on, created_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, sent_on) DO NOTHING`,
    )
    .bind(userId, sentOn, new Date().toISOString())
    .run();
}

type SendEnv = {
  DB: D1Database;
  APP_ORIGIN?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
};

async function deliverMail(
  env: SendEnv,
  user: MailUser,
  mail: { subject: string; html: string; text: string },
  fetchImpl: typeof fetch,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[daily-mail] ${user.email}: ${mail.subject}`);
    return true;
  }

  const from = env.RESEND_FROM ?? "Textline <onboarding@resend.dev>";
  const unsub = unsubscribeUrl(env.APP_ORIGIN ?? "", user.unsubToken);
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [user.email],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
      },
    }),
  });

  if (!response.ok) {
    console.error("Resend daily mail error", await response.text());
    return false;
  }
  return true;
}

export async function fetchDailyMailCatalog(origin: string, fetchImpl: typeof fetch = fetch): Promise<MailCue[]> {
  const response = await fetchImpl(`${appOrigin(origin)}/daily-mail-catalog.json`);
  if (!response.ok) {
    throw new Error(`Daily mail catalog ${response.status}`);
  }
  return parseDailyMailCatalog(await response.json());
}

export async function sendDailyMails(
  env: SendEnv,
  cues: MailCue[],
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const date = mailDateIso(now);
  const framed = new Set(cues.map((cue) => lineKey(cue)));
  const popular = await fetchPopularStarsGlobal(env.DB, POPULAR_LIMIT);
  const loved = await fetchLovedStarsGlobal(env.DB, LOVED_LIMIT);
  const globalPool = globalDailyPool(popular, loved, framed);
  const users = await listOptedInUsers(env.DB);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    if (await alreadySent(env.DB, user.id, date)) {
      skipped += 1;
      continue;
    }
    const personal = personalDailyPool(await listUserStars(env.DB, user.id), framed);
    const cards = cardsForMail(date, cues, globalPool, personal);
    if (cards.length === 0) {
      skipped += 1;
      continue;
    }
    const mail = renderDailyMail({
      date,
      origin: env.APP_ORIGIN ?? "",
      unsubToken: user.unsubToken,
      displayName: user.displayName,
      cards,
    });
    const ok = await deliverMail(env, user, mail, fetchImpl);
    if (!ok) {
      failed += 1;
      continue;
    }
    await recordSend(env.DB, user.id, date);
    sent += 1;
  }

  return { sent, skipped, failed };
}

export async function runDailyMail(
  env: SendEnv,
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; skipped: number; failed: number }> {
  try {
    const cues = await fetchDailyMailCatalog(env.APP_ORIGIN ?? "", fetchImpl);
    if (cues.length === 0) {
      console.error("[daily-mail] catalog was empty; no mail sent");
      return { sent: 0, skipped: 0, failed: 0 };
    }
    const result = await sendDailyMails(env, cues, now, fetchImpl);
    console.log(`[daily-mail] sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}`);
    return result;
  } catch (error) {
    console.error("[daily-mail]", error);
    return { sent: 0, skipped: 0, failed: 0 };
  }
}
