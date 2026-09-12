/**
 * ResolvedLayout (geometry) + AdSpec (content) → DOM/CSS.
 *
 * This is one of two renderers (see render-canvas.tsx for the other) and
 * neither one touches resolver.ts's internals — both just read the public
 * ResolvedLayout shape from layout.ts. A third renderer (e.g. React Native,
 * or server-side to static HTML for an email) could be added the same way.
 *
 * Color is the one thing this renderer decides *without* re-deriving it:
 * `layout.colorScheme` says which of contrast.ts's two WCAG-checked
 * palettes to use, so the same accessibility decision holds whether this
 * renders to DOM or Canvas.
 */
import type { CSSProperties } from "react";
import type { AdElement, AdSpec } from "./spec";
import type { ResolvedElement, ResolvedLayout } from "./layout";
import { PALETTES, type SchemePalette } from "./contrast";

export interface AdRendererProps {
  spec: AdSpec;
  layout: ResolvedLayout;
  className?: string;
}

export function AdRenderer({ spec, layout, className }: AdRendererProps) {
  const byId = new Map(spec.elements.map((el) => [el.id, el] as const));
  const palette = PALETTES[layout.colorScheme];

  return (
    <div
      className={className ? `ad-surface ${className}` : "ad-surface"}
      style={{ width: layout.surfaceWidth, height: layout.surfaceHeight, background: palette.surfaceBg }}
    >
      {layout.elements.map((resolved) => {
        const source = byId.get(resolved.id);
        if (!source) return null;
        return <RenderedElement key={resolved.id} source={source} resolved={resolved} palette={palette} />;
      })}
    </div>
  );
}

function RenderedElement({
  source,
  resolved,
  palette,
}: {
  source: AdElement;
  resolved: ResolvedElement;
  palette: SchemePalette;
}) {
  const boxStyle: CSSProperties = {
    position: "absolute",
    left: resolved.x,
    top: resolved.y,
    width: resolved.width,
    height: resolved.height,
  };

  if (resolved.kind === "text" && source.type === "text") {
    return (
      <div
        className="ad-el ad-el--text"
        data-role={source.role}
        style={{
          ...boxStyle,
          fontSize: resolved.fontSize,
          lineHeight: 1.3,
          fontWeight: source.role === "primary" ? 700 : 400,
          color: source.role === "primary" ? palette.primaryText : palette.secondaryText,
          whiteSpace: resolved.truncated ? "nowrap" : "normal",
          textOverflow: resolved.truncated ? "ellipsis" : undefined,
        }}
      >
        {source.text}
      </div>
    );
  }

  if (resolved.kind === "button" && source.type === "button") {
    return (
      <button
        type="button"
        className="ad-el ad-el--button"
        data-role={source.role}
        style={{ ...boxStyle, fontSize: resolved.fontSize, background: palette.buttonBg, color: palette.buttonText }}
      >
        <span className="ad-el__button-label">{source.label}</span>
      </button>
    );
  }

  if (resolved.kind === "image" && source.type === "image") {
    // Branding's box color follows the resolved accessibility scheme; the
    // hero's decorative placeholder gradient (render-dom's stand-in for a
    // real product photo) is fixed regardless of scheme, so its label uses
    // a fixed, always-legible tone to match rather than the scheme's text
    // color — a real photo wouldn't need text color logic here at all.
    const imageStyle: CSSProperties =
      source.role === "branding" ? { background: palette.brandingBg, color: palette.brandingText } : { color: "#3c3f66" };
    return (
      <div className="ad-el ad-el--image" data-role={source.role} style={{ ...boxStyle, ...imageStyle }}>
        {source.src ? (
          <img className="ad-el__img" src={source.src} alt={source.alt} />
        ) : (
          <span className="ad-el__placeholder-label">{source.alt}</span>
        )}
      </div>
    );
  }

  return null;
}
