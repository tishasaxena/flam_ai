# Adaptive Layout Engine for Multi-Surface Ads

One declarative ad spec — headline, hero image, price, CTA, logo — resolved live into a genuinely different, non-overlapping layout for a tall mobile interstitial, a wide broadcast lower third, a square retail kiosk, and any surface profile you throw at it, including ones the code has never seen.

## Setup

```bash
npm install
npm run dev       # demo at http://localhost:5173
npm test          # resolver + axis unit tests (vitest)
npm run typecheck # tsc --noEmit
npm run build     # production build (also type-checks)
```

Requires Node 18+.

## Running the demo

`npm run dev` opens the demo app. On the left:

- **Surface** — five presets (mobile portrait, mobile landscape, broadcast lower third, retail kiosk, and a deliberately undersized "compact" kiosk that forces degradation), plus **Custom…**, which opens a form for width/height/safe-area/touch/text-size/viewing-distance. Submitting it calls `defineSurface()` and re-resolves the same spec — this is the "surface nobody wrote code for" case exercised live, no code changes.
- **Renderer** — toggles between the DOM renderer and the Canvas renderer. Both consume the exact same `ResolvedLayout`.

The right panel shows the resolved ad at true pixel size (scaled down to fit, with the scale factor labeled), which flow the resolver picked, any dropped elements with the reason, any warnings, and a table of every surviving element's resolved `x/y/width/height/fontSize` — enough to answer "why did this end up here" without opening devtools.

## Resolution flow

```
Ad Spec + Surface Profile → Constraint Resolver → Resolved Layout → Renderer
   (spec.ts)   (surfaces.ts)     (resolver.ts)        (layout.ts)   (render-dom.tsx /
                                                                      render-canvas.tsx)
```

`resolver.ts` is plain, framework-agnostic TypeScript with no DOM dependency — it's exercised directly by `axis.test.ts` / `resolver.test.ts` under Node, not a browser. Content (text strings, image alt/src, button labels) lives only in the spec; geometry lives only in the resolved layout. A renderer zips the two together by element `id`. Neither renderer's code is referenced by, or referenced from, `resolver.ts` — that's what makes a second renderer (Canvas, added here) or a third (React Native, static HTML-for-email, …) a matter of writing a new consumer of `ResolvedLayout`, never touching the resolution algorithm.

## Layout algorithm

There is one generic, reusable primitive — `allocateAxis()` in [`src/axis.ts`](src/axis.ts) — and three flows in [`src/resolver.ts`](src/resolver.ts) that call it. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full walkthrough with worked numbers; this is the short version.

### 1. Classify the surface (geometry, not identity)

```ts
aspect = surface.width / surface.height
aspect <= 0.85  → "stack"     // tall — mobile portrait
aspect >= 2.2   → "band"      // wide & short — broadcast lower third
otherwise       → "quadrant"  // squarish — kiosk, mobile landscape
```

This is computed from `surface.width`/`surface.height` alone. There is no `if (surface.id === "mobilePortrait")` anywhere in the resolver — a surface with an unfamiliar id and a 3600×480 video-wall shape lands in "band" for the same reason broadcastLowerThird does, and `resolver.test.ts` asserts exactly that (a surface literally *named* `"mobilePortrait"` but shaped like a lower third resolves as `"band"`).

### 2. Turn ad elements into one-dimensional budget items

Each flow reduces to one or more **lanes** — a fixed pixel budget along one axis, and a list of elements competing for it:

- **stack**: one vertical lane, every element in it, budget = the surface's safe-area-inset height.
- **band**: one horizontal lane, every element in it, budget = the inset width.
- **quadrant**: a hero region and a "content column" split the *dominant* axis (whichever of width/height is larger) 56/44 via `allocateAxis` itself; the content column's leftover rect is then handed to the exact same function `stack` uses at the top level, just with a narrower rect and the hero excluded. Branding, being lowest-priority, is the first thing that column drops under pressure — independent of how the hero/content split went, since that split is marked non-droppable and only ever resizes.

Every element gets an `ideal` size (what it would take with unlimited room) and a `min` size (a hard floor — a font floor from `minTextSize`/`minFontSize`, a `minTapTarget`, or an absolute pixel minimum for branding).

### 3. `allocateAxis`: the one real algorithm

Given a budget and a list of `{ id, priority, ideal, min, canDrop }` items:

