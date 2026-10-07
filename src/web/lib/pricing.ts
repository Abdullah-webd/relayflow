// Display prices for static marketing copy. The server (src/server/billing/plans.ts) is the
// source of truth for what Stripe charges; keep these in sync.
export const PRICES = { starter: 15, pro: 30 } as const;
// Kept for older imports: the top plan's price.
export const PRICE_USD = PRICES.pro;
