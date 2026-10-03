import { describe, expect, it } from "vitest";
import { isPilotCurator } from "../src/lib/content/curators.js";

describe("pilot curators", () => {
  it("allows Colin and nalongi only", () => {
    expect(isPilotCurator({ email: "dascolin@gmail.com", displayName: "Colin" })).toBe(true);
    expect(isPilotCurator({ email: "DasColin@gmail.com", displayName: null })).toBe(true);
    expect(isPilotCurator({ email: "nalongi@gmail.com", displayName: "Na" })).toBe(true);
    expect(isPilotCurator({ email: "friend@gmail.com", displayName: "Nalongi" })).toBe(true);
    expect(isPilotCurator({ email: "friend@gmail.com", displayName: "Friend" })).toBe(false);
    expect(isPilotCurator({ email: "notnalongi@gmail.com", displayName: "nalongi fan" })).toBe(false);
    expect(isPilotCurator(null)).toBe(false);
  });
});