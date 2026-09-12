/**
 * Ad Spec + Surface Profile → Constraint Resolver → Resolved Layout
 *
 * This module is the resolver. It is plain, framework-agnostic TypeScript —
 * no DOM, no React — so it can run in a test, a build-time linter, or a
 * server as easily as a browser. See ARCHITECTURE.md for the full
 * step-by-step explanation; this file's comments cover the "what", that
 * document covers the "why".
 *
 * Three flows share one generic primitive (allocateAxis, from axis.ts):
 *   - stack:    tall surfaces (aspect <= 0.85). One vertical lane, every
 *               element in it.
 *   - band:     wide, short surfaces (aspect >= 2.2). One horizontal lane,
 *               every element in it.
 *   - quadrant: everything else. The hero image and a "content column"
 *               split a dominant axis; the content column is then laid out
 *               with the *same* stacking function `stack` uses, just given
 *               a narrower rect and a shorter element list.
 *
 * The classification is a continuous function of the surface's own
 * width/height — never a name or id check — so a surface nobody wrote
 * code for still lands in one of the three buckets and gets a real,
 * proportioned layout instead of a fallback.
 */

import type { AdElement, AdSpec, ElementRole } from "./spec";
import type { SurfaceProfile } from "./surfaces";
import type { DroppedElement, FlowKind, Rect, ResolvedElement, ResolvedLayout } from "./layout";
import { allocateAxis, type AxisDrop, type AxisItem } from "./axis";
import { estimateTextWidth, type TextMeasurer } from "./text-metrics";

export interface ResolveOptions {
  /** Defaults to a character-count heuristic; pass createCanvasTextMeasurer() in a browser for exact widths. */
  measureText?: TextMeasurer;
}

interface FlowResult {
  elements: ResolvedElement[];
  dropped: DroppedElement[];
  warnings: string[];
}

const LINE_HEIGHT = 1.3;

const ROLE_VISUAL_ORDER: Record<ElementRole, number> = {
  hero: 0,
  primary: 1,
  secondary: 2,
  action: 3,
  branding: 4,
};

/** Below this aspect ratio (width/height) a surface is classified "stack" — tall. */
const STACK_ASPECT_MAX = 0.85;
/** Above this aspect ratio a surface is classified "band" — wide and short. */
const BAND_ASPECT_MIN = 2.2;

export function resolveLayout(spec: AdSpec, surface: SurfaceProfile, options: ResolveOptions = {}): ResolvedLayout {
  const measureText = options.measureText ?? estimateTextWidth;
  const safeArea = surface.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };

  const contentRect: Rect = {
    x: safeArea.left,
    y: safeArea.top,
    width: Math.max(0, surface.width - safeArea.left - safeArea.right),
    height: Math.max(0, surface.height - safeArea.top - safeArea.bottom),
  };

  // A single scale reference (independent of flow) so text/branding sizing
  // reflects "how big is this surface" rather than "how much room is left
  // on whichever axis we happened to pick" — see ARCHITECTURE.md.
  const scale = Math.min(contentRect.width, contentRect.height);
  const gap = clamp(scale * 0.025, 4, 22);

  const aspect = surface.width / surface.height;
  const flow: FlowKind = aspect <= STACK_ASPECT_MAX ? "stack" : aspect >= BAND_ASPECT_MIN ? "band" : "quadrant";

  const orderedElements = [...spec.elements].sort((a, b) => ROLE_VISUAL_ORDER[a.role] - ROLE_VISUAL_ORDER[b.role]);

  const result =
    flow === "stack"
      ? stackItems(orderedElements, surface, contentRect, scale, gap, measureText)
      : flow === "band"
        ? bandItems(orderedElements, surface, contentRect, scale, gap, measureText)
        : quadrantItems(orderedElements, surface, contentRect, scale, gap, measureText);

  const { elements: guardedElements, warnings: guardWarnings } = guardBounds(result.elements, surface);

  return {
    surfaceId: surface.id,
    surfaceWidth: surface.width,
    surfaceHeight: surface.height,
    flow,
    colorScheme: surface.background === "dark" ? "dark" : "light",
    elements: guardedElements,
    dropped: result.dropped,
    warnings: [...result.warnings, ...guardWarnings],
  };
}

// ---------------------------------------------------------------------------
// Stack flow — vertical lane. Used at the top level for tall surfaces, and
// reused (with a narrower rect and a shorter element list) by quadrant flow
// for its content column.
// ---------------------------------------------------------------------------

