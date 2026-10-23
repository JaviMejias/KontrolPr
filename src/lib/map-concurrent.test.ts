import { describe, expect, it } from "vitest";
import { mapConcurrent } from "./map-concurrent";

describe("bounded parallel work", () => {
  it("limits active work while preserving input order", async () => {
    let active = 0; let max = 0;
    const values = await mapConcurrent([1, 2, 3, 4, 5], 2, async (item) => {
      active++; max = Math.max(max, active);
      await Promise.resolve(); active--; return item * 2;
    });
    expect(values).toEqual([2, 4, 6, 8, 10]); expect(max).toBe(2);
  });
  it("stops scheduling new items after a failure", async () => {
    const started: number[] = [];
    await expect(mapConcurrent([1, 2, 3], 1, async (item) => { started.push(item); throw new Error("failed"); })).rejects.toThrow("failed");
    expect(started).toEqual([1]);
  });
});
