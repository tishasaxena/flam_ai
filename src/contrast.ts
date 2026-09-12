/**
 * WCAG 2.x contrast math, plus the two color schemes the renderers pick
 * from. This is the "basic accessibility as a first-class constraint type"
 * bonus: a surface declares what it composites over (`background: "light" |
 * "dark"` on SurfaceProfile — a broadcast lower third over dark video is a
 * real example), the resolver turns that into a `colorScheme` on the
 * resolved layout, and every color pairing a renderer draws with is one of
 * the two palettes below — each checked against WCAG AA by
 * `resolver.test.ts`, not just eyeballed.
 *
 * This lives outside resolver.ts on purpose: geometry (what resolver.ts
 * decides) and color (what this module decides) are independent axes.
 * layout.ts's ResolvedLayout carries the *decision* (`colorScheme`) so a
 * renderer never has to re-derive it, but the actual hex values stay here,
 * next to the math that justifies them.
 */

export type ColorScheme = "light" | "dark";

const WCAG_AA_TEXT = 4.5;
const WCAG_AA_LARGE_TEXT = 3.0;

export interface SchemePalette {
  surfaceBg: string;
  primaryText: string;
  secondaryText: string;
  buttonBg: string;
  buttonText: string;
  brandingBg: string;
  brandingText: string;
}

export const PALETTES: Record<ColorScheme, SchemePalette> = {
  light: {
    surfaceBg: "#ffffff",
    primaryText: "#121420",
    secondaryText: "#4b4f66",
    buttonBg: "#4338ca",
    buttonText: "#ffffff",
    brandingBg: "#e7e8f0",
    brandingText: "#3c3f57",
  },
  dark: {
    surfaceBg: "#0b0d17",
    primaryText: "#f5f6fb",
    secondaryText: "#c2c5db",
    buttonBg: "#a5a0f5",
    buttonText: "#14152b",
    brandingBg: "#232640",
    brandingText: "#d7d9ea",
  },
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").slice(0, 6);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio between two colors, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsAA(a: string, b: string, large = false): boolean {
  return contrastRatio(a, b) >= (large ? WCAG_AA_LARGE_TEXT : WCAG_AA_TEXT);
}
