import React, { useState } from 'react';
import type { Unit, WidgetConfig } from '../types';
import { isUnavailable } from '../filters';
import { withLineBreaks } from '@shared/lineBreaks';
import { emitOpenTiers } from '@shared/tierBus';
import { rentalHref, saveUnitSelection } from '@shared/unitHandoff';
import cfg from '../config.json';

// Prices round DOWN to whole dollars: 145.20 → $145.00, 147.99 → $147.00. The
// cents only ever come from the in-store calculation (a percentage of the web
// price), and quoting a price below the real one is the safe direction to err.
const fmt = (n: number) => `$${Math.floor(n).toFixed(2)}`;

/**
 * "Only 3 left - Rent soon!" (Figma 7112-47400) — or null when it shouldn't show.
 *
 * Derived from live vacancy rather than a pre-baked string: the API mapper never
 * populated `unit.urgency` (only two now-unused demo rows did), so the message
 * never actually appeared on a live site. Now `showUrgencyMessage` switches it on
 * and `urgencyThreshold` (default 5) decides how low vacancy has to be.
 *
 * Two deliberate silences: unknown vacancy can't justify a scarcity claim, and
 * zero vacancy is "unavailable" — the waitlist CTA already says so, no need to
 * also announce "Only 0 left".
 */
export function urgencyMessage(unit: Unit, config: WidgetConfig): string | null {
  if (!config.showUrgencyMessage) return null;
  const left = unit.vacantCount;
  if (typeof left !== 'number' || left <= 0) return null;
  if (left > config.urgencyThreshold) return null;
  return `Only ${left} left - Rent soon!`;
}

/**
 * The struck-through "IN-STORE" price, derived from the web price by
 * `instorePriceMode` + `instorePriceAmount`.
 *
 *   percentOfWeb   → web + amount%      (100 @ 10 → 110)
 *   additionOfWeb  → web + amount       (100 @ 10 → 110)
 *   percentDiff    → same as percentOfWeb for now; the intended distinction was
 *                    never specified, so it deliberately mirrors A rather than
 *                    inventing behaviour.
 *
 * With no amount set we fall back to the API's own `inStorePrice`
 * (`set_rate ?? units.max_price`), which is what shipped before this was wired —
 * so an instance that never fills the field in keeps its current numbers.
 */
export function instorePrice(unit: Unit, config: WidgetConfig): number {
  const amount = config.instorePriceAmount;
  if (!amount) return unit.inStorePrice;
  if (config.instorePriceMode === 'additionOfWeb') return unit.startingPrice + amount;
  return unit.startingPrice * (1 + amount / 100);
}

/** Labels used by the promo-logic pair. Lift these into the content menu if the
 *  client ever wants them editable; the spec asked for fixed wording. */
const ONLINE_LABEL = 'Online';
const PROMO_RATE_LABEL = 'Promo rate';

/**
 * The unit's price with its promotion applied, or null when we can't work one out.
 *
 * Precedence:
 *  1. `promotionPrice` — the API's own `promotion_sell_rate`. Authoritative, but
 *     null on every live tier as of 2026-08-03, so 2 is what actually runs.
 *  2. `promoValue` + `promoKind`, where the kind was inferred from the promo name
 *     because the API's `type` is 'regular' for every promo (see api.ts):
 *       percent → starting x (1 - value/100)   e.g. 150 @ "20% OFF"        → 120
 *       fixed   → value                        e.g. any @ "$1 MOVE IN"     → 1
 *  3. Otherwise null — the card falls back to showing the starting price alone.
 *
 * Sanity-checked before returning: a promo rate that is <= 0, or not actually
 * cheaper than the starting price, is treated as unusable rather than displayed.
 * Quoting a wrong price is worse than quoting no promo.
 */
export function promoRate(unit: Unit): number | null {
  const usable = (n: number) => (n > 0 && n < unit.startingPrice ? n : null);

  if (typeof unit.promotionPrice === 'number') return usable(unit.promotionPrice);
  if (typeof unit.promoValue !== 'number' || !unit.promoKind) return null;
  if (unit.promoKind === 'percent') return usable(unit.startingPrice * (1 - unit.promoValue / 100));
  return usable(unit.promoValue);
}

