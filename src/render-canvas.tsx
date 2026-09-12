/**
 * Bonus: a second renderer backed by Canvas instead of DOM, sharing the
 * exact same ResolvedLayout produced by resolver.ts. Nothing in resolver.ts
 * changed to support this — proof that a new renderer doesn't touch the
 * resolution algorithm. Colors come from the same contrast.ts palettes
 * render-dom.tsx uses, keyed by `layout.colorScheme` — the accessibility
 * decision is made once, by the resolver, and both renderers just read it.
 */
import { useEffect, useRef } from "react";
import type { AdSpec } from "./spec";
import type { ResolvedLayout } from "./layout";
import { PALETTES } from "./contrast";

/** Hero's placeholder is a stand-in for a real photo — fixed regardless of scheme, like render-dom's version. */
const HERO_PLACEHOLDER_BG = "#dbe0fa";
const HERO_PLACEHOLDER_TEXT = "#3c3f66";

export function renderToCanvas(ctx: CanvasRenderingContext2D, spec: AdSpec, layout: ResolvedLayout): void {
  const byId = new Map(spec.elements.map((el) => [el.id, el] as const));
  const palette = PALETTES[layout.colorScheme];

  ctx.clearRect(0, 0, layout.surfaceWidth, layout.surfaceHeight);
  ctx.fillStyle = palette.surfaceBg;
  ctx.fillRect(0, 0, layout.surfaceWidth, layout.surfaceHeight);

  for (const resolved of layout.elements) {
    const source = byId.get(resolved.id);
    if (!source) continue;

    if (resolved.kind === "image" && source.type === "image") {
      const isBranding = source.role === "branding";
      ctx.fillStyle = isBranding ? palette.brandingBg : HERO_PLACEHOLDER_BG;
      roundRect(ctx, resolved.x, resolved.y, resolved.width, resolved.height, 6);
      ctx.fill();
      ctx.fillStyle = isBranding ? palette.brandingText : HERO_PLACEHOLDER_TEXT;
      ctx.font = `500 11px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(source.alt, resolved.x + resolved.width / 2, resolved.y + resolved.height / 2, resolved.width - 8);
      continue;
    }

    if (resolved.kind === "button" && source.type === "button") {
      ctx.fillStyle = palette.buttonBg;
      roundRect(ctx, resolved.x, resolved.y, resolved.width, resolved.height, Math.min(10, resolved.height / 2));
      ctx.fill();
      ctx.fillStyle = palette.buttonText;
      ctx.font = `600 ${resolved.fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(source.label, resolved.x + resolved.width / 2, resolved.y + resolved.height / 2, resolved.width - 8);
      continue;
    }

    if (resolved.kind === "text" && source.type === "text") {
      ctx.fillStyle = source.role === "primary" ? palette.primaryText : palette.secondaryText;
      ctx.font = `${source.role === "primary" ? 700 : 400} ${resolved.fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(source.text, resolved.x, resolved.y, resolved.width);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function CanvasAdRenderer({ spec, layout }: { spec: AdSpec; layout: ResolvedLayout }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    renderToCanvas(ctx, spec, layout);
  }, [spec, layout]);

  return (
    <canvas
      ref={canvasRef}
      width={layout.surfaceWidth}
      height={layout.surfaceHeight}
      className="ad-surface ad-surface--canvas"
    />
  );
}
