/**
 * The resolved layout output — pure geometry, no content. A renderer pairs
 * this with the original AdSpec (by element id) to know *what* to draw;
 * this module only says *where* and *how big*. Keeping content out of the
 * output is what lets render-dom.tsx and render-canvas.tsx share it as-is.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ResolvedElementBase extends Rect {
  id: string;
}

export interface ResolvedTextLayout extends ResolvedElementBase {
  kind: "text";
  fontSize: number;
  /** True when the resolved box is narrower than the text's natural width at fontSize — the renderer should ellipsize. */
  truncated: boolean;
}

export interface ResolvedImageLayout extends ResolvedElementBase {
  kind: "image";
}

export interface ResolvedButtonLayout extends ResolvedElementBase {
  kind: "button";
  fontSize: number;
  truncated: boolean;
}

export type ResolvedElement = ResolvedTextLayout | ResolvedImageLayout | ResolvedButtonLayout;

export interface DroppedElement {
  id: string;
  reason: string;
}

export type FlowKind = "stack" | "band" | "quadrant";

export interface ResolvedLayout {
  surfaceId: string;
  surfaceWidth: number;
  surfaceHeight: number;
  /** Which structural arrangement the resolver chose for this surface's geometry. Purely informational — renderers don't need to branch on it. */
  flow: FlowKind;
  /** Visible elements only — a renderer can map over this with no filtering. */
  elements: ResolvedElement[];
  /** Elements the resolver removed entirely to satisfy higher-priority ones, with a human-readable reason. */
  dropped: DroppedElement[];
  /** Non-fatal problems (e.g. a surface too small for its required content) the resolver recovered from. */
  warnings: string[];
}
