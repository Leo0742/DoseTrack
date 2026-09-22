import { describe, expect, it } from "vitest";
import { formatApiDetail } from "@/lib/api";

describe("formatApiDetail", () => {
  it("renders FastAPI validation errors as readable text", () => {
    expect(formatApiDetail([
      { loc: ["body", "email"], msg: "value is not a valid email address", type: "value_error" },
    ])).toBe("email: value is not a valid email address");
  });

  it("never turns a structured detail into object Object", () => {
    const result = formatApiDetail({ msg: "Invalid value" });
    expect(result).toBe("Invalid value");
    expect(result).not.toContain("[object Object]");
  });
});