function stackItems(
  elements: readonly AdElement[],
  surface: SurfaceProfile,
  rect: Rect,
  scale: number,
  gap: number,
  measureText: TextMeasurer,
): FlowResult {
  const axisItems: AxisItem[] = elements.map((el) => {
    const size = stackSizeSpec(el, surface, scale, rect.width, measureText);
    return { id: el.id, priority: el.priority, ideal: size.ideal, min: size.min, canDrop: el.role === "branding" };
  });

  const gapBudget = gap * Math.max(0, elements.length - 1);
  const allocation = allocateAxis(axisItems, rect.height - gapBudget);

  const survivors = elements.filter((el) => allocation.sizes.has(el.id));
  const resolved: ResolvedElement[] = [];
  let cursorY = rect.y;
  for (const el of survivors) {
    const height = allocation.sizes.get(el.id)!;
    const itemRect: Rect = { x: rect.x, y: cursorY, width: rect.width, height };
    resolved.push(placeElement(el, itemRect, surface, measureText));
    cursorY += height + gap;
  }

  return {
    elements: resolved,
    dropped: allocation.dropped.map((d) => toDroppedElement(d, elements)),
    warnings: allocation.warnings,
  };
}

function stackSizeSpec(
  el: AdElement,
  surface: SurfaceProfile,
  scale: number,
  laneWidth: number,
  measureText: TextMeasurer,
): { ideal: number; min: number } {
  switch (el.type) {
    case "text": {
      const floor = textFontFloor(el, surface);
      const roleIdealFont = roleFontSize(el.role, scale, floor);
      // A role-comfortable font size is only "ideal" if the text actually
      // fits the lane at that size — otherwise shrink toward whatever size
      // does fit (never below the floor) instead of overflowing and
      // relying on ellipsis for text that would fit fine a few px smaller.
      const widthPerPx = measureText(el.text, 100, { fontWeight: fontWeightFor(el) }) / 100;
      const fitFont = widthPerPx > 0 ? laneWidth / widthPerPx : roleIdealFont;
      const idealFont = Math.max(floor, Math.min(roleIdealFont, fitFont));
      return { ideal: idealFont * LINE_HEIGHT, min: floor * LINE_HEIGHT };
    }
    case "button": {
      const tap = surface.minTapTarget ?? 32;
      return { ideal: Math.max(tap, scale * 0.11), min: tap };
    }
    case "image": {
      if (el.role === "branding") return { ideal: scale * 0.16, min: 28 };
      return { ideal: scale * 0.5, min: Math.max(48, scale * 0.2) };
    }
    default:
      return assertNever(el);
  }
}

// ---------------------------------------------------------------------------
// Band flow — horizontal lane, mirrors stack flow with the axes swapped.
// Text/button "height" (font size) comes from the fixed cross length (the
// band is short, so height is the scarce resource that should drive font
// size); the axis allocation instead governs each element's *width*, i.e.
// whether it fits at all or truncates/drops.
// ---------------------------------------------------------------------------

function bandItems(
  elements: readonly AdElement[],
  surface: SurfaceProfile,
  rect: Rect,
  scale: number,
  gap: number,
  measureText: TextMeasurer,
): FlowResult {
  const crossHeights = new Map<string, number>(elements.map((el) => [el.id, bandCrossHeight(el, surface, scale, rect.height)]));

  const axisItems: AxisItem[] = elements.map((el) => {
    const size = bandMainAxisSpec(el, surface, scale, crossHeights.get(el.id)!, measureText);
    return { id: el.id, priority: el.priority, ideal: size.ideal, min: size.min, canDrop: el.role === "branding" };
  });

  const gapBudget = gap * Math.max(0, elements.length - 1);
  const allocation = allocateAxis(axisItems, rect.width - gapBudget);

  const survivors = elements.filter((el) => allocation.sizes.has(el.id));
  const resolved: ResolvedElement[] = [];
  let cursorX = rect.x;
  for (const el of survivors) {
    const width = allocation.sizes.get(el.id)!;
    const height = crossHeights.get(el.id)!;
    const itemRect: Rect = { x: cursorX, y: rect.y + (rect.height - height) / 2, width, height };
    resolved.push(placeElement(el, itemRect, surface, measureText));
    cursorX += width + gap;
  }

  return {
    elements: resolved,
    dropped: allocation.dropped.map((d) => toDroppedElement(d, elements)),
    warnings: allocation.warnings,
  };
}

