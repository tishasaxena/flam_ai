/**
 * Ad content & layout INTENT, defined once, independent of any surface.
 * See resolver.ts for how a spec is turned into pixels for a given surface.
 */

export const ELEMENT_ROLES = ["hero", "primary", "secondary", "action", "branding"] as const;
export type ElementRole = (typeof ELEMENT_ROLES)[number];

export const ELEMENT_TYPES = ["text", "image", "button"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

interface AdElementBase {
  /** Unique within the spec. */
  id: string;
  role: ElementRole;
  /**
   * Importance tier: 1 = most important, compromised last. Larger numbers
   * degrade first — shrink toward their floor, or (branding only) drop
   * entirely — when a surface can't fit everything. See resolver.ts.
   */
  priority: number;
}

export interface TextElement extends AdElementBase {
  type: "text";
  text: string;
  /** Hard floor in px. The effective floor is max(this, surface.minTextSize). */
  minFontSize?: number;
}

export interface ImageElement extends AdElementBase {
  type: "image";
  alt: string;
  src?: string;
  /** width / height. When set, the resolver preserves it (letterboxed) instead of stretching to fill its box. */
  aspectRatio?: number;
}

export interface ButtonElement extends AdElementBase {
  type: "button";
  label: string;
}

/**
 * A discriminated union on `type` — assigning a `label` to a "text" element,
 * or a `role` outside ElementRole, is a compile-time error, not something
 * that surfaces later at render time.
 */
export type AdElement = TextElement | ImageElement | ButtonElement;

export interface AdSpec {
  id: string;
  elements: readonly AdElement[];
}

export interface DefineAdInput {
  id?: string;
  elements: readonly AdElement[];
}

const ROLE_SET: ReadonlySet<string> = new Set(ELEMENT_ROLES);
const TYPE_SET: ReadonlySet<string> = new Set(ELEMENT_TYPES);

/**
 * Validates and freezes an ad spec. TypeScript already rejects unknown
 * `role`/`type` literals and mismatched type-specific fields (e.g. a
 * "text" element with a `label`) at compile time. This runtime pass exists
 * because real ad content is often assembled from JSON — a CMS or ad-server
 * payload — where those literal types have already erased, so a bad role
 * or a duplicate id needs to fail loudly here instead of silently producing
 * an unresolvable layout deep inside the resolver.
 */
export function defineAd(input: DefineAdInput): AdSpec {
  if (input.elements.length === 0) {
    throw new Error("defineAd: spec must contain at least one element.");
  }

  const seenIds = new Set<string>();
  for (const el of input.elements) {
    if (!el.id || typeof el.id !== "string") {
      throw new Error(`defineAd: every element needs a non-empty string id (got ${JSON.stringify(el.id)}).`);
    }
    if (seenIds.has(el.id)) {
      throw new Error(`defineAd: duplicate element id "${el.id}".`);
    }
    seenIds.add(el.id);

    if (!TYPE_SET.has(el.type)) {
      throw new Error(`defineAd: element "${el.id}" has unknown type "${el.type}".`);
    }
    if (!ROLE_SET.has(el.role)) {
      throw new Error(`defineAd: element "${el.id}" has unknown role "${el.role}".`);
    }
    if (!Number.isFinite(el.priority) || el.priority < 1) {
      throw new Error(`defineAd: element "${el.id}" has invalid priority ${el.priority} (must be a positive number, 1 = most important).`);
    }

    if (el.type === "text" && !el.text) {
      throw new Error(`defineAd: text element "${el.id}" is missing "text".`);
    }
    if (el.type === "image" && !el.alt) {
      throw new Error(`defineAd: image element "${el.id}" is missing "alt".`);
    }
    if (el.type === "button" && !el.label) {
      throw new Error(`defineAd: button element "${el.id}" is missing "label".`);
    }
  }

  return Object.freeze({ id: input.id ?? "ad", elements: Object.freeze([...input.elements]) });
}
