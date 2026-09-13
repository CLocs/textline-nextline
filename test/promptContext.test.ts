import { describe, expect, it } from "vitest";
import type { Title } from "../src/types/content.js";
import { leadInForPrompt } from "../src/lib/game/promptContext.js";

const title: Title = {
  id: "inglourious-basterds-2009",
  title: "Inglourious Basterds (2009)",
  sourceFilename: "ib.srt",
  importedAt: "2026-01-01T00:00:00.000Z",
  lineCount: 4,
  lines: [
    {
      index: 739,
      text: "I apologize, I forgot to order the cream.",
      kind: "dialogue",
      startMs: 3390971,
      endMs: 3394641,
    },
    {
      index: 740,
      text: "--One moment.",
      kind: "dialogue",
      startMs: 3395183,
      endMs: 3396310,
    },
    {
      index: 741,
      text: "Wait for the cream.",
      kind: "dialogue",
      startMs: 3403108,
      endMs: 3404860,
    },
    {
      index: 742,
      text: "So, Emmanuelle. May I call you Emmanuelle?",
      kind: "dialogue",
      startMs: 3417205,
      endMs: 3420626,
    },
  ],
};

describe("leadInForPrompt", () => {
  it("pulls the previous cue when the prompt is a short fragment", () => {
    const lead = leadInForPrompt(title, 740);
    expect(lead.map((line) => line.text)).toEqual([
      "I apologize, I forgot to order the cream.",
    ]);
  });

  it("leaves a long prompt alone", () => {
    expect(leadInForPrompt(title, 739)).toEqual([]);
  });

  it("does not pull across a long pause", () => {
    const gappy: Title = {
      ...title,
      lines: [
        {
          index: 0,
          text: "Earlier scene.",
          kind: "dialogue",
          startMs: 0,
          endMs: 1000,
        },
        {
          index: 1,
          text: "Oui.",
          kind: "dialogue",
          startMs: 20000,
          endMs: 21000,
        },
      ],
    };
    expect(leadInForPrompt(gappy, 1)).toEqual([]);
  });
});
