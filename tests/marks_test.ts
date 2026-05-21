import { applyLegendToDate, cleanMarks } from "../src/lib/marks.ts";

Deno.test("applyLegendToDate toggles by requested action", () => {
  assertEquals(applyLegendToDate([], "a", "add"), ["a"]);
  assertEquals(applyLegendToDate(["a", "b"], "a", "remove"), ["b"]);
});

Deno.test("applyLegendToDate does not duplicate legends", () => {
  assertEquals(applyLegendToDate(["a"], "a", "add"), ["a"]);
});

Deno.test("applyLegendToDate caps at four legends per day", () => {
  assertEquals(applyLegendToDate(["a", "b", "c", "d"], "e", "add"), ["a", "b", "c", "d"]);
});

Deno.test("cleanMarks removes empty date entries", () => {
  assertEquals(cleanMarks({ "2026-01-01": [], "2026-01-02": ["a"] }), {
    "2026-01-02": ["a"],
  });
});

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}
