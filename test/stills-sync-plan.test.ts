import { describe, expect, it } from "vitest";
import { stillNeedsUpload } from "../src/lib/content/stillsSyncPlan.js";

const md5 = "d41d8cd98f00b204e9800998ecf8427e";

describe("stillNeedsUpload", () => {
  it("uploads when the key is missing or the size changed", () => {
    expect(stillNeedsUpload({ size: 10 }, undefined)).toBe(true);
    expect(stillNeedsUpload({ size: 10 }, { size: 11, etag: md5 })).toBe(true);
  });

  it("skips a size match before a hash is available", () => {
    expect(stillNeedsUpload({ size: 10 }, { size: 10, etag: md5 })).toBe(false);
  });

  it("uploads when the MD5 differs from a plain etag, including quoted etags", () => {
    expect(stillNeedsUpload({ size: 10, md5 }, { size: 10, etag: `"${md5}"` })).toBe(false);
    expect(stillNeedsUpload({ size: 10, md5: "ab".repeat(16) }, { size: 10, etag: md5 })).toBe(true);
  });

  it("trusts size when the etag is multipart", () => {
    expect(stillNeedsUpload({ size: 10, md5 }, { size: 10, etag: `${md5}-2` })).toBe(false);
  });
});