function bandCrossHeight(el: AdElement, surface: SurfaceProfile, scale: number, laneHeight: number): number {
  switch (el.type) {
    case "text": {
      const floor = textFontFloor(el, surface);
      const fontSize = roleFontSize(el.role, scale, floor);
      return clamp(fontSize * LINE_HEIGHT, floor * LINE_HEIGHT, laneHeight);
    }
    case "button": {
      const tap = surface.minTapTarget ?? 32;
      return clamp(Math.max(tap, scale * 0.22), tap, laneHeight);
    }
    case "image":
      if (el.role === "branding") return clamp(scale * 0.3, 24, laneHeight);
      return clamp(laneHeight * 0.92, Math.max(40, scale * 0.3), laneHeight);
    default:
      return assertNever(el);
  }
}

function bandMainAxisSpec(
  el: AdElement,
  surface: SurfaceProfile,
  scale: number,
  crossHeight: number,
  measureText: TextMeasurer,
): { ideal: number; min: number } {
  switch (el.type) {
    case "text": {
      const fontSize = crossHeight / LINE_HEIGHT;
      const weight = { fontWeight: fontWeightFor(el) };
      const natural = measureText(el.text, fontSize, weight);
      const previewChars = Math.min(el.text.length, 6);
      const floorWidth = measureText(el.text.slice(0, previewChars), fontSize, weight) + fontSize;
      return { ideal: natural, min: Math.max(32, floorWidth) };
    }
    case "button": {
      const fontSize = crossHeight * 0.38;
      const natural = measureText(el.label, fontSize, { fontWeight: fontWeightFor(el) }) + fontSize * 2;
      return { ideal: natural, min: surface.minTapTarget ?? natural };
    }
    case "image": {
      const aspect = el.aspectRatio ?? 1;
      const natural = crossHeight * aspect;
      return el.role === "branding" ? { ideal: natural, min: 24 } : { ideal: natural, min: Math.max(40, scale * 0.12) };
    }
    default:
      return assertNever(el);
  }
}

// ---------------------------------------------------------------------------
// Quadrant flow — squarish surfaces. The hero image and a "content column"
// split the dominant axis (whichever of width/height is larger; ties go to
// a left/right split) via the same allocateAxis primitive, then the content
// column is laid out by stackItems — the exact function tall surfaces use
// at the top level, just handed a narrower rect and fewer elements.
// ---------------------------------------------------------------------------

