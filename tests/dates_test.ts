import { enumerateDays, getAutoViewMode, monthsInRange, normalizeRange } from "../src/lib/dates.ts";

Deno.test("normalizeRange orders start and end", () => {
  assertEquals(normalizeRange({ start: "2026-09-10", end: "2026-09-01" }), {
    start: "2026-09-01",
    end: "2026-09-10",
  });
});

Deno.test("enumerateDays includes both endpoints", () => {
  assertEquals(enumerateDays({ start: "2026-06-01", end: "2026-06-03" }), [
    "2026-06-01",
    "2026-06-02",
    "2026-06-03",
  ]);
});

Deno.test("getAutoViewMode chooses week, months, and years", () => {
  assertEquals(getAutoViewMode({ start: "2026-06-01", end: "2026-06-07" }), "week");
  assertEquals(getAutoViewMode({ start: "2026-06-01", end: "2026-08-30" }), "months");
  assertEquals(getAutoViewMode({ start: "2026-01-01", end: "2026-12-31" }), "years");
});

Deno.test("monthsInRange returns inclusive months", () => {
  assertEquals(
    monthsInRange({ start: "2026-11-20", end: "2027-01-05" }).map((month) => month.key),
    ["2026-11", "2026-12", "2027-01"],
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}
