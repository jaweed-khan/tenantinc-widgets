// Cross-widget channel: Space List (#05) → Value Tiers (#14). They are separate
// AMD bundles on the same Duda page, so they talk via a window CustomEvent — the
// same pattern as promoBus. #05's "Select" asks #14 to open its tier modal for
// the chosen product. No URL change (matches the live site's modal, which keeps
// the page URL); the identity travels in memory.

export const TIER_OPEN_EVENT = 'tenantinc:open-value-tiers';

export interface TierOpenRequest {
  /** Unit size to price, e.g. "10' x 25'" (display + fallback resolution). */
  size: string;
  /** AUTHORITATIVE product id — the group's tier_id. When present, #14 quotes
   *  exactly this group (no ambiguous re-resolution by display size). */
  unitGroupId?: string;
  /** Selected unit id (display/handoff only; the proxy re-resolves offers). */
  unitId?: string;
  /** Facility the request is for — a listener scoped to another property
   *  ignores it. Omitted ⇒ any listener may handle it. */
  propertyId?: string;
  /** Optional instance channel. When both sender and receiver set a channel,
   *  only the matching modal opens — disambiguates multiple modals on one page.
   *  Omitted ⇒ fall back to propertyId scoping. */
  channel?: string;
  /** CTA button text mirrored from the sender (Space List), so the operator sets
   *  it once. Omitted ⇒ the modal keeps its own ctaLabel. */
  ctaLabel?: string;
  /** Fee/junk-fee disclaimer text mirrored from the sender. Empty string ⇒ hide
   *  it (sender's toggle is off); omitted ⇒ the modal keeps its own fee text. */
  feeText?: string;
  /** Mirror the Space List junk-fee toggle: pricing details and its itemized
   *  fee breakdown are shown only when the operator enables that disclosure. */
  showPricingDetails?: boolean;
  /** Sender's "show urgency" toggle. false ⇒ hide the modal's urgency line;
   *  omitted ⇒ the modal keeps its own behaviour. */
  showUrgency?: boolean;
  /** Mirror Space List's presentation toggle. false hides promo pricing/copy;
   *  it does not change promotion eligibility or checkout application. */
  enablePromoLogic?: boolean;
}

/** True when the request looks well-formed enough to act on. */
export function isValidTierRequest(req: unknown): req is TierOpenRequest {
  return !!req && typeof (req as TierOpenRequest).size === 'string' && (req as TierOpenRequest).size.trim().length > 0;
}

/**
 * Ask the Value Tiers widget to open for a product. Returns true if a listener
 * ACKNOWLEDGED it (via preventDefault) — so the caller can fall back (navigate,
 * warn) when the enabled CTA has no modal mounted, instead of silently doing
 * nothing.
 */
export function emitOpenTiers(req: TierOpenRequest): boolean {
  try {
    const ev = new CustomEvent<TierOpenRequest>(TIER_OPEN_EVENT, { detail: req, cancelable: true });
    const notCanceled = window.dispatchEvent(ev);
    return !notCanceled; // canceled (a listener called preventDefault) ⇒ handled
  } catch {
    return false;
  }
}

/**
 * Subscribe to open requests. `handler` returns true to ACCEPT (which
 * acknowledges the sender); return false to ignore (malformed, or scoped to a
 * different property). Returns an unsubscribe fn.
 */
export function onOpenTiers(handler: (req: TierOpenRequest) => boolean): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<TierOpenRequest>;
    if (handler(ce.detail)) ce.preventDefault();
  };
  try { window.addEventListener(TIER_OPEN_EVENT, listener); } catch { /* no window */ }
  return () => { try { window.removeEventListener(TIER_OPEN_EVENT, listener); } catch { /* ignore */ } };
}
