import { describe, expect, it } from "vitest";
import { contrastRatio, meetsAA, PALETTES } from "./contrast";

describe("contrast", () => {
  it("computes known WCAG reference ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it.each(Object.entries(PALETTES))("the %s scheme's text pairings meet WCAG AA (>=4.5:1)", (_name, palette) => {
    expect(contrastRatio(palette.primaryText, palette.surfaceBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.secondaryText, palette.surfaceBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.buttonText, palette.buttonBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.brandingText, palette.brandingBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("meetsAA respects the large-text (3:1) threshold separately from body text (4.5:1)", () => {
    expect(meetsAA("#767676", "#ffffff")).toBe(true);
    expect(meetsAA("#949494", "#ffffff")).toBe(false);
    expect(meetsAA("#949494", "#ffffff", true)).toBe(true);
  });
});
