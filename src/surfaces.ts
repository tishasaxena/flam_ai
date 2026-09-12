/**
 * Surface PROFILES — real physical/interaction constraints, not just a
 * width and height. The resolver treats these as hard constraints, never
 * as a key to look up a canned layout.
 */

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type ViewingDistance = "close" | "normal" | "far";

export interface SurfaceProfile {
  id: string;
  width: number;
  height: number;
  /** Inset from the edges that must stay clear of content (bezels, overscan, print trim). */
  safeArea?: SafeArea;
  /** Smallest side (px) any interactive element may have. Required whenever touchOnly is true. */
  minTapTarget?: number;
  /** True for surfaces with no pointer/keyboard fallback — every action must be reachable by touch. */
  touchOnly?: boolean;
  /** Hard floor (px) for any rendered text, independent of any element-level minFontSize. */
  minTextSize?: number;
  /** How far the audience typically stands from the surface. "far" implies minTextSize should be set. */
  viewingDistance?: ViewingDistance;
  /** Non-printing bleed margin, for print surfaces (extends beyond width/height; not yet consumed by the resolver — see README limitations). */
  bleed?: number;
  /**
   * What this surface composites over — a broadcast lower third sits on
   * top of dark video far more often than white. Defaults to "light".
   * The resolver turns this into `ResolvedLayout.colorScheme`; every color
   * pairing either scheme uses is checked against WCAG AA in
   * contrast.test.ts, not just eyeballed. See contrast.ts.
   */
  background?: "light" | "dark";
}

/**
 * Validates a surface profile at the boundary where it's most likely to be
 * authored as data rather than a TS literal (a venue-management UI, a
 * per-device config file). Catches combinations that are individually
 * well-typed but physically nonsensical together — the runtime analogue of
 * the compile-time checks `AdElement`'s discriminated union gives `spec.ts`.
 */
export function defineSurface(profile: SurfaceProfile): SurfaceProfile {
  const { id, width, height, safeArea, minTapTarget, touchOnly, minTextSize, viewingDistance } = profile;

  if (!id) throw new Error("defineSurface: profile needs a non-empty id.");
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`defineSurface "${id}": width must be a positive number.`);
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`defineSurface "${id}": height must be a positive number.`);
  }

  if (safeArea) {
    const { top, right, bottom, left } = safeArea;
    if ([top, right, bottom, left].some((v) => !Number.isFinite(v) || v < 0)) {
      throw new Error(`defineSurface "${id}": safeArea insets must all be >= 0.`);
    }
    if (left + right >= width || top + bottom >= height) {
      throw new Error(`defineSurface "${id}": safeArea insets leave no usable area inside ${width}x${height}.`);
    }
  }

  if (touchOnly && !minTapTarget) {
    throw new Error(`defineSurface "${id}": touchOnly surfaces must declare minTapTarget.`);
  }
  if (minTapTarget !== undefined) {
    if (minTapTarget <= 0) throw new Error(`defineSurface "${id}": minTapTarget must be positive.`);
    if (minTapTarget > Math.min(width, height)) {
      throw new Error(`defineSurface "${id}": minTapTarget (${minTapTarget}) can't exceed the surface's shorter side (${Math.min(width, height)}).`);
    }
  }

  if (viewingDistance === "far" && !minTextSize) {
    throw new Error(`defineSurface "${id}": viewingDistance "far" needs an explicit minTextSize.`);
  }
  if (minTextSize !== undefined && minTextSize <= 0) {
    throw new Error(`defineSurface "${id}": minTextSize must be positive.`);
  }

  return Object.freeze({ ...profile });
}

export const surfaces = {
  mobilePortrait: defineSurface({
    id: "mobilePortrait",
    width: 320,
    height: 480,
    safeArea: { top: 20, right: 12, bottom: 24, left: 12 },
    minTapTarget: 44,
    touchOnly: true,
  }),
  mobileLandscape: defineSurface({
    id: "mobileLandscape",
    width: 480,
    height: 320,
    safeArea: { top: 12, right: 28, bottom: 12, left: 28 },
    minTapTarget: 44,
    touchOnly: true,
  }),
  broadcastLowerThird: defineSurface({
    id: "broadcastLowerThird",
    width: 1920,
    height: 250,
    safeArea: { top: 8, right: 60, bottom: 8, left: 60 },
    viewingDistance: "far",
    minTextSize: 32,
    background: "dark",
  }),
  retailKiosk: defineSurface({
    id: "retailKiosk",
    width: 1080,
    height: 1080,
    safeArea: { top: 32, right: 32, bottom: 32, left: 32 },
    minTapTarget: 60,
    touchOnly: true,
  }),
  retailKioskCompact: defineSurface({
    id: "retailKioskCompact",
    width: 130,
    height: 130,
    safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
    minTapTarget: 60,
    touchOnly: true,
  }),
} satisfies Record<string, SurfaceProfile>;

export type SurfaceId = keyof typeof surfaces;

export const SURFACE_LABELS: Record<SurfaceId, string> = {
  mobilePortrait: "Mobile — Portrait",
  mobileLandscape: "Mobile — Landscape",
  broadcastLowerThird: "Broadcast Lower Third",
  retailKiosk: "Retail Kiosk (square)",
  retailKioskCompact: "Retail Kiosk — Compact (degradation demo)",
};
