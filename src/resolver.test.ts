import { describe, expect, it } from "vitest";
import { demoAd } from "./demo-ad";
import { defineSurface, surfaces } from "./surfaces";
import { resolveLayout } from "./resolver";
import type { ResolvedElement, ResolvedLayout } from "./layout";

function overlaps(a: ResolvedElement, b: ResolvedElement): boolean {
  const xOverlap = a.x < b.x + b.width && b.x < a.x + a.width;
  const yOverlap = a.y < b.y + b.height && b.y < a.y + a.height;
  return xOverlap && yOverlap;
}

/** The one invariant every flow must uphold regardless of input: nothing overlaps, nothing exceeds the surface. */
function expectNoOverlapsOrClipping(layout: ResolvedLayout) {
  for (const el of layout.elements) {
    expect(el.x).toBeGreaterThanOrEqual(0);
    expect(el.y).toBeGreaterThanOrEqual(0);
    expect(el.x + el.width).toBeLessThanOrEqual(layout.surfaceWidth + 0.01);
    expect(el.y + el.height).toBeLessThanOrEqual(layout.surfaceHeight + 0.01);
  }
  for (let i = 0; i < layout.elements.length; i++) {
    for (let j = i + 1; j < layout.elements.length; j++) {
      expect(overlaps(layout.elements[i]!, layout.elements[j]!)).toBe(false);
    }
  }
}

describe("resolveLayout", () => {
  it.each(Object.values(surfaces))("produces no overlaps or out-of-bounds elements on $id", (surface) => {
    expectNoOverlapsOrClipping(resolveLayout(demoAd, surface));
  });

  it("classifies flow from surface geometry, not from surface identity", () => {
    expect(resolveLayout(demoAd, surfaces.mobilePortrait).flow).toBe("stack");
    expect(resolveLayout(demoAd, surfaces.broadcastLowerThird).flow).toBe("band");
    expect(resolveLayout(demoAd, surfaces.retailKiosk).flow).toBe("quadrant");

    // Same id as a real preset, deliberately different geometry — if this
    // resolves like broadcastLowerThird, classification is keyed off shape,
    // not off `surface.id`.
    const impostor = defineSurface({ id: "mobilePortrait", width: 2000, height: 300 });
    expect(resolveLayout(demoAd, impostor).flow).toBe("band");
  });

  it("drops only branding on a surface too small for every element at full size", () => {
    const layout = resolveLayout(demoAd, surfaces.retailKioskCompact);
    expect(layout.dropped.map((d) => d.id)).toEqual(["logo"]);
    expect(layout.elements.map((e) => e.id)).toEqual(expect.arrayContaining(["headline", "price", "cta", "product-image"]));
    expectNoOverlapsOrClipping(layout);
  });

  it("never drops the hero or primary text, even under extreme pressure", () => {
    const tiny = defineSurface({ id: "tiny", width: 90, height: 90, safeArea: { top: 2, right: 2, bottom: 2, left: 2 } });
    const layout = resolveLayout(demoAd, tiny);
    const ids = layout.elements.map((e) => e.id);
    expect(ids).toContain("headline");
    expect(ids).toContain("product-image");
    expectNoOverlapsOrClipping(layout);
  });

  it("resolves a surface nobody wrote code for, with no code changes", () => {
    const videoWall = defineSurface({ id: "video-wall", width: 3600, height: 480, viewingDistance: "far", minTextSize: 28 });
    const layout = resolveLayout(demoAd, videoWall);

    expect(layout.flow).toBe("band");
    expect(layout.dropped).toEqual([]);
    expectNoOverlapsOrClipping(layout);
    for (const el of layout.elements) {
      if (el.kind !== "image") expect(el.fontSize).toBeGreaterThanOrEqual(28);
    }
  });

  it("respects minTapTarget on touch surfaces for the CTA", () => {
    const layout = resolveLayout(demoAd, surfaces.retailKiosk);
    const cta = layout.elements.find((e) => e.id === "cta")!;
    expect(cta.width).toBeGreaterThanOrEqual(surfaces.retailKiosk.minTapTarget!);
    expect(cta.height).toBeGreaterThanOrEqual(surfaces.retailKiosk.minTapTarget!);
  });

  it("produces meaningfully different arrangements across surfaces, not a uniform scale of one layout", () => {
    const portrait = resolveLayout(demoAd, surfaces.mobilePortrait);
    const kiosk = resolveLayout(demoAd, surfaces.retailKiosk);

    const heroPortrait = portrait.elements.find((e) => e.id === "product-image")!;
    const heroKiosk = kiosk.elements.find((e) => e.id === "product-image")!;

    // A uniform scale would preserve each element's position as the same
    // *fraction* of the surface in both axes. Assert it does not: the hero
    // sits near the top in a vertical stack but pinned to a side in a
    // hero+column split, so its normalized y position differs substantially.
    const normalizedY = (el: ResolvedElement, layout: ResolvedLayout) => el.y / layout.surfaceHeight;
    expect(Math.abs(normalizedY(heroPortrait, portrait) - normalizedY(heroKiosk, kiosk))).toBeGreaterThan(0.1);
    expect(portrait.flow).not.toBe(kiosk.flow);
  });
});
