import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatBlockText, stripSpeakerDash } from "../src/lib/text.js";
import {
  ImportError,
  parseTranscriptMakerWork,
  workToTitle,
} from "../src/lib/import/transcriptMaker.js";

const fixturePath = join(import.meta.dirname, "fixtures", "sample-work.json");

describe("stripSpeakerDash", () => {
  it("removes hyphen speaker prefixes", () => {
    expect(stripSpeakerDash("- Hello there.")).toBe("Hello there.");
  });
});

describe("formatBlockText", () => {
  it("joins multi-line blocks and strips dashes", () => {
    expect(formatBlockText("- Hello.\n- Goodbye.")).toBe("Hello. Goodbye.");
  });
});

describe("workToTitle", () => {
  it("imports a transcript_maker export into playable lines", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    const title = workToTitle(raw);

    expect(title.id).toBe("sample-episode");
    expect(title.title).toBe("Sample Episode");
    expect(title.lineCount).toBe(4);
    expect(title.lines[0]?.text).toBe("D'oh!");
    expect(title.lines[1]?.text).toBe("Why you little—");
    expect(title.lines[2]?.kind).toBe("sdh");
    expect(title.meta?.year).toBe(1990);
  });

  it("rejects exports without a generated transcript", () => {
    expect(() =>
      workToTitle({
        title: "Empty",
        sourceFilename: "empty.srt",
        transcript: null,
      }),
    ).toThrow(ImportError);
  });

  it("rejects transcripts with fewer than two lines", () => {
    expect(() =>
      workToTitle({
        title: "Tiny",
        sourceFilename: "tiny.srt",
        transcript: {
          generatedAt: 0,
          options: {},
          blocks: [
            {
              startMs: 0,
              endMs: 1000,
              cueIndices: [1],
              text: "Only one.",
              kind: "dialogue",
            },
          ],
        },
      }),
    ).toThrow(ImportError);
  });
});

describe("parseTranscriptMakerWork", () => {
  it("validates required fields", () => {
    expect(() => parseTranscriptMakerWork({})).toThrow(ImportError);
  });
});
