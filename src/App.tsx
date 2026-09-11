import { useMemo, useState, type FormEvent } from "react";
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
const PREVIEW_MAX_HEIGHT = 460;

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

  const displayScale = activeSurface
    ? Math.min(1, PREVIEW_MAX_WIDTH / activeSurface.width, PREVIEW_MAX_HEIGHT / activeSurface.height)
    : 1;

  return (
    <div className="app">
      <header className="app__header">
        <h1>Adaptive Ad Layout Engine</h1>
        <p>
          One <code>adSpec</code> (headline, hero image, price, CTA, logo) resolved live against different surface
          profiles. The arrangement below is computed by <code>resolveLayout()</code> from each surface's actual
          width, height, and hard constraints — nothing is a hardcoded per-surface layout.
        </p>
      </header>

      <div className="app__layout">
        <aside className="app__controls">
          <section>
            <h2>Surface</h2>
            <div className="surface-picker">
              {PRESET_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={surfaceId === id ? "surface-picker__button is-active" : "surface-picker__button"}
                  onClick={() => setSurfaceId(id)}
                >
                  {SURFACE_LABELS[id]}
                </button>
              ))}
              <button
                type="button"
                className={surfaceId === "custom" ? "surface-picker__button is-active" : "surface-picker__button"}
                onClick={() => setSurfaceId("custom")}
              >
                Custom…
              </button>
            </div>
          </section>

          {surfaceId === "custom" && (
            <section>
              <h2>Custom surface profile</h2>
              <p className="app__hint">
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
            <h2>Renderer</h2>
            <div className="renderer-toggle">
              <button type="button" className={renderer === "dom" ? "is-active" : ""} onClick={() => setRenderer("dom")}>
                DOM
              </button>
              <button type="button" className={renderer === "canvas" ? "is-active" : ""} onClick={() => setRenderer("canvas")}>
                Canvas
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
                <p className="preview__caption">
                  {activeSurface.width}×{activeSurface.height}px, shown at {Math.round(displayScale * 100)}% scale — flow:{" "}
                  <strong>{layout.flow}</strong>
                </p>
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
          <h3>Dropped</h3>
          <ul>
            {dropped.map((d) => (
              <li key={d.id}>{d.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="explain-panel__section explain-panel__section--warning">
          <h3>Warnings</h3>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="explain-panel__section">
        <h3>Resolved elements</h3>
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
  );
}
