import { defineAd } from "./spec";

/**
 * One spec, defined once. Every surface in the demo re-resolves this exact
 * object — nothing here is surface-specific.
 */
export const demoAd = defineAd({
  id: "aurora-headphones-launch",
  elements: [
    { id: "headline", type: "text", role: "primary", priority: 1, text: "Hear Every Detail" },
    { id: "product-image", type: "image", role: "hero", priority: 1, alt: "Aurora Wireless Headphones", aspectRatio: 1 },
    { id: "price", type: "text", role: "secondary", priority: 2, text: "$179.99" },
    { id: "cta", type: "button", role: "action", priority: 2, label: "Shop Now" },
    { id: "logo", type: "image", role: "branding", priority: 3, alt: "Aurora Audio", aspectRatio: 1 },
  ],
});
