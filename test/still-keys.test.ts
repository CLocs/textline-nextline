import { describe, expect, it } from "vitest";
import { stillKeyFromPathname, stillObjectKey, titleIdFromStillKey } from "../src/lib/content/stillKeys.js";

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

describe("titleIdFromStillKey", () => {
  it("reads the title id from an R2 object key", () => {
    expect(titleIdFromStillKey("american-gangster-2007/12.jpg")).toBe("american-gangster-2007");
    expect(titleIdFromStillKey("the-simpsons---5x01---homers-barbershop-quartet/3.JPEG")).toBe(
      "the-simpsons---5x01---homers-barbershop-quartet",
    );
    expect(titleIdFromStillKey("nested/title/1.jpg")).toBeNull();
    expect(titleIdFromStillKey("notes.txt")).toBeNull();
    expect(titleIdFromStillKey("american-gangster-2007/poster.png")).toBeNull();
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
