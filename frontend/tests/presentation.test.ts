import { describe, expect, it } from "vitest";
import { calendarState, isOverdue } from "@/lib/presentation";

describe("calendarState", () => {
  it("distinguishes complete, partial and skipped days", () => {
    expect(calendarState({ taken: 2, skipped: 0, pending: 0 })).toBe("complete");
    expect(calendarState({ taken: 1, skipped: 1, pending: 0 })).toBe("partial");
    expect(calendarState({ taken: 0, skipped: 2, pending: 0 })).toBe("skipped");
    expect(calendarState({ taken: 1, skipped: 0, pending: 1 })).toBe("partial");
  });
});

describe("isOverdue", () => {
  it("only marks unresolved scheduled doses in the past", () => {
    const now = new Date("2026-09-22T12:00:00");
    expect(isOverdue("PENDING", "2026-09-22", "08:00:00", now)).toBe(true);
    expect(isOverdue("TAKEN", "2026-09-22", "08:00:00", now)).toBe(false);
    expect(isOverdue("PENDING", "2026-09-22", "20:00:00", now)).toBe(false);
  });
});
