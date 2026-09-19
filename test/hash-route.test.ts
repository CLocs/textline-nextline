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
    expect(parseHash("#/profile/chats")).toEqual({ kind: "profile", tab: "chats" });
    // Legacy inbox hash aliases to Chats
    expect(parseHash("#/profile/inbox")).toEqual({ kind: "profile", tab: "chats" });
    expect(parseHash("#/profile/parallels")).toEqual({ kind: "profile", tab: "parallels" });
  });

  it("parses chats routes", () => {
    expect(parseHash("#/chats")).toEqual({ kind: "chats" });
    expect(parseHash("#/chat/user-123")).toEqual({ kind: "chat", peerUserId: "user-123" });
    expect(parseHash("#/chat/group/group-456")).toEqual({
      kind: "chatGroup",
      groupId: "group-456",
    });
  });

  it("parses parallel pack routes", () => {
    expect(parseHash("#/parallel/abc123")).toEqual({ kind: "parallel", packId: "abc123" });
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
    expect(isSafeLoginReturn("profile/inbox")).toBe(true);
    expect(isSafeLoginReturn("profile/chats")).toBe(true);
    expect(isSafeLoginReturn("chats")).toBe(true);
    expect(isSafeLoginReturn("chat/user-123")).toBe(true);
    expect(isSafeLoginReturn("chat/group/group-456")).toBe(true);
    expect(isSafeLoginReturn("friend/aabbccddeeff001122334455")).toBe(true);
    expect(isSafeLoginReturn("ops")).toBe(true);
    expect(isSafeLoginReturn("https://evil.example")).toBe(false);
    expect(isSafeLoginReturn("play/../library")).toBe(false);
    expect(isSafeLoginReturn("friend/short")).toBe(false);
  });
});
