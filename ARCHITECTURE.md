# Architecture

This document is the deep dive. [README.md](README.md) has the short version, setup, and limitations; this is the "why," a worked numeric example, and the extensibility story.

## Module graph

```
spec.ts        surfaces.ts        text-metrics.ts
    \               |                   /
     \              |                  /
      \             |                 /
       ----->  resolver.ts  <---------
        (imports axis.ts, layout.ts)
                    |
                    v
              layout.ts (types only, no imports from resolver)
               /            \
              v              v
     render-dom.tsx    render-canvas.tsx
              \              /
               v            v
                  App.tsx
```

`resolver.ts` is the only module that imports `axis.ts`. Nothing downstream of `layout.ts` (the two renderers, `App.tsx`) imports `resolver.ts`'s internals, `axis.ts`, `spec.ts`'s validation logic, or `surfaces.ts`'s validation logic — a renderer only ever sees the public `ResolvedLayout` shape. That one-way dependency is what makes the two "could you add X without touching the resolver" questions in the brief literally true here, not just asserted:

- **A new surface** is a `SurfaceProfile` object (validated by `defineSurface()`) passed into the same `resolveLayout()`. Nothing in `resolver.ts` branches on `surface.id`; the only per-surface reasoning is the aspect-ratio classification and the constraint values (`minTapTarget`, `minTextSize`, `safeArea`, …) themselves. `resolver.test.ts`'s "video wall" test constructs a 3600×480 surface that shares no code path with any preset and asserts it resolves correctly.
- **A new renderer** consumes `ResolvedLayout` (`layout.ts`) and, separately, `AdSpec` (`spec.ts`) for content — it does not import `resolver.ts` at all. `render-canvas.tsx` is the proof: it was added after the DOM renderer with zero edits to `resolver.ts`, `axis.ts`, or `layout.ts`.

## The core primitive: `allocateAxis`

Every flow ultimately reduces to one or more **lanes**: a fixed pixel budget along one axis, and a list of `AxisItem`s (`{ id, priority, ideal, min, canDrop }`) competing for it. `allocateAxis()` (`axis.ts`) is the only place sizing decisions actually get made; it has no idea what an "ad," "text," or "image" is — it operates on abstract items and a number.

### Worked example: the compact kiosk

`retailKioskCompact` is 130×130 with an 8px safe area on each side (content area 114×114) and `minTapTarget: 60`. `scale = min(114, 114) = 114`. Quadrant flow splits the dominant axis into a hero region and a content column; the content column ends up with height ≈114 (the full cross length) and calls `stackItems()` on its four non-hero elements (headline, price, CTA, logo).

Each element's floor (`min`), given `minTapTarget: 60` and no `minTextSize` (so text floors at the generic 12px default):

| element | role | min (px) | why |
|---|---|---|---|
| headline | primary | 15.6 | `12px × 1.3` line-height |
| price | secondary | 15.6 | same floor, secondary role |
| cta | action | 60 | `minTapTarget` |
| logo | branding | 28 | absolute floor for branding |

Gap budget: `gap = clamp(114 × 0.025, 4, 22) = 4` (floored), × 3 gaps between 4 items = 12px. Available budget = `114 − 12 = 102px`.

**Phase 1 (drop):** combined min of all four = `15.6 + 15.6 + 60 + 28 = 119.2px > 102px`. Only `logo` (branding) is `canDrop: true`, so it's removed. Recompute: combined min of the remaining three = `15.6 + 15.6 + 60 = 91.2px ≤ 102px` — fits. Drop pass stops after one removal.

**Phase 2 (fit check):** headline's role-based ideal font (`roleFontSize`) would be ~17px, but the content column here is only ~49px wide, and stack flow's text sizing takes the *smaller* of "role-comfortable font" and "font at which this exact string fits the lane width" (see "Why the sizing formulas are scale-anchored" below) — at 49px of width, that fit-check pulls both headline and price down to the absolute 12px floor (16px line height). CTA clamps to its 60px `minTapTarget` floor. Combined: `16 + 16 + 60 = 92px`, plus two 4px gaps = 100px, `≤ 102px` — everyone fits with 2px to spare, no further shrink needed. This matches the running demo's own output on this surface: headline and price both render at a 12px floor font, CTA at a full 60px tap target, nothing overlapping (`resolver.test.ts` asserts the drop outcome and the no-overlap/no-out-of-bounds invariant; it doesn't pin these exact pixel values, which are sensitive to the sizing constants).

