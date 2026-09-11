/**
 * Text sizing is the one place a layout engine genuinely benefits from
 * real measurement — but resolver.ts is meant to stay usable outside a
 * browser (unit tests, SSR, a design-time linter), so it depends only on
 * this `TextMeasurer` function type plus the pure-arithmetic default
 * below. The demo swaps in `createCanvasTextMeasurer()` for pixel-accurate
 * widths — see App.tsx. Weight matters here because render-dom.tsx renders
 * primary text and button labels bold/semi-bold, which measure wider than
 * regular weight at the same font size.
 */

export interface TextMeasureOptions {
  fontFamily?: string;
  fontWeight?: number;
}

export type TextMeasurer = (text: string, fontSizePx: number, options?: TextMeasureOptions) => number;

const AVERAGE_CHAR_WIDTH_FACTOR = 0.56;
const BOLD_WIDTH_FACTOR = 1.08;

/** Works anywhere, no DOM required. A rough estimate, not real font metrics. */
export const estimateTextWidth: TextMeasurer = (text, fontSizePx, options) => {
  const bold = (options?.fontWeight ?? 400) >= 600;
  return text.length * fontSizePx * AVERAGE_CHAR_WIDTH_FACTOR * (bold ? BOLD_WIDTH_FACTOR : 1);
};

/** Exact widths for the font actually rendering in the browser, via an offscreen canvas. */
export function createCanvasTextMeasurer(defaultFontFamily = "system-ui, sans-serif"): TextMeasurer {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return estimateTextWidth;

  return (text, fontSizePx, options) => {
    const family = options?.fontFamily ?? defaultFontFamily;
    const weight = options?.fontWeight ?? 400;
    ctx.font = `${weight} ${fontSizePx}px ${family}`;
    return ctx.measureText(text).width;
  };
}
