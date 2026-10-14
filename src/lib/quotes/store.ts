export type QuoteMark = {
  titleId: string;
  lineIndex: number;
  quotedAt: string;
};

type QuoteStore = {
  quotes: QuoteMark[];
};

const STORAGE_KEY = "textline-nextline-quotes";

function readStore(): QuoteStore {
  if (typeof localStorage === "undefined") return { quotes: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { quotes: [] };
    const parsed = JSON.parse(raw) as QuoteStore;
    if (!Array.isArray(parsed.quotes)) return { quotes: [] };
    return {
      quotes: parsed.quotes.filter(
        (quote) =>
          typeof quote.titleId === "string" &&
          quote.titleId.length > 0 &&
          Number.isInteger(quote.lineIndex) &&
          quote.lineIndex >= 0,
      ),
    };
  } catch {
    return { quotes: [] };
  }
}

function writeStore(store: QuoteStore): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listQuotes(): QuoteMark[] {
  return readStore().quotes;
}

export function getQuotesForTitle(titleId: string): QuoteMark[] {
  return listQuotes().filter((quote) => quote.titleId === titleId);
}

export function isQuoted(titleId: string, lineIndex: number): boolean {
  return readStore().quotes.some(
    (quote) => quote.titleId === titleId && quote.lineIndex === lineIndex,
  );
}

export function setQuoteLocal(titleId: string, lineIndex: number): void {
  const store = readStore();
  if (store.quotes.some((quote) => quote.titleId === titleId && quote.lineIndex === lineIndex)) {
    return;
  }
  store.quotes.push({
    titleId,
    lineIndex,
    quotedAt: new Date().toISOString(),
  });
  writeStore(store);
}

export function removeQuoteLocal(titleId: string, lineIndex: number): void {
  const store = readStore();
  store.quotes = store.quotes.filter(
    (quote) => !(quote.titleId === titleId && quote.lineIndex === lineIndex),
  );
  writeStore(store);
}

/** Remote marks for one title replace that title's local marks. Other titles stay. */
export function mergeRemoteQuotes(
  titleId: string,
  remote: { lineIndex: number; quotedAt?: string }[],
): void {
  const store = readStore();
  const kept = store.quotes.filter((quote) => quote.titleId !== titleId);
  const now = new Date().toISOString();
  writeStore({
    quotes: [
      ...kept,
      ...remote.map((quote) => ({
        titleId,
        lineIndex: quote.lineIndex,
        quotedAt: quote.quotedAt || now,
      })),
    ],
  });
}

/** The account's full quote list replaces the local cache. */
export function replaceQuotes(remote: QuoteMark[]): void {
  writeStore({ quotes: remote });
}
