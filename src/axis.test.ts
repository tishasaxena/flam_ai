import { describe, expect, it } from "vitest";
import { allocateAxis, type AxisItem } from "./axis";

const item = (overrides: Partial<AxisItem> & Pick<AxisItem, "id">): AxisItem => ({
  priority: 1,
  ideal: 100,
  min: 50,
  canDrop: false,
  ...overrides,
});

describe("allocateAxis", () => {
  it("gives every item its ideal size when the budget has room to spare", () => {
    const result = allocateAxis([item({ id: "a", ideal: 100 }), item({ id: "b", ideal: 80 })], 300);

    expect(result.sizes.get("a")).toBe(100);
    expect(result.sizes.get("b")).toBe(80);
    expect(result.dropped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("shrinks items proportionally to their own slack when over budget, never below min", () => {
    // a has 50px of slack (150-100), b has 0 (80-80) — b should not move at all.
    const result = allocateAxis([item({ id: "a", ideal: 150, min: 100 }), item({ id: "b", ideal: 80, min: 80 })], 180);

    expect(result.sizes.get("b")).toBe(80);
    expect(result.sizes.get("a")).toBe(100);
    expect(result.dropped).toEqual([]);
  });

  it("drops the least-important droppable item before touching non-droppable ones", () => {
    const result = allocateAxis(
      [
        item({ id: "critical", priority: 1, ideal: 120, min: 120, canDrop: false }),
        item({ id: "optional", priority: 3, ideal: 60, min: 60, canDrop: true }),
      ],
      120,
    );

    expect(result.dropped.map((d) => d.id)).toEqual(["optional"]);
    expect(result.sizes.get("critical")).toBe(120);
    expect(result.sizes.has("optional")).toBe(false);
  });

  it("never drops a non-droppable item, clamping and warning instead as a last resort", () => {
    const result = allocateAxis([item({ id: "a", priority: 1, ideal: 100, min: 100, canDrop: false })], 40);

    expect(result.dropped).toEqual([]);
    expect(result.sizes.get("a")).toBe(40);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("among equal-priority droppable items, drops the later-declared one first", () => {
    const result = allocateAxis(
      [
        item({ id: "first", priority: 5, ideal: 50, min: 50, canDrop: true }),
        item({ id: "second", priority: 5, ideal: 50, min: 50, canDrop: true }),
      ],
      50,
    );

    expect(result.dropped.map((d) => d.id)).toEqual(["second"]);
    expect(result.sizes.get("first")).toBe(50);
  });

  it("normalizes an ideal below its own min instead of producing a negative slack", () => {
    const result = allocateAxis([item({ id: "a", ideal: 10, min: 40, canDrop: false })], 100);
    expect(result.sizes.get("a")).toBe(40);
  });

  it("handles an empty item list without throwing", () => {
    const result = allocateAxis([], 500);
    expect(result.sizes.size).toBe(0);
    expect(result.dropped).toEqual([]);
  });
});
