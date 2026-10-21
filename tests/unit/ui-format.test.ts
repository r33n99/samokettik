import { describe, expect, it } from "vitest";
import { money, dateTime } from "../../apps/web/src/ui/format.js";
describe("authoritative API values in the UI", () => {
  it("formats decimal minor-unit strings beyond the Number safe range without losing cents", () => {
    expect(money("900719925474099301", "ru").replace(/\s/g, "")).toBe(
      "9007199254740993,01",
    );
    expect(money("1000", "ky")).toBe("10");
    expect(money("1", "ru")).toBe("0,01");
  });
  it("renders persisted UTC timestamps in Bishkek rather than relying on browser timezone", () => {
    const result = dateTime("2026-10-20T18:00:00.000Z", "ru");
    expect(result).toContain("21");
    expect(result).toContain("00:00");
  });
});