Result: branding is gone, and this is visible in `layout.dropped` as `{ id: "logo", reason: "...insufficient space — required elements need 119px minimum but only 102px is available..." }` (the actual numbers the resolver produces — see the demo's own "Dropped" panel on that surface, or `resolver.test.ts`'s assertion that `dropped` is exactly `["logo"]`). Headline and CTA render at full, undiminished size — nothing about their layout "knows" branding was ever there.

This is the mechanism behind the brief's own example ("shrink the kiosk surface's available height until branding must be dropped"), reproduced exactly rather than special-cased — the same `allocateAxis()` call handles this and every other surface.

### Why proportional shrink, not first-fit

An earlier design considered "give items their ideal size in priority order until the budget runs out, whatever's left over gets the remainder." Rejected: it means at most one item is ever partially shrunk (whichever happened to be next when the budget ran dry) and everything after it drops to nothing, which is a much harsher, less explainable cliff than real layout systems produce. Proportional shrink — mirroring flexbox's `flex-shrink` distribution — means every survivor gives up space in proportion to how much slack it personally has, so degradation is gradual and every survivor's final size is still a function of its own `ideal`/`min`, not of arrival order.

## The three flows

Classification is a pure function of `surface.width / surface.height` — see `resolveLayout()` in `resolver.ts`. There is no lookup table keyed on `surface.id` anywhere in this file; grep it if you want to check.

```
aspect = width / height

        aspect ≤ 0.85                0.85 < aspect < 2.2            aspect ≥ 2.2
   ┌──────────────────┐          ┌──────────────────────┐       ┌──────────────────┐
   │       STACK       │          │       QUADRANT        │       │       BAND        │
   │  (tall)            │          │  (squarish)            │       │  (wide & short)    │
   │                    │          │                        │       │                    │
   │  ┌──────────────┐  │          │  ┌────────┐┌────────┐  │       │  ┌──┐┌────┐┌──┐┌──┐ │
   │  │     hero      │  │          │  │        ││ headline│  │       │  │  ││    ││  ││  │ │
   │  ├──────────────┤  │          │  │  hero   │├────────┤│  │       │  └──┘└────┘└──┘└──┘ │
   │  │   headline    │  │          │  │        ││  price  ││  │       │   hero head pr cta │
   │  ├──────────────┤  │          │  │        │├────────┤│  │       │                    │
   │  │    price      │  │          │  │        ││   cta   ││  │       └──────────────────┘
   │  ├──────────────┤  │          │  │        │├────────┤│  │
   │  │     cta       │  │          │  └────────┘│  logo   ││  │
   │  ├──────────────┤  │          │             └────────┘│  │
   │  │    logo       │  │          └──────────────────────┘
   │  └──────────────┘  │
   └──────────────────┘
```

- **stack** (`stackItems`): one vertical lane holding all five elements, in role order (hero, primary, secondary, action, branding). Used at the top level for tall surfaces, and reused verbatim — narrower rect, hero excluded — as quadrant's content column.
- **band** (`bandItems`): the horizontal mirror of stack. The cross axis (height) is fixed per role first (`bandCrossHeight`), then the main axis (width) is what `allocateAxis` fights over (`bandMainAxisSpec`) — so under pressure, band-flow elements truncate in width before their (fixed) font size would ever change. This matches how real lower-third graphics behave: text height is locked to the band's height; long copy truncates, it doesn't shrink.
- **quadrant** (`quadrantItems`): splits the *dominant* axis (`rect.width >= rect.height ? horizontal : vertical`) between a hero region and a content column via one `allocateAxis` call (both marked `canDrop: false` — this split only ever resizes, never drops a side), then hands the content column's leftover rect to `stackItems` with the hero excluded. This reuse is why quadrant's content column degrades exactly like a miniature stack surface would: it's calling the identical function.

