import { describe, expect, it } from "vitest";

import { formatDuration, fromDateKey, parseDuration, toDateKey } from "./utils";

describe("parseDuration", () => {
  it("returns null for empty input", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("   ")).toBeNull();
  });

  it("parses hours and minutes in different notations", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("1,5")).toBe(90);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("2 saat")).toBe(120);
    expect(parseDuration("30 dk")).toBe(30);
  });

  it("reads small bare numbers as hours and larger ones as minutes", () => {
    expect(parseDuration("8")).toBe(480);
    expect(parseDuration("45")).toBe(45);
  });

  it("rejects invalid or out-of-range values", () => {
    expect(parseDuration("abc")).toBeUndefined();
    expect(parseDuration("1:75")).toBeUndefined();
    expect(parseDuration("25h")).toBeUndefined();
    expect(parseDuration("0")).toBeUndefined();
  });
});

describe("formatDuration", () => {
  it("formats minutes", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(90)).toBe("1h 30m");
  });
});

describe("date keys", () => {
  it("round-trips local dates", () => {
    const date = new Date(2026, 10, 16);
    expect(toDateKey(date)).toBe("2026-11-16");
    expect(toDateKey(fromDateKey("2026-01-05"))).toBe("2026-01-05");
  });
});
