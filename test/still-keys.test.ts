import { describe, expect, it } from "vitest";
import { stillKeyFromPathname, stillObjectKey } from "../src/lib/content/stillKeys.js";

describe("stillObjectKey", () => {
  it("accepts title id + line jpeg names", () => {
    expect(stillObjectKey("oceans-thirteen-2007", "1334.jpg")).toBe("oceans-thirteen-2007/1334.jpg");
    expect(stillObjectKey("the-wolf-of-wall-street-2013", "56.JPEG")).toBe(
      "the-wolf-of-wall-street-2013/56.jpg",
    );
  });

  it("rejects traversal and junk", () => {
    expect(stillObjectKey("../x", "1.jpg")).toBeNull();
    expect(stillObjectKey("oceans-thirteen-2007", "../1.jpg")).toBeNull();
    expect(stillObjectKey("oceans-thirteen-2007", "1.png")).toBeNull();
  });
});

describe("stillKeyFromPathname", () => {
  it("maps the play-UI path", () => {
    expect(stillKeyFromPathname("/stills/oceans-thirteen-2007/40.jpg")).toBe(
      "oceans-thirteen-2007/40.jpg",
    );
    expect(stillKeyFromPathname("/stills/friday-1995/199.jpg?r=1")).toBe("friday-1995/199.jpg");
  });

  it("rejects extra segments", () => {
    expect(stillKeyFromPathname("/stills/oceans-thirteen-2007/nested/40.jpg")).toBeNull();
    expect(stillKeyFromPathname("/stills/not a title/1.jpg")).toBeNull();
  });
});
