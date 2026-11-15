import { normalizeChoiceText } from "../game/lineSimilarity.js";
import type { HeardToken } from "./spokenMatch.js";

const MAX_TOKENS = 240;

function tokenize(text: string): string[] {
  const normalized = normalizeChoiceText(text);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

export type HeardSpan = {
  startedAt: number;
  endedAt: number;
};

export type HeardLog = {
  clear: () => void;
  interim: (text: string, at: number) => void;
  final: (text: string, at: number) => HeardSpan | null;
  tokensSince: (since: number) => HeardToken[];
};

/**
 * Words Chrome has already produced, with the time each one showed up.
 * An interim replaces the live phrase. A final keeps those times and commits it.
 */
export function createHeardLog(): HeardLog {
  let stable: HeardToken[] = [];
  let live: HeardToken[] = [];

  function align(previous: HeardToken[], tokens: string[], at: number): HeardToken[] {
    const next: HeardToken[] = [];
    let from = 0;
    for (const token of tokens) {
      let found = -1;
      for (let i = from; i < previous.length; i += 1) {
        if (previous[i]?.token === token) {
          found = i;
          break;
        }
      }
      if (found >= 0 && previous[found]) {
        next.push(previous[found]);
        from = found + 1;
      } else {
        next.push({ token, at });
      }
    }
    return next;
  }

  return {
    clear() {
      stable = [];
      live = [];
    },
    interim(text, at) {
      live = align(live, tokenize(text), at);
    },
    final(text, at) {
      const tokens = tokenize(text);
      if (tokens.length === 0) {
        live = [];
        return null;
      }
      const stamped = align(live, tokens, at);
      stable = stable.concat(stamped);
      if (stable.length > MAX_TOKENS) stable = stable.slice(-MAX_TOKENS);
      live = [];
      const startedAt = stamped[0]?.at ?? at;
      const endedAt = stamped[stamped.length - 1]?.at ?? at;
      return { startedAt, endedAt };
    },
    tokensSince(since) {
      const all = live.length > 0 ? stable.concat(live) : stable;
      const kept: HeardToken[] = [];
      for (let i = all.length - 1; i >= 0; i -= 1) {
        const token = all[i];
        if (!token || token.at < since) break;
        kept.push(token);
      }
      kept.reverse();
      return kept;
    },
  };
}