export function PriceBlock({ unit, config }: { unit: Unit; config: WidgetConfig }) {
  // Promo mode replaces the in-store pair entirely: "Online" (the starting rate,
  // struck through) beside "Promo rate" (the discounted one). instorePriceMode /
  // instorePriceAmount are deliberately not consulted here.
  const promo = config.enablePromoLogic ? promoRate(unit) : null;

  if (promo !== null) {
    return (
      <div className="sl-prices-row">
        <div className="sl-price-left">
          <div className="sl-instore-label">{ONLINE_LABEL}</div>
          <div className="sl-strike">{fmt(unit.startingPrice)}</div>
        </div>
        <div className="sl-price-divider" />
        <div className="sl-price-main">
          <div className="sl-starting-label">{PROMO_RATE_LABEL}</div>
          <div className="sl-main-price">{fmt(promo)}</div>
          {unit.adminFee != null && (
            <div className="sl-admin-fee">+ Plus ${unit.adminFee} Admin Fee</div>
          )}
        </div>
      </div>
    );
  }

  // With promo logic on but no promotion on this unit, the in-store column stays
  // hidden — showing it would be the very calculation this mode replaces.
  const showInstore = config.showInstorePrice && !config.enablePromoLogic;

  return (
    <div className="sl-prices-row">
      {showInstore && (
        <>
          <div className="sl-price-left">
            <div className="sl-instore-label">{config.instorePriceLabel}</div>
            <div className="sl-strike">{fmt(instorePrice(unit, config))}</div>
          </div>
          <div className="sl-price-divider" />
        </>
      )}
      <div className="sl-price-main">
        <div className="sl-starting-label">{config.startingAtLabel}</div>
        <div className="sl-main-price">{fmt(unit.startingPrice)}</div>
        {unit.adminFee != null && (
          <div className="sl-admin-fee">+ Plus ${unit.adminFee} Admin Fee</div>
        )}
      </div>
    </div>
  );
}

// Filled tag — exact Figma vector (node 429:46379). Shared by the grid promo
// banner and the list-card promo banner.
// currentColor, so the CALLER sets the colour (.sl-promo-icon / .sl-lc-promo-icon
// use --color_1). Drop it somewhere that doesn't and it takes the inherited text
// colour — which on these badges is the dark #101318 label.
export function PromoTagIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13.3817 13.3817" fill="currentColor" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d="M4.37691 0.0456721C5.33683 -0.00499382 5.94003 -0.0368318 6.51907 0.0798287C7.03141 0.183051 7.52277 0.371604 7.97264 0.637617C8.48108 0.93826 8.90814 1.36545 9.58774 2.04526L11.3614 3.81894C12.1484 4.60549 12.6574 5.1142 12.9458 5.68015C13.5271 6.82102 13.5271 8.17122 12.9458 9.31208C12.6574 9.87803 12.1484 10.3867 11.3615 11.1733L11.1733 11.3615C10.3867 12.1484 9.87803 12.6574 9.31208 12.9458C8.17122 13.5271 6.82102 13.5271 5.68015 12.9458C5.1142 12.6574 4.60551 12.1484 3.81894 11.3614L2.04526 9.58775C1.36545 8.90814 0.93826 8.48108 0.637616 7.97264C0.371604 7.52277 0.183051 7.03141 0.0798287 6.51907C-0.0368318 5.94003 -0.00499381 5.33682 0.0456723 4.3769L0.0806964 3.71162C0.106284 3.2253 0.127491 2.82224 0.170667 2.49296C0.21568 2.14968 0.290027 1.83525 0.449052 1.53874C0.697125 1.07618 1.07618 0.697124 1.53874 0.449052C1.83525 0.290027 2.14968 0.21568 2.49297 0.170667C2.82225 0.127491 3.2253 0.106284 3.71162 0.0806962L4.37691 0.0456721ZM4.32633 2.99186C3.58996 2.99186 2.993 3.58882 2.993 4.3252C2.993 5.06158 3.58996 5.65853 4.32633 5.65853C5.06271 5.65853 5.65967 5.06158 5.65967 4.3252C5.65967 3.58882 5.06271 2.99186 4.32633 2.99186Z" />
    </svg>
  );
}

export function PromoBadge({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <div className="sl-promo-badge" style={style}>
      <span className="sl-promo-icon"><PromoTagIcon size={16} /></span>
      {text}
    </div>
  );
}

