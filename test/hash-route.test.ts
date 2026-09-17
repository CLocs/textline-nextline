import { describe, expect, it } from "vitest";
import { isSafeLoginReturn, parseHash } from "../src/lib/routing/hash.js";

describe("parseHash", () => {
  it("parses share play routes", () => {
    expect(parseHash("#/play/abc123")).toEqual({ kind: "play", shareId: "abc123" });
  });

  it("parses auth tokens", () => {
    expect(parseHash("#/auth?token=deadbeef")).toEqual({ kind: "auth", token: "deadbeef" });
  });

  it("parses auth tokens with a post-login return path", () => {
    expect(parseHash("#/auth?token=deadbeef&return=play%2Fabc123")).toEqual({
      kind: "auth",
      token: "deadbeef",
      returnTo: "play/abc123",
    });
  });

  it("parses login return paths", () => {
    expect(parseHash("#/login?return=play%2Fabc")).toEqual({
      kind: "login",
      returnTo: "play/abc",
    });
  });

  it("drops unsafe login return paths", () => {
    expect(parseHash("#/login?return=https%3A%2F%2Fevil.example")).toEqual({
      kind: "login",
    });
  });

  it("parses profile tabs", () => {
    expect(parseHash("#/profile")).toEqual({ kind: "profile", tab: "account" });
    expect(parseHash("#/profile/history")).toEqual({ kind: "profile", tab: "history" });
    expect(parseHash("#/profile/stats")).toEqual({ kind: "profile", tab: "stats" });
    expect(parseHash("#/profile/friends")).toEqual({ kind: "profile", tab: "friends" });
  });

  it("parses friend invite routes", () => {
    expect(parseHash("#/friend/aabbccddeeff001122334455")).toEqual({
      kind: "friend",
      token: "aabbccddeeff001122334455",
    });
  });

  it("parses the owner catalog route", () => {
    expect(parseHash("#/ops")).toEqual({ kind: "ops" });
  });
});

describe("isSafeLoginReturn", () => {
  it("allows play and profile hashes only", () => {
    expect(isSafeLoginReturn("play/abc123")).toBe(true);
    expect(isSafeLoginReturn("profile/history")).toBe(true);
    expect(isSafeLoginReturn("profile/friends")).toBe(true);
    expect(isSafeLoginReturn("friend/aabbccddeeff001122334455")).toBe(true);
    expect(isSafeLoginReturn("ops")).toBe(true);
    expect(isSafeLoginReturn("https://evil.example")).toBe(false);
    expect(isSafeLoginReturn("play/../library")).toBe(false);
    expect(isSafeLoginReturn("friend/short")).toBe(false);
  });
});
