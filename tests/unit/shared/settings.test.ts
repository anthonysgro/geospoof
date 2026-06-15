import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";

describe("DEFAULT_SETTINGS scope defaults", () => {
  it('defaults scopeMode to "all"', () => {
    expect(DEFAULT_SETTINGS.scopeMode).toBe("all");
  });

  it("defaults allowlist to an empty array", () => {
    expect(Array.isArray(DEFAULT_SETTINGS.allowlist)).toBe(true);
    expect(DEFAULT_SETTINGS.allowlist).toEqual([]);
  });

  it("defaults denylist to an empty array", () => {
    expect(Array.isArray(DEFAULT_SETTINGS.denylist)).toBe(true);
    expect(DEFAULT_SETTINGS.denylist).toEqual([]);
  });

  it("keeps allowlist and denylist as two independent arrays", () => {
    expect(DEFAULT_SETTINGS.allowlist).not.toBe(DEFAULT_SETTINGS.denylist);
  });

  it('bumps schema version to "1.1"', () => {
    expect(DEFAULT_SETTINGS.version).toBe("1.1");
  });
});
