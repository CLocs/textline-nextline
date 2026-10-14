import {
  fetchMyQuotes,
  fetchPopularQuotesGlobal,
  isQuoteApiEnabled,
  quoteLine,
  unquoteLine,
  type PopularQuote,
} from "./api.js";
import {
  getQuotesForTitle,
  isQuoted,
  listQuotes,
  mergeRemoteQuotes,
  removeQuoteLocal,
  replaceQuotes,
  setQuoteLocal,
  type QuoteMark,
} from "./store.js";

export type { PopularQuote, QuoteMark };

export async function hydrateQuotesForTitle(titleId: string): Promise<void> {
  if (!isQuoteApiEnabled()) return;
  const remote = await fetchMyQuotes(titleId);
  if (remote === null) return;
  mergeRemoteQuotes(titleId, remote);
}

export async function hydrateAllQuotes(): Promise<void> {
  if (!isQuoteApiEnabled()) return;
  const remote = await fetchMyQuotes();
  if (remote === null) return;
  replaceQuotes(
    remote.map((quote) => ({
      titleId: quote.titleId,
      lineIndex: quote.lineIndex,
      quotedAt: quote.quotedAt,
    })),
  );
}

/** Toggle a quote locally first, then sync when the API is available. */
export async function toggleQuote(titleId: string, lineIndex: number): Promise<boolean> {
  const wasQuoted = isQuoted(titleId, lineIndex);
  const nowQuoted = !wasQuoted;

  if (nowQuoted) setQuoteLocal(titleId, lineIndex);
  else removeQuoteLocal(titleId, lineIndex);

  if (!isQuoteApiEnabled()) return nowQuoted;

  const synced = nowQuoted
    ? await quoteLine(titleId, lineIndex)
    : await unquoteLine(titleId, lineIndex);

  if (!synced) {
    if (nowQuoted) removeQuoteLocal(titleId, lineIndex);
    else setQuoteLocal(titleId, lineIndex);
    return wasQuoted;
  }

  return nowQuoted;
}

export { getQuotesForTitle, isQuoted, listQuotes };
