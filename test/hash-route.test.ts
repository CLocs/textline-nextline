import { describe, expect, it } from "vitest";
import { parseHash } from "../src/lib/routing/hash.js";

describe("parseHash", () => {
  it("parses share play routes", () => {
    expect(parseHash("#/play/abc123")).toEqual({ kind: "play", shareId: "abc123" });
  });

  it("parses auth tokens", () => {
    expect(parseHash("#/auth?token=deadbeef")).toEqual({ kind: "auth", token: "deadbeef" });
  });

  it("parses login return paths", () => {
    expect(parseHash("#/login?return=play%2Fabc")).toEqual({
      kind: "login",
      returnTo: "play/abc",
    });
  });
});
