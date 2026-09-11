import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import "./App.css";
import { demoAd } from "./demo-ad";
import { resolveLayout } from "./resolver";
import { AdRenderer } from "./render-dom";
import { CanvasAdRenderer } from "./render-canvas";
import { createCanvasTextMeasurer } from "./text-metrics";
import { defineSurface, surfaces, SURFACE_LABELS, type SurfaceId, type SurfaceProfile, type ViewingDistance } from "./surfaces";
import type { ResolvedElement } from "./layout";

type SurfacePickerId = SurfaceId | "custom";
type RendererKind = "dom" | "canvas";

const PRESET_IDS: SurfaceId[] = ["mobilePortrait", "mobileLandscape", "broadcastLowerThird", "retailKiosk", "retailKioskCompact"];

const PREVIEW_MAX_WIDTH = 460;
const PREVIEW_MAX_HEIGHT = 420;

/**
 * The preview card's actual available width, live — not a fixed constant.
 * On a narrow viewport (phone-width browser, or this demo embedded in a
 * tight column) a hardcoded 460px cap would overflow the page horizontally;
 * measuring the container makes the *preview chrome* responsive. This has
 * nothing to do with the layout engine's own adaptation — resolveLayout()
 * always resolves at the surface's true native pixel size regardless of
 * how small the on-screen preview is scaled to fit.
 */
function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(PREVIEW_MAX_WIDTH);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

interface CustomSurfaceForm {
  width: string;
  height: string;
  touchOnly: boolean;
  minTapTarget: string;
  minTextSize: string;
  viewingDistance: "" | ViewingDistance;
  safeAreaTop: string;
  safeAreaRight: string;
  safeAreaBottom: string;
  safeAreaLeft: string;
}

const DEFAULT_CUSTOM_FORM: CustomSurfaceForm = {
  width: "800",
  height: "1280",
  touchOnly: true,
  minTapTarget: "48",
  minTextSize: "",
  viewingDistance: "",
  safeAreaTop: "16",
  safeAreaRight: "16",
  safeAreaBottom: "16",
  safeAreaLeft: "16",
};

function buildCustomSurface(form: CustomSurfaceForm): SurfaceProfile {
  return defineSurface({
    id: "custom",
    width: Number(form.width),
    height: Number(form.height),
    safeArea: {
      top: Number(form.safeAreaTop) || 0,
      right: Number(form.safeAreaRight) || 0,
      bottom: Number(form.safeAreaBottom) || 0,
      left: Number(form.safeAreaLeft) || 0,
    },
    touchOnly: form.touchOnly,
    minTapTarget: form.minTapTarget ? Number(form.minTapTarget) : undefined,
    minTextSize: form.minTextSize ? Number(form.minTextSize) : undefined,
    viewingDistance: form.viewingDistance || undefined,
  });
}

