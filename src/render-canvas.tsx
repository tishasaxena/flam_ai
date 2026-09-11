/**
 * Bonus: a second renderer backed by Canvas instead of DOM, sharing the
 * exact same ResolvedLayout produced by resolver.ts. Nothing in resolver.ts
 * changed to support this — proof that a new renderer doesn't touch the
 * resolution algorithm.
 */
import { useEffect, useRef } from "react";
import type { AdSpec } from "./spec";
import type { ResolvedLayout } from "./layout";

const ROLE_COLORS: Record<string, string> = {
  hero: "#c7d2fe",
  primary: "#0f172a",
  secondary: "#475569",
  action: "#4f46e5",
  branding: "#94a3b8",
};

export function renderToCanvas(ctx: CanvasRenderingContext2D, spec: AdSpec, layout: ResolvedLayout): void {
  const byId = new Map(spec.elements.map((el) => [el.id, el] as const));

  ctx.clearRect(0, 0, layout.surfaceWidth, layout.surfaceHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.surfaceWidth, layout.surfaceHeight);

  for (const resolved of layout.elements) {
    const source = byId.get(resolved.id);
    if (!source) continue;

    if (resolved.kind === "image") {
      ctx.fillStyle = ROLE_COLORS[source.role] ?? "#e2e8f0";
      roundRect(ctx, resolved.x, resolved.y, resolved.width, resolved.height, 6);
      ctx.fill();
      if (source.type === "image") {
        ctx.fillStyle = "#1e293b";
        ctx.font = `500 11px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(source.alt, resolved.x + resolved.width / 2, resolved.y + resolved.height / 2, resolved.width - 8);
      }
      continue;
    }

    if (resolved.kind === "button" && source.type === "button") {
      ctx.fillStyle = ROLE_COLORS.action ?? "#4f46e5";
      roundRect(ctx, resolved.x, resolved.y, resolved.width, resolved.height, Math.min(10, resolved.height / 2));
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 ${resolved.fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(source.label, resolved.x + resolved.width / 2, resolved.y + resolved.height / 2, resolved.width - 8);
      continue;
    }

    if (resolved.kind === "text" && source.type === "text") {
      ctx.fillStyle = ROLE_COLORS[source.role] ?? "#0f172a";
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
