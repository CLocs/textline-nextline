import { unstarLine } from "../stars/api.js";
import { isStarred } from "../stars/store.js";
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
  type QuoteOrigin,
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
      origin: quote.origin === "wikiquote" ? "wikiquote" : "mine",
    })),
  );
}

function quoteOrigin(titleId: string, lineIndex: number): QuoteOrigin {
  return (
    listQuotes().find((quote) => quote.titleId === titleId && quote.lineIndex === lineIndex)
      ?.origin ?? "mine"
  );
}

/** Toggle a quote locally first, then sync when the API is available. */
export async function toggleQuote(titleId: string, lineIndex: number): Promise<boolean> {
  const wasQuoted = isQuoted(titleId, lineIndex);
  const nowQuoted = !wasQuoted;
  const origin = wasQuoted ? quoteOrigin(titleId, lineIndex) : "mine";

  if (nowQuoted) setQuoteLocal(titleId, lineIndex);
  else removeQuoteLocal(titleId, lineIndex);

  if (!isQuoteApiEnabled()) return nowQuoted;

  if (nowQuoted) {
    const synced = await quoteLine(titleId, lineIndex);
    if (!synced) {
      removeQuoteLocal(titleId, lineIndex);
      return wasQuoted;
    }
    return true;
  }

  const quoteSynced = await unquoteLine(titleId, lineIndex);
  // A Wikiquote import still lives on the star row until that row is moved.
  // Clearing the quote removes that star when this line is not also a real TL.
  const starSynced =
    origin === "wikiquote" && !isStarred(titleId, lineIndex) ? await unstarLine(titleId, lineIndex) : true;
  if (!quoteSynced && !starSynced) {
    setQuoteLocal(titleId, lineIndex, origin);
    return wasQuoted;
  }
  return false;
}

export { getQuotesForTitle, isQuoted, listQuotes };