function quadrantItems(
  elements: readonly AdElement[],
  surface: SurfaceProfile,
  rect: Rect,
  scale: number,
  gap: number,
  measureText: TextMeasurer,
): FlowResult {
  const hero = elements.find((el) => el.role === "hero");
  const rest = elements.filter((el) => el.role !== "hero");

  if (!hero) {
    // No hero in this spec — quadrant's split has nothing to split against, so fall back to a plain stack.
    return stackItems(elements, surface, rect, scale, gap, measureText);
  }

  const horizontal = rect.width >= rect.height;
  const dominantLen = horizontal ? rect.width : rect.height;
  const crossLen = horizontal ? rect.height : rect.width;

  const contentPriority = rest.length > 0 ? Math.min(...rest.map((el) => el.priority)) : hero.priority;

  const laneItems: AxisItem[] = [
    { id: "__hero", priority: hero.priority, ideal: dominantLen * 0.56, min: Math.max(scale * 0.22, 40), canDrop: false },
    {
      id: "__content",
      priority: contentPriority,
      ideal: dominantLen * 0.44,
      min: Math.min(dominantLen * 0.32, 210),
      canDrop: false,
    },
  ];
  const lane = allocateAxis(laneItems, dominantLen - gap);
  const heroLen = lane.sizes.get("__hero") ?? laneItems[0]!.min;
  const contentLen = lane.sizes.get("__content") ?? laneItems[1]!.min;

  const heroRect: Rect = horizontal
    ? { x: rect.x, y: rect.y, width: heroLen, height: crossLen }
    : { x: rect.x, y: rect.y, width: crossLen, height: heroLen };
  const contentRect: Rect = horizontal
    ? { x: rect.x + heroLen + gap, y: rect.y, width: contentLen, height: crossLen }
    : { x: rect.x, y: rect.y + heroLen + gap, width: crossLen, height: contentLen };

  const heroResolved = placeElement(hero, heroRect, surface, measureText);
  const content = stackItems(rest, surface, contentRect, scale, gap, measureText);

  return {
    elements: [heroResolved, ...content.elements],
    dropped: content.dropped,
    warnings: [...lane.warnings, ...content.warnings],
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function textFontFloor(el: { minFontSize?: number }, surface: SurfaceProfile): number {
  return Math.max(surface.minTextSize ?? 12, el.minFontSize ?? 12);
}

/** render-dom.tsx/render-canvas.tsx render primary text bold and buttons semi-bold — measurements must match or "fits" checks lie. */
function fontWeightFor(el: AdElement): number {
  if (el.type === "button") return 600;
  if (el.type === "text" && el.role === "primary") return 700;
  return 400;
}

/**
 * Comfortable font size for a text role, anchored to overall surface scale
 * rather than to whichever axis happens to be long — a lower third is
 * short but very wide, and text there shouldn't balloon just because
 * width is plentiful. Shared by stack and band flow so headline/price
 * read at a consistent size regardless of which flow placed them.
 */
function roleFontSize(role: ElementRole, scale: number, floor: number): number {
  const factor = role === "primary" ? 0.15 : 0.08;
  return clamp(scale * factor, floor, floor * 3.5);
}

/** Turns an element's allotted rect into positioned, type-specific output. Axis-agnostic — callers decide what the rect means. */
function placeElement(el: AdElement, itemRect: Rect, surface: SurfaceProfile, measureText: TextMeasurer): ResolvedElement {
  switch (el.type) {
    case "text": {
      const floor = textFontFloor(el, surface);
      const fontSize = Math.max(floor, itemRect.height / LINE_HEIGHT);
      const truncated = measureText(el.text, fontSize, { fontWeight: fontWeightFor(el) }) > itemRect.width;
      return { kind: "text", id: el.id, ...itemRect, fontSize, truncated };
    }
    case "button": {
      const fontSize = Math.max(surface.minTextSize ?? 12, itemRect.height * 0.38);
      const truncated = measureText(el.label, fontSize, { fontWeight: fontWeightFor(el) }) > itemRect.width;
      return { kind: "button", id: el.id, ...itemRect, fontSize, truncated };
    }
    case "image": {
      const fitted = fitAspect(itemRect, el.aspectRatio);
      return { kind: "image", id: el.id, ...fitted };
    }
    default:
      return assertNever(el);
  }
}

/** Centers the largest rect matching `aspectRatio` inside `rect` (CSS object-fit: contain). No-op if aspectRatio is unset. */
function fitAspect(rect: Rect, aspectRatio: number | undefined): Rect {
  if (!aspectRatio || rect.width <= 0 || rect.height <= 0) return rect;

  const rectAspect = rect.width / rect.height;
  if (rectAspect > aspectRatio) {
    const width = rect.height * aspectRatio;
    return { x: rect.x + (rect.width - width) / 2, y: rect.y, width, height: rect.height };
  }
  const height = rect.width / aspectRatio;
  return { x: rect.x, y: rect.y + (rect.height - height) / 2, width: rect.width, height };
}

function toDroppedElement(drop: AxisDrop, elements: readonly AdElement[]): DroppedElement {
  const el = elements.find((e) => e.id === drop.id);
  const label = el ? `${el.role} element "${el.id}"` : `element "${drop.id}"`;
  return { id: drop.id, reason: `${label} dropped — ${drop.reason}` };
}

/**
 * Final defensive pass: guarantees every element's rect lies within the
 * surface, no matter how pathological the input. Every flow above already
 * places elements this way by construction (sequential lanes never
 * overlap; quadrant's two regions are disjoint by construction) — this is
 * a safety net for the last-resort clamp in axis.ts, not part of the
 * "real" algorithm.
 */
function guardBounds(elements: ResolvedElement[], surface: SurfaceProfile): { elements: ResolvedElement[]; warnings: string[] } {
  const warnings: string[] = [];

  const clamped = elements.map((el) => {
    let { x, y, width, height } = el;
    let changed = false;

    if (width > surface.width) {
      width = surface.width;
      changed = true;
    }
    if (height > surface.height) {
      height = surface.height;
      changed = true;
    }
    if (x < 0) {
      x = 0;
      changed = true;
    }
    if (y < 0) {
      y = 0;
      changed = true;
    }
    if (x + width > surface.width) {
      x = Math.max(0, surface.width - width);
      changed = true;
    }
    if (y + height > surface.height) {
      y = Math.max(0, surface.height - height);
      changed = true;
    }

    if (changed) {
      warnings.push(`Element "${el.id}" was clamped to stay within the ${surface.width}x${surface.height} surface bounds.`);
    }
    return { ...el, x, y, width, height };
  });

  return { elements: clamped, warnings };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertNever(x: never): never {
  throw new Error(`resolver.ts: unhandled element variant ${JSON.stringify(x)}`);
}