/** Pika play/play-circle (outline) — inherits currentColor from its link. */
export function PlayCircleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.0001 21.1501C17.0535 21.1501 21.1501 17.0535 21.1501 12.0001C21.1501 6.94669 17.0535 2.8501 12.0001 2.8501C6.94669 2.8501 2.8501 6.94669 2.8501 12.0001C2.8501 17.0535 6.94669 21.1501 12.0001 21.1501Z" />
      <path d="M9.50012 11.896C9.50012 10.4641 9.50012 9.74818 9.79935 9.34849C10.0601 9.00019 10.4593 8.78227 10.8933 8.75127C11.3913 8.7157 11.9935 9.10284 13.1979 9.87713L13.3597 9.98113C14.4049 10.653 14.9275 10.989 15.108 11.4161C15.2657 11.7894 15.2657 12.2105 15.108 12.5838C14.9275 13.011 14.4049 13.3469 13.3597 14.0188L13.1979 14.1228C11.9935 14.8971 11.3913 15.2842 10.8933 15.2487C10.4593 15.2177 10.0601 14.9997 9.79935 14.6514C9.50012 14.2517 9.50012 13.5358 9.50012 12.104V11.896Z" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M5.86337 10.5833L3.55004 8.27001C3.42548 8.14517 3.25638 8.07502 3.08004 8.07502C2.90369 8.07502 2.73459 8.14517 2.61004 8.27001C2.35004 8.53001 2.35004 8.95001 2.61004 9.21001L5.39671 11.9967C5.65671 12.2567 6.07671 12.2567 6.33671 11.9967L13.39 4.94334C13.65 4.68334 13.65 4.26334 13.39 4.00334C13.2655 3.8785 13.0964 3.80835 12.92 3.80835C12.7437 3.80835 12.5746 3.8785 12.45 4.00334L5.86337 10.5833Z" fill="#637381"/>
    </svg>
  );
}

export function FeatureList({ features }: { features: string[] }) {
  return (
    <ul className="sl-features">
      {features.map((f) => (
        <li key={f}>
          <CheckIcon /> {f}
        </li>
      ))}
    </ul>
  );
}

/**
 * Editor-authored disclaimer under the price. Copy comes from `junkFeeCopy`,
 * which SpaceList has already defaulted — so an empty string here means the
 * editor deliberately cleared it, and we render nothing rather than an empty box.
 */
export function JunkFeeDisclaimer({ config }: { config: WidgetConfig }) {
  if (!config.junkFeeCopy) return null;
  return <div className="sl-junk-disclaimer">{withLineBreaks(config.junkFeeCopy)}</div>;
}

/**
 * Primary CTA — Select / Call / Waitlist by unit availability and config flags,
 * with the scarcity note directly beneath it.
 *
 * The note lives here rather than in PriceBlock so that "Limited Availability"
 * and "Only 3 left - Rent soon!" occupy the SAME slot with the same styling —
 * they're two readings of the same signal and never appear together, so having
 * one under the button and the other under the price looked like a bug. This
 * also replaces three per-layout urgency slots (.sl-urgency, .sl-lc-urgency,
 * .sl-dv-urgency) with one.
 *
 * OWNS ITS COLUMN. It returns the button's column AND the note as SIBLINGS, so
 * the note is a direct child of the price+button row and can span it. Nested
 * inside the column, it was trapped at the button's width — and, being one
 * line, it dragged the column out to `max-content` and pushed the whole row
 * past the card's padding, which is how the button ended up hanging off the
 * page. `colClass` is the per-layout column, which each caller used to wrap
 * this in.
 */
