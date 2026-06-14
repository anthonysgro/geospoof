import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";

describe("DEFAULT_SETTINGS scope defaults", () => {
  it('defaults scopeMode to "all"', () => {
    expect(DEFAULT_SETTINGS.scopeMode).toBe("all");
  });

  it("defaults whitelist to an empty array", () => {
    expect(Array.isArray(DEFAULT_SETTINGS.whitelist)).toBe(true);
    expect(DEFAULT_SETTINGS.whitelist).toEqual([]);
  });

  it("defaults blacklist to an empty array", () => {
    expect(Array.isArray(DEFAULT_SETTINGS.blacklist)).toBe(true);
    expect(DEFAULT_SETTINGS.blacklist).toEqual([]);
  });

  it("keeps whitelist and blacklist as two independent arrays", () => {
    expect(DEFAULT_SETTINGS.whitelist).not.toBe(DEFAULT_SETTINGS.blacklist);
  });

  it('bumps schema version to "1.1"', () => {
    expect(DEFAULT_SETTINGS.version).toBe("1.1");
  });
});