export default function App() {
  const [surfaceId, setSurfaceId] = useState<SurfacePickerId>("mobilePortrait");
  const [renderer, setRenderer] = useState<RendererKind>("dom");
  const [customForm, setCustomForm] = useState<CustomSurfaceForm>(DEFAULT_CUSTOM_FORM);
  const [customSurface, setCustomSurface] = useState<SurfaceProfile | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [previewRef, previewContainerWidth] = useContainerWidth<HTMLDivElement>();

  const measureText = useMemo(() => createCanvasTextMeasurer(), []);

  const activeSurface: SurfaceProfile | null = surfaceId === "custom" ? customSurface : surfaces[surfaceId];

  const layout = useMemo(() => {
    if (!activeSurface) return null;
    return resolveLayout(demoAd, activeSurface, { measureText });
  }, [activeSurface, measureText]);

  function updateCustomForm<K extends keyof CustomSurfaceForm>(key: K, value: CustomSurfaceForm[K]) {
    setCustomForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyCustomSurface(e: FormEvent) {
    e.preventDefault();
    try {
      setCustomSurface(buildCustomSurface(customForm));
      setCustomError(null);
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : String(err));
    }
  }

  const previewMaxWidth = Math.max(160, Math.min(PREVIEW_MAX_WIDTH, previewContainerWidth || PREVIEW_MAX_WIDTH));
  const displayScale = activeSurface
    ? Math.min(1, previewMaxWidth / activeSurface.width, PREVIEW_MAX_HEIGHT / activeSurface.height)
    : 1;

  return (
    <div className="app">
      <header className="app__header">
        <p className="app__eyebrow">
          <span className="app__eyebrow-dot" />
          Constraint-resolved, not breakpoint-switched
        </p>
        <h1>
          Adaptive Ad <span>Layout Engine</span>
        </h1>
        <p>
          One <code>adSpec</code> (headline, hero image, price, CTA, logo) resolved live against different surface
          profiles. The arrangement below is computed by <code>resolveLayout()</code> from each surface's actual
          width, height, and hard constraints — nothing is a hardcoded per-surface layout.
        </p>
      </header>

      <div className="app__layout">
        <aside className="app__controls">
          <section>
            <h2>
              <IconGrid /> Surface
            </h2>
            <div className="surface-picker">
              {PRESET_IDS.map((id) => {
                const surface = surfaces[id];
                return (
                  <button
                    key={id}
                    type="button"
                    className={surfaceId === id ? "surface-card is-active" : "surface-card"}
                    onClick={() => setSurfaceId(id)}
                    aria-pressed={surfaceId === id}
                  >
                    <AspectGlyph width={surface.width} height={surface.height} />
                    <span className="surface-card__meta">
                      <span className="surface-card__label">{SURFACE_LABELS[id]}</span>
                      <span className="surface-card__dims">
                        {surface.width}×{surface.height}
                      </span>
                    </span>
                    {surfaceId === id && <CheckIcon className="surface-card__check" />}
                  </button>
                );
              })}
              <button
                type="button"
                className={surfaceId === "custom" ? "surface-card is-active" : "surface-card"}
                onClick={() => setSurfaceId("custom")}
                aria-pressed={surfaceId === "custom"}
              >
                <span className="surface-card__glyph">
                  <PlusIcon />
                </span>
                <span className="surface-card__meta">
                  <span className="surface-card__label">Custom…</span>
                  <span className="surface-card__dims">describe your own</span>
                </span>
                {surfaceId === "custom" && <CheckIcon className="surface-card__check" />}
              </button>
            </div>
          </section>

          {surfaceId === "custom" && (
            <section>
              <h2>
                <IconSliders /> Custom surface profile
              </h2>
              <p className="app__hint" style={{ marginBottom: 10 }}>
                Describe a surface nobody wrote code for and resolve the same spec against it — this is the "5th
                unknown surface" case: no code path changes, only the numbers below do.
              </p>
              <form className="custom-surface-form" onSubmit={applyCustomSurface}>
                <div className="custom-surface-form__grid">
                  <label>
                    Width (px)
                    <input value={customForm.width} onChange={(e) => updateCustomForm("width", e.target.value)} inputMode="numeric" />
                  </label>
                  <label>
                    Height (px)
                    <input value={customForm.height} onChange={(e) => updateCustomForm("height", e.target.value)} inputMode="numeric" />
                  </label>
                  <label className="custom-surface-form__checkbox">
                    <input
                      type="checkbox"
                      checked={customForm.touchOnly}
                      onChange={(e) => updateCustomForm("touchOnly", e.target.checked)}
                    />
                    Touch only
                  </label>
                  <label>
                    Min tap target (px)
                    <input
                      value={customForm.minTapTarget}
                      onChange={(e) => updateCustomForm("minTapTarget", e.target.value)}
                      inputMode="numeric"
                      placeholder="e.g. 44"
                    />
                  </label>
                  <label>
                    Min text size (px)
                    <input
                      value={customForm.minTextSize}
                      onChange={(e) => updateCustomForm("minTextSize", e.target.value)}
                      inputMode="numeric"
                      placeholder="optional"
                    />
                  </label>
                  <label>
                    Viewing distance
                    <select
                      value={customForm.viewingDistance}
                      onChange={(e) => updateCustomForm("viewingDistance", e.target.value as CustomSurfaceForm["viewingDistance"])}
                    >
                      <option value="">(unset)</option>
                      <option value="close">close</option>
                      <option value="normal">normal</option>
                      <option value="far">far</option>
                    </select>
                  </label>
                </div>

                <details className="custom-surface-form__advanced">
                  <summary>Safe area insets</summary>
                  <div className="custom-surface-form__grid">
                    <label>
                      Top
                      <input value={customForm.safeAreaTop} onChange={(e) => updateCustomForm("safeAreaTop", e.target.value)} inputMode="numeric" />
                    </label>
                    <label>
                      Right
                      <input
                        value={customForm.safeAreaRight}
                        onChange={(e) => updateCustomForm("safeAreaRight", e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label>
                      Bottom
                      <input
                        value={customForm.safeAreaBottom}
                        onChange={(e) => updateCustomForm("safeAreaBottom", e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label>
                      Left
                      <input
                        value={customForm.safeAreaLeft}
                        onChange={(e) => updateCustomForm("safeAreaLeft", e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                </details>

                {customError && <p className="custom-surface-form__error">{customError}</p>}
                <button type="submit" className="custom-surface-form__submit">
                  Resolve this surface
                </button>
              </form>
            </section>
          )}

          <section>
            <h2>
              <IconLayers /> Renderer
            </h2>
            <div className="renderer-toggle">
              <button type="button" className={renderer === "dom" ? "is-active" : ""} onClick={() => setRenderer("dom")}>
                <IconCode /> DOM
              </button>
              <button type="button" className={renderer === "canvas" ? "is-active" : ""} onClick={() => setRenderer("canvas")}>
                <IconCanvas /> Canvas
              </button>
            </div>
          </section>
        </aside>

        <main className="app__preview">
          {!activeSurface || !layout ? (
            <p className="app__hint">Fill in the custom surface form and click "Resolve this surface".</p>
          ) : (
            <>
              <div className="preview">
                <div className="preview__stage-wrap" ref={previewRef}>
                  <div
                    className="preview__stage"
                    style={{ width: activeSurface.width * displayScale, height: activeSurface.height * displayScale }}
                  >
                    <div
                      style={{
                        width: activeSurface.width,
                        height: activeSurface.height,
                        transform: `scale(${displayScale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      {renderer === "dom" ? (
                        <AdRenderer spec={demoAd} layout={layout} />
                      ) : (
                        <CanvasAdRenderer spec={demoAd} layout={layout} />
                      )}
                    </div>
                  </div>
                </div>
                <div className="preview__info-bar">
                  <strong>
                    {activeSurface.width}×{activeSurface.height}px
                  </strong>
                  <span className="preview__divider">·</span>
                  <span>{Math.round(displayScale * 100)}% scale</span>
                  <span className="preview__divider">·</span>
                  <span className={`flow-badge flow-badge--${layout.flow}`}>{layout.flow}</span>
                </div>
              </div>

              <ExplainPanel elements={layout.elements} dropped={layout.dropped} warnings={layout.warnings} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ExplainPanel({
  elements,
  dropped,
  warnings,
}: {
  elements: ResolvedElement[];
  dropped: { id: string; reason: string }[];
  warnings: string[];
}) {
  return (
    <div className="explain-panel">
      {dropped.length > 0 && (
        <div className="explain-panel__section explain-panel__section--dropped">
          <p className="explain-panel__section-title">Dropped</p>
          <ul>
            {dropped.map((d) => (
              <li key={d.id}>{d.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="explain-panel__section explain-panel__section--warning">
          <p className="explain-panel__section-title">Warnings</p>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="explain-panel__section">
        <p className="explain-panel__section-title">Resolved elements</p>
        <div className="element-table-wrap">
          <table className="element-table">
            <thead>
              <tr>
                <th>id</th>
                <th>x</th>
                <th>y</th>
                <th>w</th>
                <th>h</th>
                <th>font</th>
              </tr>
            </thead>
            <tbody>
              {elements.map((el) => (
                <tr key={el.id}>
                  <td>{el.id}</td>
                  <td>{Math.round(el.x)}</td>
                  <td>{Math.round(el.y)}</td>
                  <td>{Math.round(el.width)}</td>
                  <td>{Math.round(el.height)}</td>
                  <td>{el.kind === "image" ? "—" : Math.round(el.fontSize)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** A tiny rect scaled to a surface's own aspect ratio — lets the picker itself show shape, not just a label. */
function AspectGlyph({ width, height }: { width: number; height: number }) {
  const box = 24;
  const aspect = width / height;
  const w = aspect >= 1 ? box : box * aspect;
  const h = aspect >= 1 ? box / aspect : box;
  const x = (32 - w) / 2;
  const y = (32 - h) / 2;

  return (
    <svg className="surface-card__glyph" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <rect x={x} y={y} width={w} height={h} rx={2} />
    </svg>
  );
}

function IconBase({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M20 6 9 17l-5-5" />
    </IconBase>
  );
}

function PlusIcon() {
  return (
    <IconBase>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
}

function IconGrid() {
  return (
    <IconBase>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </IconBase>
  );
}

function IconSliders() {
  return (
    <IconBase>
      <path d="M4 21V14M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 12h6" />
    </IconBase>
  );
}

function IconLayers() {
  return (
    <IconBase>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
    </IconBase>
  );
}

function IconCode() {
  return (
    <IconBase>
      <path d="m9 18-6-6 6-6M15 6l6 6-6 6" />
    </IconBase>
  );
}

function IconCanvas() {
  return (
    <IconBase>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 15h18M9 3v18" />
    </IconBase>
  );
}