export function CtaButton({ unit, config, full, colClass }: {
  unit: Unit; config: WidgetConfig; full?: boolean; colClass: string;
}) {
  const fullClass = full ? ' sl-select-full' : '';

  // Unavailable = no vacancy, or flagged waitlist. Reaching here means
  // showUnavailableUnits is on (it's the only thing that lets these into the
  // listing), and enableWaitlist then picks the CTA: "Join waitlist" when on,
  // "Call" when off. Either way a sold-out unit can never fall through to
  // "Select" — it's the first branch.
  const unavailable = isUnavailable(unit);
  const waitlistCta = unavailable && config.enableWaitlist;

  // Separate feature, for units that ARE available: tiers flagged call-only show
  // "Call" when the client has that switched on.
  const callOnly = !unavailable && unit.availability === 'call' && config.callOnLimitedAvailability;

  // Sold out states the fact; anything else can only offer scarcity.
  const note = unavailable ? config.limitedAvailabilityCopy : urgencyMessage(unit, config);

  const [tiersError, setTiersError] = useState(false);
  function openValueTiers() {
    const handled = emitOpenTiers({
      size: unit.dimensions,
      unitGroupId: unit.unitGroupId,
      unitId: unit.id,
      propertyId: config.propertyId || cfg.propertyId || undefined,
      channel: config.valueTiersChannel || undefined,
      // Mirror the operator's Space List config so #14 doesn't need it re-entered.
      ctaLabel: config.ctaButtonCopy || undefined,
      feeText: config.showJunkFeeDisclaimer ? (config.junkFeeCopy || '') : '',
      showPricingDetails: config.showJunkFeeDisclaimer,
      showUrgency: config.showUrgencyMessage,
      enablePromoLogic: config.enablePromoLogic,
    });
    if (handled) return;
    if (config.valueTiersPageUrl) {
      try {
        const url = new URL(config.valueTiersPageUrl, window.location.origin);
        if (url.origin === window.location.origin) {
          url.searchParams.set('size', unit.dimensions);
          if (unit.unitGroupId) url.searchParams.set('unitGroupId', unit.unitGroupId);
          url.searchParams.set('enablePromoLogic', config.enablePromoLogic ? 'true' : 'false');
          // Carry the ACTUAL property + company so the value-tiers page prices
          // the same unit group (critical on dynamic property pages).
          if (config.propertyId) url.searchParams.set('propertyId', config.propertyId);
          if (config.companyId) url.searchParams.set('companyId', config.companyId);
          // Duda's dmAPI (page global) tells us the environment. On 'live' route on
          // the real origin; in editor/preview keep it relative so Duda's preview
          // routing handles it. dmAPI is absent off-platform (e.g. dev harness).
          const dm = (window as unknown as { dmAPI?: { getCurrentEnvironment?: () => string } }).dmAPI;
          const isLive = typeof dm !== 'undefined' && dm?.getCurrentEnvironment?.() === 'live';
          const path = url.pathname + url.search;
          window.location.href = isLive ? window.location.origin + path : path;
          return;
        }
        console.error('[SpaceList] valueTiersPageUrl blocked — cross-origin:', config.valueTiersPageUrl);
      } catch { /* malformed URL → fall through to the message */ }
    }
    console.warn('[SpaceList] Value Tiers enabled but no modal handled the Select — place a mode="modal" #14 on this page.');
    setTiersError(true);
    window.setTimeout(() => setTiersError(false), 4000);
  }

  // Page mode: a real anchor so Duda's router handles the nav in preview AND
  // published — window.location bypasses Duda's preview routing (→ my.duda.co
  // 404). Carries the same params the modal handoff does.
  const valueTiersHref = (() => {
    if (!config.enableValueTiers || !config.valueTiersPageUrl) return undefined;
    const p = new URLSearchParams({ size: unit.dimensions });
    if (unit.unitGroupId) p.set('unitGroupId', unit.unitGroupId);
    if (config.propertyId) p.set('propertyId', config.propertyId);
    if (config.companyId) p.set('companyId', config.companyId);
    return `${config.valueTiersPageUrl}?${p.toString()}`;
  })();

  return (
    <>
      <div className={colClass}>
      {waitlistCta ? (
        <button className={`sl-waitlist-btn${fullClass}`}>Join waitlist</button>
      ) : unavailable || callOnly ? (
        <button className={`sl-call-btn${fullClass}`}>Call</button>
      ) : valueTiersHref ? (
        <a className={`sl-select-btn${fullClass}`} href={valueTiersHref}>
          {config.ctaButtonCopy}
        </a>
      ) : config.enableValueTiers ? (
        <button
          className={`sl-select-btn${fullClass}`}
          onClick={openValueTiers}
          disabled={tiersError}
        >
          {config.ctaButtonCopy}
        </button>
      ) : (
        // No value-tiers step configured: Select goes straight to the rental
        // page. An anchor, not a button — Duda's router handles a real link in
        // preview and published alike, and it keeps middle-click and "open in
        // new tab" working. The unit travels in localStorage (see
        // @shared/unitHandoff), so the href stays a clean /rental.
        <a
          className={`sl-select-btn${fullClass}`}
          href={rentalHref(config.rentalPageUrl)}
          onClick={() => saveUnitSelection({
            tierId: unit.id,
            unitGroupId: unit.unitGroupId,
            size: unit.dimensions,
            // The rental flow matches a real unit on size AND price, so the
            // shopper gets the tier they clicked, not the cheapest of that size.
            price: unit.startingPrice,
            propertyId: config.propertyId || cfg.propertyId || undefined,
            companyId: config.companyId || undefined,
          })}
        >
          {config.ctaButtonCopy}
        </a>
      )}
      </div>
      {/* Outside the column, so it measures against the ROW. Both messages keep
          the one slot they have always shared. */}
      {tiersError
        ? <div className="sl-limited-label" role="alert">Pricing is temporarily unavailable — please try again.</div>
        : note && <div className="sl-limited-label">{note}</div>}
    </>
  );
}