Visual **order** within a lane (`ROLE_VISUAL_ORDER`: hero, primary, secondary, action, branding) is deliberately a separate concept from **importance** (`AdElement.priority`, which drives `allocateAxis`'s drop/shrink decisions). A real design system separates "where does this go" from "how much does it matter" the same way — collapsing them would mean a designer couldn't make branding visually appear before price without also making it survive longer under pressure.

### Why sizing is scale-anchored

`scale = min(contentRect.width, contentRect.height)` is computed once per `resolveLayout()` call and threaded into every sizing function, including band's — even though band's *main* axis is width. This was a deliberate fix, not the original design (see README's AI-disclosure section for how it was found): deriving a text element's size from whichever axis happens to be the current flow's main axis means a wide-but-short surface computes "62% of the available height" as if that were a small number, when for a 1920×250 lower third it's ~155px — an oversized, unrealistic headline. Real typography scales with the surface's overall size, not with whichever raw dimension the current flow happens to be dividing up. `roleFontSize(role, scale, floor)` is the single formula both `stackSizeSpec` and `bandCrossHeight` call for text sizing, so headline/price read at a consistent, proportionate size regardless of which flow placed them.

Image and branding sizing follows the same principle: `heroSize.min = max(scale * 0.22, 40)`, `brandingIdeal = scale * 0.16`, etc. — all anchored to the surface's overall scale, never to a single raw axis length.

## Extending the engine

**Add a surface profile.** Write a `SurfaceProfile` object and pass it through `defineSurface()` for validation (or skip validation if you're prototyping — `resolveLayout()` doesn't require it). Nothing else changes. `App.tsx`'s "Custom…" form does exactly this from user input at runtime.

**Add a renderer.** Write a function `(spec: AdSpec, layout: ResolvedLayout) => T` for whatever `T` your target needs (JSX, canvas draw calls, a PDF page, static HTML for an email). `render-canvas.tsx` is ~80 lines and touches nothing outside itself.

**Add an element type.** Three places, all in `spec.ts`/`resolver.ts`/`layout.ts`, and TypeScript will tell you if you miss one: (1) add the variant to `AdElement` in `spec.ts` (and `ELEMENT_TYPES`); (2) `layout.ts`'s `ResolvedElement` needs a matching `kind` variant; (3) every `switch (el.type)` in `resolver.ts` (`stackSizeSpec`, `bandCrossHeight`, `bandMainAxisSpec`, `placeElement`) will fail to compile at its `default: return assertNever(el)` line until you add a case — that's intentional; it's the exhaustiveness check doing its job.

**Add a role.** Add it to `ELEMENT_ROLES` in `spec.ts` and to `ROLE_VISUAL_ORDER` in `resolver.ts` (TypeScript's `Record<ElementRole, number>` will refuse to compile until you do). Decide whether it should ever be `canDrop: true` in `stackItems`/`bandItems` (currently hardcoded to `role === "branding"` — generalizing this to a spec-level or role-level flag would be the natural next step if more than one droppable role were needed).

## Notable design decisions

- **Only `branding` is ever fully dropped.** Every other role has a hard floor it clamps to (font floor, `minTapTarget`) but never disappears. This was a deliberate reading of the brief's own example language ("branding shrinks/drops, secondary text truncates") into a single, easy-to-state invariant, rather than a generic "any low-priority element can vanish" rule that would make behavior harder to predict per-role.
- **Branding never floats as a corner badge.** It's laid out as the lowest-priority row in whatever content lane it's in. This guarantees zero overlap *by construction* (sequential lanes with a running cursor structurally cannot overlap) at the cost of the more conventional "logo bug in the corner, overlapping the hero image" placement real broadcast/kiosk graphics often use. A corner-badge version is possible but needs explicit collision handling against the hero region — noted in the README limitations rather than half-implemented.
- **The final `guardBounds()` pass** in `resolver.ts` clamps any element that would exceed the surface (and records a warning if it had to). Every flow already places elements within bounds by construction, so in practice this only ever fires for the pathological last-resort-clamp case in `allocateAxis`. It's there as a safety net, not as the mechanism that makes layouts correct — treat it as defense in depth, not as "the code that prevents overlaps." The thing that actually prevents overlaps is that stack/band never place two elements at the same cursor position, and quadrant's two regions are disjoint by construction (`heroLen + gap` boundary).
