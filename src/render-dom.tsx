/**
 * ResolvedLayout (geometry) + AdSpec (content) → DOM/CSS.
 *
 * This is one of two renderers (see render-canvas.tsx for the other) and
 * neither one touches resolver.ts's internals — both just read the public
 * ResolvedLayout shape from layout.ts. A third renderer (e.g. React Native,
 * or server-side to static HTML for an email) could be added the same way.
 */
import type { CSSProperties } from "react";
import type { AdElement, AdSpec } from "./spec";
import type { ResolvedElement, ResolvedLayout } from "./layout";

export interface AdRendererProps {
  spec: AdSpec;
  layout: ResolvedLayout;
  className?: string;
}

export function AdRenderer({ spec, layout, className }: AdRendererProps) {
  const byId = new Map(spec.elements.map((el) => [el.id, el] as const));

  return (
    <div
      className={className ? `ad-surface ${className}` : "ad-surface"}
      style={{ width: layout.surfaceWidth, height: layout.surfaceHeight }}
    >
      {layout.elements.map((resolved) => {
        const source = byId.get(resolved.id);
        if (!source) return null;
        return <RenderedElement key={resolved.id} source={source} resolved={resolved} />;
      })}
    </div>
  );
}

function RenderedElement({ source, resolved }: { source: AdElement; resolved: ResolvedElement }) {
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
        style={{ ...boxStyle, fontSize: resolved.fontSize }}
      >
        <span className="ad-el__button-label">{source.label}</span>
      </button>
    );
  }

  if (resolved.kind === "image" && source.type === "image") {
    return (
      <div className="ad-el ad-el--image" data-role={source.role} style={boxStyle}>
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