1. **Drop pass** — while the *survivors'* combined `min` exceeds the budget, remove the least-important `canDrop: true` item (highest priority number; ties broken by declaration order). In this spec, only `role: "branding"` is ever marked droppable — headline, hero, price, and CTA can shrink or truncate, but never vanish.
2. **Fit check** — if the survivors' combined `ideal` fits the budget, everyone gets their ideal size. Nothing shrank.
3. **Proportional shrink** — otherwise, every survivor gives up space proportional to its own slack (`ideal - min`): an item with more room to give, gives more; nobody crosses their own floor. This is flex-shrink's distribution rule, reimplemented directly rather than delegated to a `<div style="flex-shrink">` — the assignment asks for a real algorithm, and this is it.
4. **Last-resort clamp** — if every remaining item is non-droppable and even their combined minimums don't fit (nothing left to drop), scale everyone down together rather than overflow the surface, and record a warning. This path is defensive; none of the shipped surfaces hit it for the demo spec (see `resolver.test.ts`).

Font size, image letterboxing (`object-fit: contain` math against an element's `aspectRatio`), and text truncation are all derived *after* `allocateAxis` returns a size — see `placeElement()` in `resolver.ts`.

### Priority & degradation, concretely

`priority: 1` is most important, larger numbers degrade first. In the demo spec, headline and hero are priority 1 (never dropped, shrink only to their floor), price and CTA are priority 2 (shrink/truncate only), and branding is priority 3 *and* the only role marked droppable. On the compact kiosk (130×130, `minTapTarget: 60`) the four required elements' combined minimum (119px) exceeds the 102px available, so the resolver drops branding — and only branding — bringing the requirement down to 91px, which fits. Headline and CTA come out at full, undiminished size. `resolver.test.ts` asserts this exact outcome (`dropped` is `["logo"]` and nothing else) and also asserts, across every shipped surface, that no two visible elements ever overlap and none exceeds the surface bounds.

### Why the sizing formulas are scale-anchored, not axis-anchored

An early version derived a text element's height as a fraction of *whatever axis happened to be the flow's main axis*. That's wrong: broadcastLowerThird is 250px tall, and a lower third's headline should not take 62% of that (≈155px, i.e. a ~110px font) just because vertical room happens to be available — a real lower third stays legible-but-modest regardless of the frame's raw height. Every font-size and branding-size formula is anchored to `scale = min(contentWidth, contentHeight)` — "how big is this surface, overall" — with role-based factors and a floor/cap `clamp()`, the same formula whether an element ends up in a stack or a band. `roleFontSize()` in `resolver.ts` is shared by both flows for exactly this reason.

## TypeScript design

- **`spec.ts`** — `AdElement` is a discriminated union on `type` (`"text" | "image" | "button"`), each variant carrying only its own fields (`text`, `label`, `alt`/`src`). Assigning a `label` to a `type: "text"` element, or a `role` outside the five-member `ElementRole` union, is a compile error, not a runtime surprise. `defineAd()` re-validates at runtime (duplicate ids, unknown role/type, missing content) because real ad content is frequently assembled from JSON — a CMS or ad-server payload — where the literal types have already erased.
- **`surfaces.ts`** — `SurfaceProfile` is a plain interface, but `defineSurface()` enforces cross-field constraints TypeScript's type system can't express on its own: `touchOnly: true` requires `minTapTarget`; `viewingDistance: "far"` requires `minTextSize`; safe-area insets can't exceed the surface; `minTapTarget` can't exceed the shorter side. Each throws a specific, actionable message.
- **`layout.ts`** — `ResolvedElement` is a discriminated union on `kind` (`"text" | "image" | "button"`) mirroring `AdElement`'s shape, so a renderer can `switch` on `el.kind` and get the right fields (`fontSize`, `truncated`) without a cast. `ResolvedLayout` carries only geometry — no content — so it's meaningful across renderers.
- **Exhaustiveness** — every `switch (el.type)` in the resolver ends in `default: return assertNever(el)`, so adding a fourth element type without updating every sizing function is a compile error, not a silent `undefined`.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full module breakdown, the worked numeric example, and the extensibility story (adding a surface, a renderer, or an element type without touching the resolver).

```
src/
├── spec.ts            Ad content & intent — AdElement union, defineAd()
├── surfaces.ts         Surface constraints — SurfaceProfile, defineSurface(), presets
├── layout.ts           Resolved output types — Rect, ResolvedElement, ResolvedLayout
├── axis.ts             allocateAxis() — the one generic priority/shrink/drop primitive
├── text-metrics.ts     TextMeasurer type + heuristic and canvas-backed implementations
├── resolver.ts         resolveLayout() — flow classification, sizing, placement
├── render-dom.tsx       ResolvedLayout + AdSpec → React/DOM
├── render-canvas.tsx    ResolvedLayout + AdSpec → Canvas (bonus second renderer)
├── demo-ad.ts           The example product ad spec used by the demo
├── App.tsx              Demo shell: surface picker, custom-surface form, renderer toggle
├── axis.test.ts         Unit tests for allocateAxis
└── resolver.test.ts     Overlap/bounds/degradation/generalization tests for resolveLayout
```

## Bonus items implemented

- **Live "unknown 5th surface"**: the Custom… form in the demo builds a `SurfaceProfile` at runtime via `defineSurface()` and re-resolves — no code changes. Exercised in tests too (`resolver.test.ts`, a 3600×480 "video wall").
- **Canvas renderer**: `render-canvas.tsx`, sharing `resolveLayout()`'s output with the DOM renderer.
- **Animated surface transitions**: `render-dom.tsx` elements carry a CSS `transition` on position/size/font-size, so switching surfaces in the demo animates rather than jump-cuts.
- **Text-measurement-aware layout**: `text-metrics.ts` exposes a `TextMeasurer` the resolver depends on as an injected function (keeping the resolver DOM-free); the demo passes `createCanvasTextMeasurer()`, which uses a real offscreen-canvas `measureText()` (weight-aware — primary text and button labels measure bold/semi-bold to match what actually renders) to size and truncate text, rather than a fixed character-count estimate. The default (`estimateTextWidth`) is the character-count heuristic, used automatically when no measurer is supplied (tests, non-browser environments).
- **Accessibility as a first-class constraint**: `minTapTarget` is enforced as a hard floor (not a suggestion) for buttons whenever a surface declares it, validated at `defineSurface()` time.

Not implemented: contrast-aware branding placement.

## Known limitations

- **One element per role.** The resolver looks up "the" hero/primary/secondary/action/branding element via `find()`. A spec with two `role: "secondary"` elements would silently use only the first; extending to N-per-role would mean grouping before layout, not a resolver rewrite.
- **No text wrapping.** Text either fits on one line at its resolved font size or gets a CSS ellipsis (`truncated: true`); there's no multi-line reflow. Real copy decks would need this.
- **`bleed` is typed but unused.** `SurfaceProfile.bleed` exists for print surfaces but nothing in the resolver consumes it yet — a print renderer would need to inset artwork by it.
- **No true collision-avoiding overlay placement.** Branding is laid out as the lowest-priority row in its content column (guaranteeing zero overlap by construction) rather than as a floating corner badge that could sit over the hero image. A corner-badge treatment is more visually conventional for real logo bugs but needs explicit collision handling against the hero.
- **Quadrant's content column is always a vertical stack**, regardless of the hero's placement (left or top). A more general version would recursively re-classify the leftover rect's own aspect ratio instead of hardcoding "stack" for the sidebar.
- **The last-resort clamp path** (every element non-droppable and even minimums don't fit) shrinks below the stated floor rather than fail loudly. No shipped surface hits it for the demo spec, but a truly pathological surface (e.g. narrower than a single character) would render technically-non-overlapping but sub-floor content.
- **No animation *during* the initial resolve** — only on surface switches (CSS transitions on the DOM renderer). The Canvas renderer redraws instantly, no interpolation.

## AI tool disclosure

This implementation — architecture, the `allocateAxis`/flow-classification algorithm, TypeScript types, the demo UI, the test suite, and this documentation — was built with **Claude Code** (Anthropic, Sonnet 5) from the assignment brief. It wasn't a single generation: the app was run in a real browser throughout and iterated on against what actually rendered, which caught several real bugs before they shipped — worth naming since they're the kind of thing worth understanding, not just the happy path:

- The initial text-sizing formula picked a font size from surface scale alone, ignoring the lane's actual width, so a normal-length headline on a normal-width phone screen overflowed and ellipsized for no good reason. Fixed by also solving for the font size at which the text's *measured* width fits the lane, and taking the smaller of the two.
- The canvas-based text measurer measured at regular weight while the CSS renders primary text bold and buttons semi-bold, so the "does this fit" check was measuring the wrong string width. Fixed by threading font-weight into every `measureText()` call.
- The band flow's cross-axis sizing derived text height as a fraction of the lane's raw height rather than overall surface scale, which produced a ~112px headline in the 250px-tall broadcast lower third. Fixed by routing band's text sizing through the same scale-anchored `roleFontSize()` stack flow uses.
- The preview's scale-down wrapper (`transform: scale(...)`) had no explicit width/height, so as a block element it defaulted to its *already-scaled* container's width instead of the surface's native size, then got scaled down a second time — the ad rendered at roughly a quarter of its intended preview size. Fixed by sizing the wrapper explicitly to the native surface dimensions before applying the transform.

All four were caught by resolving specific numbers reported in the demo's own "resolved elements" table against hand-computed expectations, or by comparing `getBoundingClientRect()` against the intended CSS — not by assuming the first render was correct. The automated overlap/bounds tests in `resolver.test.ts` codify the same checks so they can't regress silently.

## Time spent

Completed in a single continuous session rather than across the full 3–5 day window — implementation, live-browser verification and bug-fixing, the test suite, and this documentation together.
