import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './TierSelection.css';
import {
  fetchUnitGroups, resolveUnitGroupId, fetchOffers, mapOffersToTiers,
  fetchProperty, fetchTierQuote, defaultContext,
  type TierContext,
} from './api';
import { Shimmer } from '@shared/Shimmer';
import { MoneyBreakdown, SummaryRail, formatPrice, CloseCircleIcon } from '@shared/ui';
import { Button } from '@shared/ui/Button';
import { resolvePropertyId } from '@shared/propertyBinding';
import { resolveCompanyIdFromSources } from '@shared/companySource';
import {
  CheckIcon,
  CheckCircle,
  InfoCircle,
  PromoStar,
  TagIcon,
  PlayCircle,
  ChevronDown,
} from './icons';

// ---------------------------------------------------------------------------
// Widget #14 — Tier Selection ("Value Tiers" page).
// Responsive: renders Layout 1 (desktop: selector + comparison table + order-
// summary card) at wide widths and Layout 2 (mobile: centred header, stacked
// selector, collapsible move-in total, compact table) below 640px.
// Figma: Mariposa — Duda — 8551-26950 / 8551-27233 (desktop),
// 8245-6641 / 8245-6718 (mobile).
// ---------------------------------------------------------------------------

import type {
  TierKey, Tier, RowType, FeatureRow, O2Tier, O3Tier, O3Row, O3Weight, TierData, TierQuoteState,
} from './types';
import { onOpenTiers, isValidTierRequest } from '@shared/tierBus';

// Branded Small/Medium/Large size illustrations served from Cloudinary — the
// same CDN assets the live Storage Outlet site uses, so they stay out of the JS
// bundle and get normal CDN/browser caching. f_auto,q_auto,w_360 lets
// Cloudinary pick a modern format and an appropriate width.
const SIZE_CATEGORY_IMAGES = {
  small: 'https://res.cloudinary.com/storelocal/image/fetch/f_auto,q_auto,w_360/https%3A//d2i6hs4yervu5x.cloudfront.net/website/size-category/Small.png',
  medium: 'https://res.cloudinary.com/storelocal/image/fetch/f_auto,q_auto,w_360/https%3A//d2i6hs4yervu5x.cloudfront.net/website/size-category/Medium.png',
  large: 'https://res.cloudinary.com/storelocal/image/fetch/f_auto,q_auto,w_360/https%3A//d2i6hs4yervu5x.cloudfront.net/website/size-category/Large.png',
} as const;

// Presentation-only: map a unit size ("10' x 25'") to a size-category image by
// area. Prefer an API/CMS category if one is ever provided. Thresholds mirror
// the live site's Small/Medium/Large grouping.
function sizeCategoryImage(size?: string): string {
  const [w, d] = (size ?? '').toLowerCase().replace(/[^\dx.]/g, '').split('x').map(Number);
  if (!w || !d) return SIZE_CATEGORY_IMAGES.small;
  const area = w * d;
  if (area <= 60) return SIZE_CATEGORY_IMAGES.small;
  if (area < 200) return SIZE_CATEGORY_IMAGES.medium;
  return SIZE_CATEGORY_IMAGES.large;
}

// Broken/blocked size image → collapse to the neutral placeholder box.
function onSizeImgError(e: React.SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.classList.add('ts-unit-img--placeholder');
  e.currentTarget.removeAttribute('src');
}

function onHeroImgError(e: React.SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.classList.add('ts-card-hero-img--placeholder');
  e.currentTarget.removeAttribute('src');
}

function activateOnKey(activate: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  };
}

// Neutral empty context default — structurally valid, renders nothing. The
// live layout only mounts in the 'live' state (real TierData); this default
// is never shown as tiers. No sample prices/names live in this module.
const EMPTY_DATA: TierData = {
  tiers: [], rows: [], o2: [], o3: [], rows3: [],
  o3Hours: { good: '', better: '', best: '' },
  sizeImage: sizeCategoryImage(), sizeAlt: '',
};

const TierDataContext = React.createContext<TierData>(EMPTY_DATA);
const useTierData = () => React.useContext(TierDataContext);

/**
 * Tier CTA adapter around the shared UI Button. Transaction/link semantics,
 * disabled handling and interaction states stay centralized in @shared/ui;
 * the class variants below preserve this widget's Figma-specific dimensions.
 */
function TierSelectCta({
  tierKey,
  selected = true,
  soldOut = false,
  variant = 'cards',
  stopPropagation = false,
}: {
  tierKey: TierKey;
  selected?: boolean;
  soldOut?: boolean;
  variant?: 'option1' | 'option1-mobile' | 'cards' | 'cards-mobile';
  stopPropagation?: boolean;
}) {
  const { rentHref, onSelectClick, ctaLabel } = useTierData();
  const href = soldOut ? undefined : rentHref?.(tierKey);
  const className = [
    'ts-tier-cta',
    `ts-tier-cta--${variant}`,
    soldOut ? 'ts-tier-cta--soldout' : '',
  ].filter(Boolean).join(' ');
  const content = ctaLabel ?? 'Select';
  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    onSelectClick?.(tierKey)(e);
  };

  return href ? (
    <Button
      tone="cta"
      fill={selected ? 'solid' : 'outline'}
      block
      href={href}
      className={className}
      onClick={handleClick}
    >
      {content}
    </Button>
  ) : (
    <Button
      tone="cta"
      fill={selected && !soldOut ? 'solid' : 'outline'}
      block
      disabled
      className={className}
    >
      {content}
    </Button>
  );
}

const TAGLINES: Record<TierKey, string> = {
  good: 'Lowest Rate', better: 'Best Value', best: 'Most Features',
};

const HOURS_24_RE = /24[\s-]?hour/i;

/** Map offers-derived bundles onto the render data. Tier keys/labels come
 *  from the server (value_tier); a 24-hour-access amenity shows "24 Hours",
 *  else the facility's gate hours, else blank (no demo hours). */
const TIER_SLOTS: TierKey[] = ['good', 'better', 'best'];

// Scarcity threshold — matches the Space List's default urgencyThreshold.
const URGENCY_THRESHOLD = 5;

function buildTierData(data: import('./api').ValueTierData, facilityHours?: string, vacant?: number, enablePromoLogic = true): TierData {
  // Assign each offer to its OWN authoritative tier slot — never relocate an
  // offer between keys; the key is its selection + rental-flow handoff identity.
  const bySlot: Partial<Record<TierKey, import('./api').ValueTierBundle>> = {};
  for (const b of data.bundles) bySlot[b.key] = b;
  // Preserve the operator label on sold-out tiers (e.g. "Standard — Sold Out",
  // not the internal "Better").
  const soldOutLabel = new Map<TierKey, string | undefined>(data.soldOutTiers.map((t) => [t.key, t.label]));

  // Render only CONFIGURED tiers, in Good→Better→Best order: an available
  // offer, or a tier the API explicitly reports sold out. A tier the API omits
  // is "not configured" and is not shown (no unsupported sold-out claim).
  const slots = TIER_SLOTS.filter((k) => bySlot[k] || soldOutLabel.has(k));

  const tiers: Tier[] = slots.map((k) => {
    const b = bySlot[k];
    if (!b) {
      return { key: k, name: soldOutLabel.get(k) ?? k[0].toUpperCase() + k.slice(1), tagline: TAGLINES[k], price: 0, hours: '', summary: 'Sold Out', features: [], soldOut: true };
    }
    return {
      key: k,
      name: b.label ?? k[0].toUpperCase() + k.slice(1),
      tagline: TAGLINES[k],
      price: b.price,
      hours: b.features.some((f) => HOURS_24_RE.test(f)) ? '24 Hours' : facilityHours ?? '',
      promoRate: enablePromoLogic ? b.promoRate : undefined,
      summary: b.features[0] ?? TAGLINES[k],
      promo: enablePromoLogic ? b.promo : undefined,
      features: b.features.slice(0, 6),
      unitId: b.unitId,
    };
  });
  const hasKey = (k: TierKey, label: string) => !!bySlot[k]?.features.includes(label);
  const checkRows = data.featureLabels.slice(0, 6).map((label, ri) => ({
    label,
    good: hasKey('good', label),
    better: hasKey('better', label),
    best: hasKey('best', label),
    bold: ri === 0,
  }));

  const rows: FeatureRow[] = [
    { label: 'Monthly Rent', type: 'price', bold: true },
    ...checkRows.map((r) => ({ ...r, type: 'check' as RowType })),
  ];

  const o2: O2Tier[] = tiers.map((t) => ({
    key: t.key,
    name: t.name,
    tagline: t.tagline,
    price: t.price,
    promoRate: t.promoRate,
    promo: t.promo,
    soldOut: t.soldOut,
    // Pricing cards intentionally show only the four highest-priority website
    // amenities. The API has already applied show_in_website + sort_order.
    features: (t.features ?? []).slice(0, 4).map((label) => ({ label })),
  }));

  const o3: O3Tier[] = tiers.map((t) => ({
    key: t.key,
    name: t.name,
    tagline: t.tagline,
    price: t.price,
    promoRate: t.promoRate,
    promo: t.promo,
    soldOut: t.soldOut,
  }));

  const rows3: O3Row[] = [
    ...checkRows.map((r, i) => ({
      label: r.label,
      type: 'check' as const,
      weight: (i === 0 ? 'bold' : 'medium') as O3Weight,
      gray: i === 0,
      good: r.good,
      better: r.better,
      best: r.best,
    })),
  ];

  const o3Hours: Record<TierKey, string> = { good: '', better: '', best: '' };
  for (const t of tiers) o3Hours[t.key] = t.hours;

  return {
    tiers, rows, o2, o3, rows3, o3Hours,
    live: true,
    size: data.size,
    // Real scarcity from the size's live vacancy (same rule + wording as the
    // Space List): show "Only N left" only when vacancy is known and low.
    urgency: vacant != null && vacant > 0 && vacant <= URGENCY_THRESHOLD
      ? `Only ${vacant} left - Rent soon!`
      : undefined,
    sizeImage: sizeCategoryImage(data.size),
    sizeAlt: `${data.size} storage unit`,
  };
}

export interface TierSelectionProps {
  /** 'option1' = selector + comparison table (+ order card on desktop);
   *  'option2' = three Good/Better/Best pricing cards;
   *  'option3' = pricing cards fused with a comparison table. */
  variant?: 'option1' | 'option2' | 'option3';
  /** 'inline' (default) = render in place (a Value Tiers page or embedded).
   *  'modal' = render nothing until the Space List fires the open event, then
   *  show the tiers as an overlay for that size (same bundle, popup UX). */
  mode?: 'inline' | 'modal';
  /** Optional instance channel for modal mode. If set, this modal only opens for
   *  events carrying the same `channel` — disambiguates multiple modals/page. */
  channel?: string;
  heading?: string;
  subheading?: string;
  headingMobile?: string;
  /** Operator-overridable heading color (Duda content field). Defaults to
   *  #101318 (black) and always wins over the host theme. */
  titleColor?: string;
  urgency?: string;
  promo?: string;
  /** Operator-editable admin-fee note shown in the header (Options 1 & 2) and
   *  on Option-2 mobile. The fee varies per facility, so it's configurable. */
  adminFeeText?: string;
  /** Which unit size this instance sells, e.g. "10' x 10'" or "10x10".
   *  Set per page in the Duda content panel; unset = dev auto-pick. An
   *  unknown size shows the fallback + logs — never a different product. */
  size?: string;
  /** AUTHORITATIVE group id (tier_id) for inline mode — bind from the `?unitGroupId=`
   *  URL param on the fallback page so a same-dimensions sibling is never chosen.
   *  When present it wins over size resolution. */
  unitGroupId?: string;
  /** Facility this instance prices and quotes against — threaded through every
   *  call so tiers/units/quotes can never mix facilities. */
  propertyId?: string;
  companyId?: string;
  /** Preselect a tier by value type ('good'|'better'|'best'); unknown = default. */
  tier?: string;
  /** Operator-configured default selected tier (good|better|best). */
  defaultTier?: string;
  /** CTA button label — carried from the Space List's Button field (§12). Default 'Select'. */
  ctaLabel?: string;
  /** Show the quote-backed Pricing Details breakdown on desktop and mobile. */
  showPricingDetails?: boolean;
  /** Match Space List's promotion-pricing toggle. Duda may pass booleans as strings. */
  enablePromoLogic?: boolean | string;
  /** Where Select navigates (the rental-flow page). Carries
   *  ?size=&unitId=&tier=; same-origin only. Empty = inert. */
  rentUrl?: string;
  /** Duda runtime trio, passed by the Widget Builder shim (see #05's shim
   *  for the pattern). inEditor gates editor-vs-published behavior (the
   *  planned fail-closed rule keys off it); siteId/elementId identify this
   *  placement for observability and future per-site config lookups. */
  inEditor?: boolean;
  siteId?: string;
  elementId?: string;
}

// Container-width breakpoint: below this we render the mobile layout.
const MOBILE_BP = 640;

// Skeleton only appears past this delay, so fast responses never flash it.
// 0 = show the placeholder skeleton from the first frame (paired with the
// reserved wrapper min-height below) so the page never collapses then expands.
const SKELETON_DELAY_MS = 0;

// Placeholders reuse the real layout containers (.ts-grid / .ts-o2 geometry)
// so the skeleton occupies exactly the footprint the content replaces.
// Shimmer itself is inline-styled by design (shared across bundles, no shared CSS).
function TierSkeleton({ variant, isMobile, chromeless }: { variant: 'option1' | 'option2' | 'option3'; isMobile?: boolean; chromeless?: boolean }) {
  if (isMobile) {
    // Stacked mobile placeholder — reserves the mobile layout's footprint (both
    // good/better/best and select+table+card collapse to a single column) so the
    // footer doesn't jump when data lands.
    return (
      <div aria-hidden="true" style={{ maxWidth: 640, margin: '0 auto' }}>
        {!chromeless && (
          <>
            <Shimmer w={280} h={30} mb={12} style={{ maxWidth: '80%' }} />
            <Shimmer w={200} h={16} mb={20} style={{ maxWidth: '60%' }} />
          </>
        )}
        <Shimmer h={48} r={24} mb={16} />
        <Shimmer h={300} r={12} mb={16} />
        <Shimmer h={52} r={8} mb={16} />
        <Shimmer h={60} r={8} />
      </div>
    );
  }
  if (variant === 'option1') {
    // Mirrors DesktopLayout: left = header + picker row + comparison table,
    // right = the 422px order-summary card.
    return (
      <div className="ts-grid" aria-hidden="true">
        <div>
          {!chromeless && (
            <>
              <Shimmer w={480} h={40} mb={14} style={{ maxWidth: '80%' }} />
              <Shimmer w={340} h={18} mb={28} style={{ maxWidth: '60%' }} />
            </>
          )}
          <div style={{ display: 'flex', gap: 32, marginBottom: 32 }}>
            <Shimmer w={220} h={220} r={12} style={{ flex: '0 0 auto' }} />
            <div style={{ flex: 1 }}>
              <Shimmer h={64} r={12} mb={16} />
              <Shimmer h={40} r={8} mb={16} style={{ maxWidth: '70%' }} />
              <Shimmer h={80} r={8} />
            </div>
          </div>
          <Shimmer h={320} r={12} />
        </div>
        <Shimmer h={560} r={12} />
      </div>
    );
  }
  // option2 / option3: three tier cards, same caps as .ts-o2-cards.
  return (
    <div aria-hidden="true" style={{ maxWidth: 1320, margin: '0 auto' }}>
      {!chromeless && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Shimmer w={420} h={28} mb={10} style={{ maxWidth: '80%' }} />
          <Shimmer w={300} h={16} mb={28} style={{ maxWidth: '60%' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 28, justifyContent: 'center' }}>
        {[0, 1, 2].map((i) => (
          <Shimmer key={i} h={340} r={12} style={{ flex: '0 1 422px' }} />
        ))}
      </div>
    </div>
  );
}

function useIsMobile(breakpoint: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Synchronous CONTAINER-width seed before paint: the viewport guess
    // above is wrong in narrow embed columns, and RO's first callback is
    // async (and never fires in hidden tabs) — this fixes both.
    setIsMobile(el.getBoundingClientRect().width < breakpoint);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      setIsMobile(entries[0].contentRect.width < breakpoint);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [breakpoint]);
  return { ref, isMobile };
}

export function TierSelection({
  variant = 'option1',
  mode = 'inline',
  channel,
  heading: headingProp,
  subheading = 'Choose a package that gives you features and flexibility.',
  headingMobile: headingMobileProp,
  titleColor,
  urgency: urgencyProp,
  promo: promoProp,
  adminFeeText = '$30 Admin fee applied to all transactions',
  size: sizeRaw,
  unitGroupId: unitGroupIdProp,
  propertyId: propertyIdProp,
  companyId: companyIdProp,
  tier: tierProp,
  defaultTier,
  ctaLabel = 'Select',
  showPricingDetails = true,
  enablePromoLogic: enablePromoLogicRaw = true,
  rentUrl,
  inEditor = false,
  siteId,
  elementId,
}: TierSelectionProps) {
  const [selected, setSelected] = useState<TierKey>('better');
  const [featuredTier, setFeaturedTier] = useState<TierKey>('better');
  const { ref, isMobile } = useIsMobile(MOBILE_BP);

  // Modal mode: closed until the Space List fires the open event, which carries
  // the AUTHORITATIVE product (unitGroupId + size). Inline mode ignores all of
  // this and uses the `size` prop.
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSize, setModalSize] = useState<string | undefined>(undefined);
  const [modalUnitGroupId, setModalUnitGroupId] = useState<string | undefined>(undefined);
  // The property the Space List emitted for the clicked product (dynamic pages).
  const [modalPropertyId, setModalPropertyId] = useState<string | undefined>(undefined);
  // CTA + fee text mirrored from the Space List over the open event (configure once).
  const [modalCtaLabel, setModalCtaLabel] = useState<string | undefined>(undefined);
  const [modalFeeText, setModalFeeText] = useState<string | undefined>(undefined);
  const [modalShowPricingDetails, setModalShowPricingDetails] = useState<boolean | undefined>(undefined);
  const [modalShowUrgency, setModalShowUrgency] = useState<boolean | undefined>(undefined);
  const [modalEnablePromoLogic, setModalEnablePromoLogic] = useState<boolean | undefined>(undefined);
  // Bumped on every open so reopening the SAME size still refetches (inventory
  // and pricing can change between opens).
  const [openGen, setOpenGen] = useState(0);
  useEffect(() => {
    if (mode !== 'modal' || !modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, modalOpen]);
  // A11y on open: remember the trigger, lock background scroll, move focus into
  // the dialog; on close, unlock and restore focus to the trigger (the Select).
  const modalRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (mode !== 'modal' || !modalOpen) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    // iOS Safari ignores `overflow:hidden` on <body> for touch scroll, so pin the
    // body in place (preserving the scroll position) and restore it on close.
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    (modalRef.current?.querySelector('.ts-modal-close') as HTMLElement | null)?.focus();
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
      restoreFocusRef.current?.focus?.();
    };
  }, [mode, modalOpen]);
  // Keep Tab focus inside the open dialog.
  const trapFocus = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const f = modalRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  // The size actually priced: the modal's requested size in modal mode, else the
  // prop. In modal mode the group id is authoritative (from the clicked card).
  // Page (inline) mode: fall back to the ?size / ?unitGroupId that the Space List
  // passes when it navigates here, so a dedicated Value-Tiers page works without
  // custom Duda initWidget glue.
  const urlParam = (k: string): string | undefined => {
    try { return new URLSearchParams(window.location.search).get(k) || undefined; } catch { return undefined; }
  };
  const sizeProp = mode === 'modal' ? modalSize : (sizeRaw || urlParam('size'));
  const authoritativeGroupId = mode === 'modal' ? modalUnitGroupId : (unitGroupIdProp || urlParam('unitGroupId'));
  const inlinePromoRaw = urlParam('enablePromoLogic') ?? enablePromoLogicRaw;
  const inlinePromoEnabled = inlinePromoRaw === true || inlinePromoRaw === 'true';
  const effectivePromoLogic = mode === 'modal'
    ? (modalEnablePromoLogic ?? inlinePromoEnabled)
    : inlinePromoEnabled;

  const cfgDefaults = React.useMemo(() => defaultContext(), []);
  const effectivePropertyId = resolvePropertyId({ propertyId: propertyIdProp || urlParam('propertyId') }, cfgDefaults.propertyId);
  // On a dynamic page the modal adopts the property Space List emitted (the
  // authoritative facility for the clicked product) as its API context; inline
  // and pre-open it falls back to this widget's own config. companyId always
  // comes from this widget's config — a Duda site is one company.
  const activePropertyId = mode === 'modal' ? (modalPropertyId ?? effectivePropertyId) : effectivePropertyId;
  const [effectiveCompanyId, setEffectiveCompanyId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveCompanyIdFromSources('#14 tier-selection', { companyId: companyIdProp || urlParam('companyId') }, cfgDefaults.companyId)
      .then((id) => { if (!cancelled) setEffectiveCompanyId(id); })
      .catch((err) => {
        console.error('[TierSelection] company id resolve error:', err);
        if (!cancelled) setEffectiveCompanyId(cfgDefaults.companyId);
      });
    return () => { cancelled = true; };
  }, [companyIdProp, cfgDefaults.companyId]);
  const ctx: TierContext = React.useMemo(
    () => ({ propertyId: activePropertyId, companyId: effectiveCompanyId ?? '' }),
    [activePropertyId, effectiveCompanyId],
  );

  // Modal open requests from Space List. Channel (if set) is the only routing
  // gate; the modal adopts the emitted property + unit-group as its API context.
  useEffect(() => {
    if (mode !== 'modal') return;
    return onOpenTiers((req) => {
      if (!isValidTierRequest(req)) return false; // ignore malformed
      // Channel is the ONLY instance-routing gate: if either side sets a channel,
      // both must match. Property is NOT a gate — an unchanneled modal serves
      // whatever facility Space List emits and ADOPTS it as the active API context
      // (see activePropertyId), so all endpoints hit the right property. The site
      // is one company, so any emitted property is in-tenant; the backend still
      // validates the property/group pairing.
      if (channel || req.channel) {
        if (!channel || req.channel !== channel) return false;
      }
      setModalSize(req.size);
      setModalUnitGroupId(req.unitGroupId);
      setModalPropertyId(req.propertyId);
      setModalCtaLabel(req.ctaLabel);
      setModalFeeText(req.feeText);
      setModalShowPricingDetails(req.showPricingDetails);
      setModalShowUrgency(req.showUrgency);
      setModalEnablePromoLogic(req.enablePromoLogic);
      setOpenGen((g) => g + 1);
      setModalOpen(true);
      return true; // accepted → acknowledge
    });
  }, [mode, channel]);

  // Explicit load state machine. There is NO demo data: the layout renders
  // only in 'live' (real tiers). Every other outcome is 'loading' (skeleton),
  // 'disabled' (proxy showTierPricing=false) or 'unavailable' (explicit message).
  const [data, setData] = useState<TierData | null>(null);
  const [quotes, setQuotes] = useState<Partial<Record<TierKey, TierQuoteState>>>({});
  const [status, setStatus] = useState<'loading' | 'live' | 'disabled' | 'unavailable' | 'soldout'>('loading');
  const [pastDelay, setPastDelay] = useState(false);

  const bundlesRef = useRef<import('./api').ValueTierBundle[]>([]);
  const tzRef = useRef<string | undefined>(undefined);
  const groupIdRef = useRef<string | undefined>(undefined);
  const requested = useRef<Set<TierKey>>(new Set());
  const ensureQuote = useCallback((key: TierKey) => {
    if (requested.current.has(key)) return;
    const b = bundlesRef.current.find((x) => x.key === key);
    if (!b) return;
    requested.current.add(key);
    setQuotes((prev) => ({ ...prev, [key]: { status: 'pending' } }));
    // enablePromoLogic is presentation-only, matching Space List. Always send
    // the offer's promotions so the authoritative move-in total remains
    // accurate and checkout can apply every promotion the customer qualifies
    // for, even when promotional price/copy is hidden in this widget.
    fetchTierQuote(ctx, {
      unitId: b.unitId,
      rent: b.price,
      promotionIds: b.promotionIds,
      promoName: b.promo,
      timezone: tzRef.current,
    })
      .then((result) => setQuotes((prev) => ({ ...prev, [key]: result })));
  }, [ctx]);

  /** Navigate without taking inventory first. Rental Flow verifies the exact
   * handed-off offer and owns hold creation at Step 2. Holding here made the
   * offers endpoint omit that same unit on the destination page, which the
   * strict correlation check correctly refused but mislabeled unavailable. */
  const onSelectClick = useCallback((key: TierKey) => (e: React.MouseEvent) => {
    // Leave the browser to handle the ways a user asks for a new tab.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const href = rentHrefRef.current?.(key);
    if (!href) return;
    e.preventDefault();
    const go = (target: string) => {
      const dm = (window as unknown as { dmAPI?: { getCurrentEnvironment?: () => string } }).dmAPI;
      const isLive = typeof dm !== 'undefined' && dm?.getCurrentEnvironment?.() === 'live';
      window.location.href = isLive ? window.location.origin + target : target;
    };
    go(href);
  }, []);



  React.useEffect(() => {
    let cancelled = false;
    // Reset for the new context so a previous facility's tiers/quotes can't
    // linger while the new requests run (and can't survive an empty result).
    setStatus('loading');
    setData(null);
    setQuotes({});
    requested.current.clear();
    setSelected('better');
    setPastDelay(false);
    if (effectiveCompanyId === null) return () => { cancelled = true; };
    if (!ctx.propertyId || !ctx.companyId) {
      console.error('[TierSelection] not configured — propertyId and companyId are required');
      setStatus('unavailable');
      return () => { cancelled = true; };
    }
    const timer = setTimeout(() => { if (!cancelled) setPastDelay(true); }, SKELETON_DELAY_MS);

    const where = [siteId && `site ${siteId}`, elementId && `element ${elementId}`].filter(Boolean).join(', ');
    const unavailable = (why: string, err?: unknown) => {
      if (cancelled) return;
      console.error(`[TierSelection] tiers unavailable — ${why}${where ? ` [${where}]` : ''}`, err ?? '');
      setStatus('unavailable');
    };

    // No handoff size/unitGroup (standalone page, editor, or a direct visit):
    // fall through and auto-pick the property's most-vacant size so real tiers
    // still render. When reached via Select, the authoritative size/unitGroupId
    // from the URL are used instead.

    // unit-groups → the size's unitGroupId; offers → the tiers + showTierPricing
    // gate (all server-computed).
    void (async () => {
      // Authoritative path (modal): the clicked card's group id — quote exactly
      // that product, no ambiguous re-resolution by display size. Otherwise
      // resolve the group from the size (inline / legacy).
      const groupReq = authoritativeGroupId
        // Handoff group id: still fetch groups to read the size's live vacancy
        // (for the "Only N left" line) — matched by exact id, so no ambiguous
        // re-resolution. Falls back gracefully if the groups call fails.
        ? fetchUnitGroups(ctx)
            .then((groups) => {
              const g = groups.find((x) => x.unitGroupId === authoritativeGroupId);
              return { unitGroupId: authoritativeGroupId, size: g?.size ?? sizeProp ?? '', vacant: g?.vacant };
            })
            .catch(() => ({ unitGroupId: authoritativeGroupId, size: sizeProp ?? '', vacant: undefined }))
        : fetchUnitGroups(ctx).then((groups) => resolveUnitGroupId(groups, sizeProp, true));
      // Bypass the browser GET cache on a modal open so a reopen never shows a
      // client-cached offer set (the proxy still applies its own short cache).
      const freshOffers = mode === 'modal';
      const tiersReq = groupReq
        .then((grp) => (grp
          ? fetchOffers(ctx, grp.unitGroupId, { fresh: freshOffers }).then((res) => ({ showTierPricing: res.showTierPricing, soldOut: res.soldOut, value: mapOffersToTiers(res.offers, grp.size), unitGroupId: grp.unitGroupId, vacant: grp.vacant }))
          : undefined));
      const propReq = fetchProperty(ctx).catch((err) => {
        console.error('[TierSelection] fetchProperty error:', err);
        return undefined;
      });
      try {
        const [tiers, property] = await Promise.all([tiersReq, propReq]);
        if (cancelled) return;
        if (!tiers) {
          unavailable(sizeProp ? `no offers for requested size ${JSON.stringify(sizeProp)}` : 'no value-tier offers found');
          return;
        }
        // Proxy-computed gate: showTierPricing=false → standard experience.
        // Whole size sold out (proxy normalized the verified no-vacancy
        // response, or every configured tier came back unavailable).
        if (tiers.soldOut) { console.info('[TierSelection] size sold out — no available units'); setStatus('soldout'); return; }
        if (!tiers.showTierPricing) { console.info('[TierSelection] showTierPricing=false — value tiers not shown'); setStatus('disabled'); return; }
        // showTierPricing true (2+ configured) but nothing mapped to an
        // available bundle — defensive; treated as sold out.
        if (!tiers.value) { console.info('[TierSelection] all configured tiers sold out'); setStatus('soldout'); return; }
        const value = tiers.value;
        setData({ ...buildTierData(value, property?.gateHours, tiers.vacant, effectivePromoLogic), property });
        setStatus('live');
        bundlesRef.current = value.bundles;
        tzRef.current = property?.timezone;
        groupIdRef.current = tiers.unitGroupId;
        // Default selection: the handoff tier if valid, else a real (not
        // sold-out) tier — never land the selector on a sold-out slot.
        const realKeys = value.bundles.map((b) => b.key);
        const handoff = tierProp && realKeys.includes(tierProp as TierKey) ? (tierProp as TierKey) : undefined;
        if (tierProp && !handoff) console.warn(`[TierSelection] handoff tier ${JSON.stringify(tierProp)} not in offers — keeping default selection`);
        // Normalise the operator value: the content field may arrive as "Best"
        // or with stray whitespace, while realKeys are lowercase good/better/best.
        const normDefault = defaultTier?.trim().toLowerCase();
        const opDefault = normDefault && realKeys.includes(normDefault as TierKey) ? (normDefault as TierKey) : undefined;
        const initialTier = handoff ?? opDefault ?? (realKeys.includes('better') ? 'better' : realKeys[0]);
        setSelected(initialTier);
        setFeaturedTier(initialTier);
      } catch (err) {
        unavailable('offers fetch failed', err);
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); };
    // openGen reruns the effect on every modal open (even same size) and, in
    // modal mode, bypasses the browser GET cache (fresh); authoritativeGroupId
    // changes when a different card is clicked. The proxy's own ~15s offers
    // cache may still serve a very recent response — the uncached move-in quote
    // is the authoritative money figure.
  }, [mode, inEditor, siteId, elementId, sizeProp, authoritativeGroupId, openGen, ctx, tierProp, defaultTier, effectiveCompanyId, effectivePromoLogic]);

  useEffect(() => {
    if (status === 'live' && variant === 'option1') ensureQuote(selected);
  }, [status, variant, selected, ensureQuote]);

  // A 2-bundle tenant has no 'best' tier — never leave selection dangling.
  const live = status === 'live' && data != null;
  const tier = data ? (data.tiers.find((t) => t.key === selected) ?? data.tiers[data.tiers.length - 1]) : undefined;

  // Page context follows the data: real size in the headings, the selected
  // tier's own promotion, and a live "Only N Left" line — unless the caller
  // (Duda content panel) explicitly overrides them.
  const displaySize = data?.size?.replace(/'/g, '\u2019');
  const heading = headingProp
    ?? (displaySize ? `Select an Option for your ${displaySize}` : 'Select an Option');
  const headingMobile = headingMobileProp
    ?? (displaySize ? `Choose a ${displaySize} Option` : 'Choose an Option');
  const urgency = urgencyProp ?? data?.urgency ?? '';
  const promo = effectivePromoLogic ? (promoProp ?? tier?.promo ?? '') : '';
  const effectiveAdminFeeText = mode === 'modal'
    ? (modalFeeText ?? adminFeeText)
    : adminFeeText;

  // In modal mode the shell owns the header, so the body layouts render
  // chromeless — their own heading row is suppressed to avoid a duplicate.
  const chromeless = mode === 'modal';

  // Skeleton renders INSIDE the persistent wrapper: an early return with a
  // different tree would remount the wrapper div, detaching useIsMobile's
  // ResizeObserver — which then reports 0 width and forces the mobile layout.
  let body: React.ReactNode;
  if (status === 'loading') {
    // In the Duda editor (no handoff params) keep a visible skeleton so the
    // widget doesn't collapse to zero height and "vanish" — otherwise it can't
    // be seen or placed on the page.
    body = (pastDelay || mode === 'modal' || inEditor) ? <TierSkeleton variant={variant} isMobile={isMobile} chromeless={chromeless} /> : null;
  } else if (status === 'disabled') {
    // Business rule §1: Use Value Pricing = No → render nothing (operator
    // places the standard unit-selection widget instead).
    body = null;
  } else if (status === 'soldout') {
    // Every configured tier is sold out — an honest sold-out notice, never a
    // Select CTA or order card without an available unit.
    body = (
      <div className="ts-notice" role="status">
        {`This size${sizeProp ? ` (${sizeProp})` : ''} is currently sold out. Please check back soon or contact the facility.`}
      </div>
    );
  } else if (!live) {
    // 'unavailable' — NO demo fallback anywhere. Editor gets configuration
    // guidance; a visitor gets neutral, non-technical copy.
    body = (
      <div className="ts-notice" role="alert">
        {inEditor
          ? 'Live tier data is unavailable. Configure the facility and proxy connection to preview this widget.'
          : 'Pricing is temporarily unavailable. Please try again or contact the facility.'}
      </div>
    );
  } else if (variant === 'option2') {
    body = isMobile ? (
      <Option2Mobile heading={headingMobile} urgency={urgency} adminFeeText={effectiveAdminFeeText} chromeless={chromeless} />
    ) : (
      <Option2Layout heading={heading} subheading={subheading} urgency={urgency} adminFeeText={adminFeeText} chromeless={chromeless} />
    );
  } else if (variant === 'option3') {
    body = <Option3Layout heading={heading} subheading={subheading} urgency={urgency} adminFeeText={adminFeeText} chromeless={chromeless} />;
  } else {
    body = isMobile ? (
      <MobileLayout
        tier={tier!}
        selected={selected}
        setSelected={setSelected}
        heading={headingMobile}
        urgency={urgency}
        adminFeeText={effectiveAdminFeeText}
        promo={promo}
        chromeless={chromeless}
      />
    ) : (
      <DesktopLayout
        tier={tier!}
        selected={selected}
        setSelected={setSelected}
        heading={heading}
        subheading={subheading}
        urgency={urgency}
        adminFeeText={adminFeeText}
        promo={promo}
        chromeless={chromeless}
      />
    );
  }

  // Handoff to the rental flow: pass the selection as server-resolvable ids —
  // the chosen unit (authoritative) plus size and the tier type for display;
  // the receiver re-resolves availability. Never a unit id disguised as a tier.
  //
  // Returned as a ROOT-RELATIVE href so the CTA can be a real <a>: Duda's router
  // intercepts an anchor in editor/preview and the browser navigates on publish.
  // A programmatic window.location bypasses Duda's preview routing and 404s on
  // my.duda.co (same reason the Space List navigates via anchors). undefined ⇒
  // not navigable (no rentUrl / cross-origin) ⇒ the CTA renders disabled.
  const rentHref = (key: TierKey): string | undefined => {
    if (!rentUrl || !data) return undefined;
    const t = data.tiers.find((x) => x.key === key);
    let url: URL;
    try { url = new URL(rentUrl, window.location.origin); } catch { return undefined; }
    // Same-origin only: the rent page lives on this site. A cross-origin rentUrl
    // is a misconfiguration — refuse rather than leak the shopper.
    if (url.origin !== window.location.origin) {
      console.error('[TierSelection] rentUrl blocked — cross-origin refused:', rentUrl);
      return undefined;
    }
    if (data.size) url.searchParams.set('size', data.size);
    if (t?.unitId) url.searchParams.set('unitId', t.unitId);
    url.searchParams.set('tier', key);
    // Carry the facility + group so the rental page queries the right property
    // (not its config default) and the reserve write passes the ownership check.
    if (activePropertyId) url.searchParams.set('propertyId', activePropertyId);
    if (effectiveCompanyId) url.searchParams.set('companyId', effectiveCompanyId);
    const gid = authoritativeGroupId ?? groupIdRef.current;
    if (gid) url.searchParams.set('unitGroupId', gid);
    // Root-relative handoff, same as Space List. Note: like Space List, this only
    // resolves on the PUBLISHED site — in the Duda editor/preview it 404s on
    // my.duda.co (Duda doesn't route these cross-page links in the editor). Test
    // the handoff on the published site.
    return url.pathname + url.search;
  };

  // rentHref is declared after onSelectClick, so the callback reads it through
  // a ref rather than pulling the whole render into its dependency list.
  const rentHrefRef = useRef<((key: TierKey) => string | undefined) | undefined>(undefined);
  rentHrefRef.current = rentHref;

  const inner = (
    <div
      className={`ts-wrapper${status === 'loading' ? ` ts-wrapper--loading ts-wrapper--${variant}` : ''}`}
      ref={ref}
      style={{ ['--ts-title-color']: titleColor || '#101318' } as React.CSSProperties}
    >
      {live && data.notice && <div className="ts-notice">{data.notice}</div>}
      {body}
    </div>
  );

  return (
    <TierDataContext.Provider value={data ? {
      ...data,
      rentHref,
      onSelectClick,
      selected,
      setSelected,
      featuredTier,
      quotes,
      ensureQuote,
      ctaLabel: modalCtaLabel ?? ctaLabel,
      showPricingDetails: mode === 'modal'
        ? (modalShowPricingDetails ?? showPricingDetails)
        : showPricingDetails,
    } : EMPTY_DATA}>
      {mode === 'modal' ? (
        // Closed → render nothing at all. Open → an overlay the shopper can
        // dismiss (✕, backdrop click, or Esc). The panel stops click bubbling
        // so clicks inside don't close it.
        modalOpen ? (
          // Portaled to <body> so the fixed overlay escapes any transformed Duda
          // ancestor (which would otherwise trap position:fixed inside the page
          // and let the site's sticky nav paint over the modal).
          createPortal(
          <div className="ts-modal-backdrop" onClick={() => setModalOpen(false)}>
            <div
              className="ts-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Select an option${sizeProp ? ` for your ${sizeProp}` : ''}`}
              ref={modalRef}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={trapFocus}
              style={{ ['--ts-title-color']: titleColor || '#101318' } as React.CSSProperties}
            >
              {/* Fixed shell header — the single source of the modal's heading, so
                  the body layouts render chromeless (no duplicate header). */}
              <header className="ts-modal-header">
                <TierModalHeader
                  heading={isMobile ? headingMobile : heading}
                  subheading={isMobile ? undefined : subheading}
                  urgency={modalShowUrgency === false ? '' : urgency}
                  adminFeeText={isMobile ? undefined : effectiveAdminFeeText}
                  onClose={() => setModalOpen(false)}
                />
              </header>
              <div className="ts-modal-body">{inner}</div>
            </div>
          </div>,
          document.body,
          )
        ) : inEditor ? (
          // A closed modal renders nothing on the live site — but in the Duda
          // editor that makes it a zero-height, unselectable element. Show a
          // labelled placeholder so it can be selected and configured.
          <div className="ts-modal-editor-hint" role="note">
            <b>Value Tiers — Modal mode.</b> Hidden on the live site; opens as a
            popup when a shopper clicks “Select” in the Space List. To show it on
            a page instead, set this widget’s <b>mode</b> to <b>inline</b>.
          </div>
        ) : null
      ) : (
        inner
      )}
    </TierDataContext.Provider>
  );
}

// Modal shell header — the single heading row for modal mode: title + subheading
// on the left, urgency + admin fee on the right (centered on mobile via CSS). It
// lives in the fixed .ts-modal-header, so the body layouts render chromeless.
function TierModalHeader({ heading, subheading, urgency, adminFeeText, onClose }: {
  heading: string; subheading?: string; urgency?: string; adminFeeText?: string; onClose: () => void;
}) {
  return (
    <div className="ts-modal-heading">
      <div className="ts-modal-heading-main">
        <h2 className="ts-modal-title">{heading}</h2>
        {subheading && <p className="ts-modal-subtitle">{subheading}</p>}
      </div>
      <div className="ts-modal-actions">
        {(urgency || adminFeeText) && (
          <div className="ts-modal-meta">
            {urgency && <p className="ts-modal-urgency">{urgency}</p>}
            {adminFeeText && (
              <p className="ts-modal-admin">
                {adminFeeText}
                <InfoCircle size={22} className="ts-modal-admin-info" />
              </p>
            )}
          </div>
        )}
        {/* Filled disc: the CSS used to draw this by hand (a #101318 ::before
            behind a white &times;); the icon is the same mark and that pseudo is
            gone. 52 desktop / 32 mobile, but the SIZE LIVES IN CSS — see
            .ts-modal-close svg. The filled mark is a plain <rect rx=26> and two
            strokes, all of which scale losslessly with the viewBox, so unlike
            #03's OUTLINED mark there is no per-size geometry for a prop to
            pick and no breakpoint for this component to know about. */}
        <button type="button" className="ts-modal-close" aria-label="Close" onClick={onClose}>
          <CloseCircleIcon size={52} />
        </button>
      </div>
    </div>
  );
}

// ── Quote-aware breakdown pieces (real when quotes[tierKey] exists) ─────────

// One honest sentence per non-ok quote state — the user always knows WHY
// there are no numbers (money policy: never demo figures).
const QUOTE_STATE_COPY: Record<string, string> = {
  pending: 'Calculating your move-in cost…',
  contended: 'This unit was just claimed by another shopper — refresh to price the next available unit. Final costs are always confirmed at checkout.',
  soldout: 'This size is sold out at this facility right now.',
  error: 'We\u2019re experiencing technical difficulties retrieving live pricing. Please try again in a few minutes.',
};

function QuoteStateNote({ state }: { state: { status: string } }) {
  return (
    <p className={`ts-quote-note${state.status === 'pending' ? ' ts-quote-note--pending' : ''}`}>
      {QUOTE_STATE_COPY[state.status] ?? QUOTE_STATE_COPY.error}
    </p>
  );
}

const lineAmt = (n: number) => (n < 0 ? `−$ ${Math.abs(n).toFixed(2)}` : `$ ${n.toFixed(2)}`);
const priceFmt = formatPrice;

function BreakdownRows({ tierKey }: { tierKey: TierKey }) {
  const state = useTierData().quotes?.[tierKey];
  if (!state || state.status !== 'ok') {
    return <QuoteStateNote state={state ?? { status: 'pending' }} />;
  }
  const q = state.quote;
  if (!q.lines.length) {
    return <div className="ts-bd-row"><span className="ts-bd-plain">Itemized breakdown unavailable.</span></div>;
  }
  // Shared line-item renderer; CardBreakdown adds the "Total Cost to Move-In" row.
  return (
    <MoneyBreakdown
      totalDue={q.totalDue}
      totalTax={q.totalTax}
      unitNumber={q.unitNumber}
      lines={q.lines}
      showTotal={false}
    />
  );
}

function CardBreakdown({ tierKey }: { tierKey: TierKey }) {
  const state = useTierData().quotes?.[tierKey];
  const total = state?.status === 'ok' ? `$${state.quote.totalDue.toFixed(2)}` : '—';
  return (
    <div className="ts-card-breakdown">
      <BreakdownRows tierKey={tierKey} />
      <div className="ts-bd-row ts-bd-row--total">
        <span className="ts-bd-total-label">Total Cost to Move-In:</span>
        <span className="ts-bd-total-amt">{total}</span>
      </div>
    </div>
  );
}

function MobileTotalAmt({ tierKey }: { tierKey: TierKey }) {
  const state = useTierData().quotes?.[tierKey];
  return <span className="ts-m-total-amt">{state?.status === 'ok' ? `$${state.quote.totalDue.toFixed(2)}` : '—'}</span>;
}

// ── Shared bits ────────────────────────────────────────────────────────────

function Pills({ selected, setSelected, tiers: tiersProp }: { selected: TierKey; setSelected: (k: TierKey) => void; tiers?: Tier[] }) {
  const ctx = useTierData();
  const tiers = tiersProp ?? ctx.tiers;
  return (
    <div className="ts-pills">
      {tiers.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`ts-pill${t.key === selected ? ' ts-pill--active' : ''}${t.soldOut ? ' ts-pill--soldout' : ''}`}
          onClick={() => { if (!t.soldOut) setSelected(t.key); }}
          aria-pressed={t.key === selected}
          aria-disabled={t.soldOut || undefined}
        >
          <span className="ts-pill-name">{t.name}</span>
          <span className="ts-pill-tag">{t.soldOut ? 'Sold Out' : t.tagline}</span>
          <span className="ts-pill-divider" />
          {t.soldOut ? (
            <span className="ts-pill-price">—</span>
          ) : t.promoRate != null ? (
            <span className="ts-pill-price">
              <span className="ts-pill-strike">{priceFmt(t.price)}/mo.</span>
              <span className="ts-pill-promo">{priceFmt(t.promoRate)}</span>
            </span>
          ) : (
            <span className="ts-pill-price">{priceFmt(t.price)}/mo.</span>
          )}
        </button>
      ))}
    </div>
  );
}

// "Pricing Details" link + hover tooltip. The dark breakdown fades in on hover
// and follows the cursor (mouse sits at the tooltip's top-centre); the trigger
// shows a help (question-mark) cursor.
function PricingDetails({ price, className, tierKey, mobile = false }: { price: number; className?: string; tierKey?: TierKey; mobile?: boolean }) {
  const { quotes, ensureQuote, showPricingDetails } = useTierData();
  const state = quotes?.[tierKey ?? ('' as TierKey)];
  const quote = state?.status === 'ok' ? state.quote : undefined;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const tooltipId = React.useId();
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointerActivation = useRef(false);

  const track = (e: React.MouseEvent) => setPos({ x: e.clientX, y: e.clientY + 6 });
  const showAtTrigger = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
    setVisible(true);
    if (tierKey) ensureQuote?.(tierKey);
  };

  // Mobile has no cursor to follow. Keep the popup attached to the tapped link:
  // below when it fits, otherwise immediately above, with its centre clamped so
  // neither edge can leave the viewport. Re-run when the async quote replaces
  // the shorter loading message with the full itemized breakdown.
  useLayoutEffect(() => {
    if (!visible || !mobile || !triggerRef.current || !tooltipRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const tip = tooltipRef.current.getBoundingClientRect();
    const margin = 12;
    const half = tip.width / 2;
    const x = Math.min(window.innerWidth - half - margin, Math.max(half + margin, trigger.left + trigger.width / 2));
    const below = trigger.bottom + 6;
    const y = below + tip.height <= window.innerHeight - margin
      ? below
      : Math.max(margin, trigger.top - tip.height - 6);
    setPos((current) => current?.x === x && current.y === y ? current : { x, y });
  }, [visible, state?.status, quote?.lines.length, mobile]);

  if (showPricingDetails === false) return null;

  return (
    <span className="ts-pd">
      <a
        ref={triggerRef}
        className={`ts-pd-link${className ? ' ' + className : ''}`}
        href="#"
        aria-expanded={visible}
        aria-controls={tooltipId}
        onPointerDown={() => { pointerActivation.current = true; }}
        onClick={(e) => {
          e.preventDefault();
          const fromPointer = pointerActivation.current;
          pointerActivation.current = false;
          if (fromPointer && visible) setVisible(false);
          else showAtTrigger(e.currentTarget);
        }}
        onFocus={(e) => {
          // A pointer focuses before it clicks; let the click perform the one
          // state change. Keyboard focus has no pointerdown and opens here.
          if (!pointerActivation.current) showAtTrigger(e.currentTarget);
        }}
        onBlur={() => setVisible(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setVisible(false); e.currentTarget.blur(); } }}
        onMouseEnter={(e) => { track(e); setVisible(true); if (tierKey) ensureQuote?.(tierKey); }}
        onMouseMove={track}
        onMouseLeave={() => setVisible(false)}
      >
        Pricing Details
      </a>
      {pos && (
        <div
          ref={tooltipRef}
          className={`ts-pd-modal${mobile ? ' ts-pd-modal--mobile' : ''}`}
          style={{ left: pos.x, top: pos.y, opacity: visible ? 1 : 0 }}
          id={tooltipId}
          role="tooltip"
          aria-hidden={!visible}
        >
          <div className="ts-pd-inner">
            <div className="ts-pd-row">
              <span className="ts-pd-label"><span>Monthly Rent</span><InfoCircle size={15} className="ts-pd-info" /></span>
              <span className="ts-pd-amt">$ {price.toFixed(2)}</span>
            </div>
            {quote ? (
              <>
                <hr className="ts-pd-divider" />
                {quote.lines.length ? (
                  <>
                    {quote.lines.map((l) => (
                      <div className="ts-pd-row" key={l.name + l.cost}>
                        <span className={l.name === 'Rent' ? 'ts-pd-strong' : 'ts-pd-reg'}>
                          {l.name === 'Rent' && l.startDate ? 'Rent (Prorated)' : l.name}
                        </span>
                        <span className={l.name === 'Rent' ? 'ts-pd-strong' : 'ts-pd-reg'}>{lineAmt(l.cost)}</span>
                      </div>
                    ))}
                    {quote.lines[0]?.startDate && (
                      <p className="ts-pd-dates">({quote.lines[0].startDate} – {quote.lines[0].endDate ?? ''})</p>
                    )}
                    <div className="ts-pd-row"><span className="ts-pd-reg">Total Tax</span><span className="ts-pd-reg">$ {quote.totalTax.toFixed(2)}</span></div>
                  </>
                ) : (
                  <p className="ts-pd-dates">Itemized breakdown unavailable.</p>
                )}
                <div className="ts-pd-row ts-pd-total">
                  <span>Total Cost to Move-In:</span>
                  <span className="ts-pd-total-amt">${quote.totalDue.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <>
                <hr className="ts-pd-divider" />
                {(state?.status ?? 'pending') === 'pending' ? (
                  <div className="ts-pd-loading" role="status" aria-label="Calculating your move-in cost">
                    {[72, 58, 66].map((width, i) => (
                      <div className="ts-pd-loading-row" key={i}>
                        <span style={{ width: `${width}%` }} />
                        <span />
                      </div>
                    ))}
                    <div className="ts-pd-loading-total">
                      <span />
                      <span />
                    </div>
                  </div>
                ) : (
                  <p className="ts-pd-note">
                    {QUOTE_STATE_COPY[state?.status ?? 'error'] ?? QUOTE_STATE_COPY.error}
                  </p>
                )}
              </>
            )}
            <div className="ts-pd-end-space" aria-hidden="true" />
          </div>
        </div>
      )}
    </span>
  );
}

// Desktop comparison-table cell (large price, starred hours, 24px ticks).
function Cell({ row, tier }: { row: FeatureRow; tier: Tier }) {
  if (tier.soldOut) return row.type === 'price' ? <span className="ts-cell-price ts-cell-soldout">Sold Out</span> : null;
  if (row.type === 'price') {
    return tier.promoRate != null ? (
      <span className="ts-cell-price"><span className="ts-cell-strike">{priceFmt(tier.price)}/mo</span> {priceFmt(tier.promoRate)}</span>
    ) : <span className="ts-cell-price">{priceFmt(tier.price)}/mo</span>;
  }
  if (row.type === 'hours') {
    return (
      <span className="ts-cell-hours">
        <PromoStar size={16} className="ts-cell-star" />
        {tier.hours}
      </span>
    );
  }
  return row[tier.key] ? <CheckIcon size={24} className="ts-cell-check" /> : null;
}

// ── Desktop (Layout 1) ──────────────────────────────────────────────────────

interface LayoutProps {
  tier: Tier;
  selected: TierKey;
  setSelected: (k: TierKey) => void;
  heading: string;
  subheading?: string;
  urgency?: string;
  adminFeeText?: string;
  promo: string;
  chromeless?: boolean;
}

function DesktopLayout({ tier, selected, setSelected, heading, subheading, urgency, adminFeeText, promo, chromeless }: LayoutProps) {
  const { tiers, rows, sizeImage, sizeAlt, size, live, property } = useTierData();
  const displaySize = size ? size.replace(/'/g, '\u2019') : '5\u2019 x 5\u2019';
  const cardPromo = live ? tier.promo : 'First Full Month FREE';
  return (
    <>
      {/* Header row (Figma): heading + subheading left, urgency + $30 admin fee
          right. Suppressed in modal mode — the modal shell renders the header. */}
      {!chromeless && (
        <>
          <div className="ts-o2-headrow">
            <div className="ts-o2-header">
              <h2 className="ts-title">{heading}</h2>
              <p className="ts-subtitle">{subheading}</p>
            </div>
            <div className="ts-o2-topright">
              {urgency && <p className="ts-o2-urgency">{urgency}</p>}
              <p className="ts-o2-admin">
                {adminFeeText}
                <InfoCircle size={22} className="ts-o2-admin-info" />
              </p>
            </div>
          </div>
          <hr className="ts-rule" />
        </>
      )}

      <div className="ts-grid">
      {/* LEFT: selector + comparison table */}
      <div className="ts-left">
        <div className="ts-picker-row">
          <div className="ts-unit">
            {sizeImage ? <img className="ts-unit-img" src={sizeImage} alt={sizeAlt} onError={onSizeImgError} /> : <div className="ts-unit-img ts-unit-img--placeholder" aria-hidden="true" />}
            <button type="button" className="ts-seewhatfits">
              <span>See what fits</span>
              <PlayCircle size={24} />
            </button>
          </div>

          <div className="ts-picker">
            <Pills selected={selected} setSelected={setSelected} />

            {promo && (
              <div className="ts-promo">
                <TagIcon size={16} className="ts-promo-icon" />
                <span className="ts-promo-text">{promo}</span>
              </div>
            )}

            <div className="ts-features">
              {(() => {
                // Live: the SELECTED tier's own amenity bundle (so Best really
                // shows the most features). Demo: the static 5x5 amenity pair.
                const feats = tier.features ?? [];
                const mid = Math.ceil(feats.length / 2);
                const left = feats.slice(0, mid);
                const right = feats.slice(mid);
                return (
                  <>
                    <div className="ts-feat-col">
                      {left.map((a) => (
                        <div className="ts-feat" key={a}>
                          <CheckIcon size={16} className="ts-feat-check" />
                          <span>{a}</span>
                        </div>
                      ))}
                    </div>
                    <div className="ts-feat-col">
                      {right.map((a) => (
                        <div className="ts-feat" key={a}>
                          <CheckIcon size={16} className="ts-feat-check" />
                          <span>{a}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            <TierSelectCta tierKey={selected} variant="option1" />
          </div>
        </div>

        <div className="ts-table" role="table" style={{ ['--ts-cols']: tiers.length } as React.CSSProperties}>
          <div className="ts-thead" role="row">
            <div className="ts-th ts-th--label" role="columnheader" />
            {tiers.map((t) => (
              <div
                key={t.key}
                role="columnheader"
                className={`ts-th${t.key === selected ? ' ts-col--active' : ''}`}
              >
                {t.name.toUpperCase()}
              </div>
            ))}
          </div>

          {rows.map((row, ri) => (
            <div className="ts-tr" role="row" key={row.label}>
              <div className={`ts-td ts-td--label${row.bold ? ' ts-td--bold' : ''}`} role="rowheader">
                {row.label}
              </div>
              {tiers.map((t) => (
                <div
                  key={t.key}
                  role="cell"
                  className={`ts-td ts-td--value${t.key === selected ? ' ts-col--active' : ''}${
                    ri === rows.length - 1 ? ' ts-td--last' : ''
                  }`}
                >
                  <Cell row={row} tier={t} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: order-summary card (shared with rent-or-reserve) */}
      <SummaryRail
        imageUrl={property?.imageUrl}
        onImgError={onHeroImgError}
        name={property?.name}
        address={property?.address}
        phone={property?.phone}
        size={displaySize}
        tierName={tier.name.toUpperCase()}
        summary={tier.summary}
        amenities={(tier.features ?? ['24 Hour Access', 'Drive Up']).slice(1, 3)}
        changeSpaceUrl="#"
        standardPrice={tier.price}
        promoPrice={tier.promoRate ?? undefined}
        promo={cardPromo}
      >
        <CardBreakdown tierKey={tier.key} />
      </SummaryRail>
      </div>
    </>
  );
}

// ── Mobile (Layout 2) ───────────────────────────────────────────────────────

function MobileLayout({
  tier, selected, setSelected, heading, urgency, adminFeeText, promo, chromeless,
}: {
  tier: Tier; selected: TierKey; setSelected: (k: TierKey) => void;
  heading: string; urgency: string; adminFeeText?: string; promo: string; chromeless?: boolean;
}) {
  const { tiers, rows, live } = useTierData();
  const [open, setOpen] = useState(false);
  // Mobile has no room for sold-out placeholders — show real tiers only.
  const visibleTiers = tiers.filter((t) => !t.soldOut);

  return (
    <div className="ts-m">
      {!chromeless && (
        <div className="ts-m-headwrap">
          <h2 className="ts-m-title">{heading}</h2>
          {urgency && <p className="ts-m-urgency">{urgency}</p>}
        </div>
      )}

      <div className="ts-m-pills">
        <Pills selected={selected} setSelected={setSelected} tiers={visibleTiers} />
      </div>

      {promo && (
        <div className="ts-promo ts-m-promo">
          <TagIcon size={16} className="ts-promo-icon" />
          <span className="ts-promo-text">{promo}</span>
        </div>
      )}

      <div className="ts-features ts-m-features">
        {(() => {
          // Same rule as DesktopLayout: live = the SELECTED tier's own bundle
          // (hours in the chip); demo = the static 5x5 amenity set.
          const feats = live ? (tier.features ?? []) : ['7am - 7pm', 'Interior Access', 'Ground Floor', 'Electronic Lock'];
          const chip = live ? tier.hours : 'Climate Controlled';
          const mid = Math.ceil((feats.length + 1) / 2);
          const left = feats.slice(0, mid - 1);
          const right = feats.slice(mid - 1);
          return (
            <>
              <div className="ts-feat-col">
                <div className="ts-feat ts-feat--chip">
                  <CheckIcon size={16} className="ts-feat-check" />
                  <span>{chip}</span>
                </div>
                {left.map((a) => (
                  <div className="ts-feat" key={a}>
                    <CheckIcon size={16} className="ts-feat-check" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
              <div className="ts-feat-col">
                {right.map((a) => (
                  <div className="ts-feat" key={a}>
                    <CheckIcon size={16} className="ts-feat-check" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </div>

      <TierSelectCta tierKey={selected} variant="option1-mobile" />

      {tier.promoRate != null && (
        <div className="ts-m-rates">
          <div className="ts-price-instore">
            <span className="ts-price-label">STANDARD</span>
            <span className="ts-price-strike">{priceFmt(tier.price)}</span>
          </div>
          <span className="ts-price-sep" />
          <div className="ts-price-online">
            <span className="ts-price-label">PROMO RATE</span>
            <span className="ts-price-amount">{priceFmt(tier.promoRate)}</span>
          </div>
        </div>
      )}

      <div className="ts-m-total">
        <button
          type="button"
          className="ts-m-total-row"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="ts-m-total-label">Total Cost to Move-In</span>
          <MobileTotalAmt tierKey={tier.key} />
          <ChevronDown size={24} className={`ts-m-total-chev${open ? ' ts-m-total-chev--open' : ''}`} />
        </button>
        {open && (
          <div className="ts-m-total-detail">
            <BreakdownRows tierKey={tier.key} />
          </div>
        )}
      </div>

      {/* Compact comparison table */}
      <div className="ts-mt" role="table" style={{ ['--ts-cols']: visibleTiers.length } as React.CSSProperties}>
        <div className="ts-mt-row ts-mt-head" role="row">
          <div className="ts-mt-cell ts-mt-label" role="columnheader" />
          {visibleTiers.map((t) => (
            <div
              key={t.key}
              role="columnheader"
              className={`ts-mt-cell ts-mt-hcell${t.key === selected ? ' ts-mt-col--active' : ''}`}
            >
              {t.name.toUpperCase()}
            </div>
          ))}
        </div>
        {rows.map((row, ri) => (
          <div className="ts-mt-row" role="row" key={row.label}>
            <div className={`ts-mt-cell ts-mt-label${row.bold ? ' ts-mt-label--bold' : ''}`} role="rowheader">
              {row.label}
            </div>
            {visibleTiers.map((t) => (
              <div
                key={t.key}
                role="cell"
                className={`ts-mt-cell ts-mt-value${t.key === selected ? ' ts-mt-col--active' : ''}${
                  ri === rows.length - 1 ? ' ts-mt-value--last' : ''
                }`}
              >
                <MobileCell row={row} tier={t} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <MobileAdminFee text={adminFeeText} />
    </div>
  );
}

// Mobile comparison-table cell (compact 12px text, no star, 22px ticks).
function MobileCell({ row, tier }: { row: FeatureRow; tier: Tier }) {
  if (tier.soldOut) return row.type === 'price' ? <span className="ts-mt-text ts-cell-soldout">Sold Out</span> : null;
  if (row.type === 'price') {
    return tier.promoRate != null ? (
      <span className="ts-mt-text"><span className="ts-cell-strike">{priceFmt(tier.price)}</span> {priceFmt(tier.promoRate)}</span>
    ) : <span className="ts-mt-text">{priceFmt(tier.price)}</span>;
  }
  if (row.type === 'hours') return <span className="ts-mt-text">{tier.hours}</span>;
  return row[tier.key] ? <CheckIcon size={22} className="ts-mt-check" /> : null;
}

// ── Option 2 — Good/Better/Best pricing cards ───────────────────────────────

function Option2Layout({ heading, subheading, urgency, adminFeeText, chromeless }: { heading: string; subheading?: string; urgency?: string; adminFeeText?: string; chromeless?: boolean }) {
  const { o2 } = useTierData();
  return (
    <div className="ts-o2">
      {!chromeless && (
        <div className="ts-o2-headrow">
          <div className="ts-o2-header">
            <h2 className="ts-title ts-o2-title">{heading}</h2>
            <p className="ts-subtitle ts-o2-subtitle">{subheading}</p>
          </div>
          <div className="ts-o2-topright">
            {urgency && <p className="ts-o2-urgency">{urgency}</p>}
            <p className="ts-o2-admin">
              {adminFeeText}
              <InfoCircle size={22} className="ts-o2-admin-info" />
            </p>
          </div>
        </div>
      )}

      <div className="ts-o2-cards" style={{ ['--ts-cols']: o2.length } as React.CSSProperties}>
        {o2.map((card) => (
          <O2Card key={card.key} card={card} />
        ))}
      </div>
    </div>
  );
}

function O2Card({ card }: { card: O2Tier }) {
  const { selected, setSelected, featuredTier } = useTierData();
  const isSelected = selected === card.key;
  const isFeatured = featuredTier === card.key;
  if (card.soldOut) {
    return (
      <div className="ts-o2-card ts-o2-card--soldout">
        <div className="ts-o2-card-top">
          <div className="ts-o2-card-head">
            <p className="ts-o2-name">{card.name}</p>
            <p className="ts-o2-tag">{card.tagline}</p>
          </div>
          <ul className="ts-o2-features ts-o2-features--soldout" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <li className="ts-o2-skel" key={i} />
            ))}
          </ul>
        </div>
        <div className="ts-o2-foot">
          <div className="ts-o2-foot-top">
            <div className="ts-o2-price"><span className="ts-o2-amt ts-o2-amt--soldout">Sold Out</span></div>
          </div>
          <div className="ts-o2-foot-bottom">
            <div className="ts-o2-promo-slot" />
            <TierSelectCta tierKey={card.key} selected={false} soldOut />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`ts-o2-card${card.promo ? '' : ' ts-o2-card--no-promo'}${isFeatured ? ' ts-o2-card--popular' : ''}${isSelected ? ' ts-o2-card--selected' : ''}`}
      onClick={() => setSelected?.(card.key)}
      onKeyDown={activateOnKey(() => setSelected?.(card.key))}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
    >
      {isFeatured && <span className="ts-o2-badge">Most Popular</span>}

      <div className="ts-o2-card-top">
        <div className="ts-o2-card-head">
          <p className="ts-o2-name">{card.name}</p>
          <p className="ts-o2-tag">{card.tagline}</p>
        </div>
        <ul className="ts-o2-features">
          {card.features.map((f) => (
            <li className="ts-o2-feat" key={f.label}>
              {f.star ? (
                <PromoStar size={22} className="ts-o2-feat-star" />
              ) : (
                <CheckCircle size={24} className="ts-o2-feat-check" />
              )}
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={`ts-o2-foot${card.promo ? '' : ' ts-o2-foot--no-promo'}`}>
        <div className="ts-o2-foot-top">
          {card.promoRate != null ? (
            <div className="ts-o2-price ts-o2-price--promo">
              <span className="ts-o2-promo-label ts-o2-promo-label--std">STANDARD</span>
              <span className="ts-o2-promo-label ts-o2-promo-label--promo">PROMO RATE</span>
              <span className="ts-o2-strike">{priceFmt(card.price)}/mo.</span>
              <span className="ts-o2-amt">{priceFmt(card.promoRate)}</span>
              <span className="ts-o2-price-divider" aria-hidden="true" />
            </div>
          ) : (
            <div className="ts-o2-price">
              <span className="ts-o2-amt">{priceFmt(card.price)}</span>
              <span className="ts-o2-per">/MONTH</span>
            </div>
          )}
          <PricingDetails price={card.price} tierKey={card.key} className="ts-o2-details" />
        </div>
        <div className="ts-o2-foot-bottom">
          {card.promo && (
            <div className="ts-o2-promo-slot">
              <div className="ts-promo ts-o2-promo">
                <TagIcon size={16} className="ts-promo-icon" />
                <span className="ts-promo-text">{card.promo}</span>
              </div>
            </div>
          )}
          <TierSelectCta tierKey={card.key} selected={isSelected} stopPropagation />
        </div>
      </div>
    </div>
  );
}

// ── Option 2 mobile — accordion (one expanded, others collapsed) ────────────

function Option2Mobile({ heading, urgency, adminFeeText, chromeless }: { heading: string; urgency: string; adminFeeText?: string; chromeless?: boolean }) {
  const { o2, selected, setSelected } = useTierData();
  // Mobile has no room for sold-out placeholders — show real tiers only.
  const cards = o2.filter((c) => !c.soldOut);
  const initial = cards.find((c) => c.key === selected)
    ?? cards.find((c) => c.key === 'better')
    ?? cards[cards.length - 1];
  const [expanded, setExpanded] = useState<TierKey | undefined>(initial?.key);
  // Reconcile if the data changes and the expanded tier is gone (no remount).
  const cardKeys = cards.map((c) => c.key).join(',');
  useEffect(() => {
    if (!cards.some((c) => c.key === expanded)) {
      setExpanded(initial?.key);
      if (initial) setSelected?.(initial.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKeys]);

  return (
    <div className="ts-m ts-o2m">
      {!chromeless && (
        <div className="ts-m-headwrap">
          <h2 className="ts-m-title">{heading}</h2>
          {urgency && <p className="ts-m-urgency">{urgency}</p>}
        </div>
      )}

      <div className="ts-o2m-cards">
        {cards.map((card) =>
          card.key === expanded ? (
            <O2MExpanded card={card} key={card.key} />
          ) : (
            <button
              type="button"
              key={card.key}
              className="ts-o2m-bar"
              onClick={() => {
                setExpanded(card.key);
                setSelected?.(card.key);
              }}
              aria-expanded={false}
            >
              <O2MHead card={card} />
            </button>
          ),
        )}
      </div>
      <MobileAdminFee text={adminFeeText} />
    </div>
  );
}

function MobileAdminFee({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="ts-o2m-admin ts-mobile-admin">
      {text}
      <InfoCircle size={20} className="ts-o2-admin-info" />
    </p>
  );
}

// Shared header row (name + tagline on the left, price on the right).
function O2MHead({ card }: { card: O2Tier }) {
  return (
    <div className="ts-o2m-head">
      <div className="ts-o2m-head-info">
        <span className="ts-o2m-name">{card.name}</span>
        <span className="ts-o2m-tag">{card.tagline}</span>
      </div>
      <div className="ts-o2m-price-block">
        {card.promoRate != null ? (
          <span className="ts-o2m-price"><span className="ts-o2m-strike">{priceFmt(card.price)}/mo.</span> {priceFmt(card.promoRate)}</span>
        ) : (
          <span className="ts-o2m-price">{priceFmt(card.price)}/mo.</span>
        )}
        <PricingDetails price={card.price} tierKey={card.key} className="ts-o2m-details" mobile />
      </div>
    </div>
  );
}

function O2MExpanded({ card }: { card: O2Tier }) {
  const { featuredTier } = useTierData();
  const isFeatured = featuredTier === card.key;
  return (
    <div className={`ts-o2m-card${isFeatured ? ' ts-o2m-card--popular' : ''}`}>
      {isFeatured && <span className="ts-o2-badge ts-o2m-badge">Most Popular</span>}
      <O2MHead card={card} />
      <ul className="ts-o2-features ts-o2m-features">
        {card.features.map((f) => (
          <li className="ts-o2-feat" key={f.label}>
            {f.star ? (
              <PromoStar size={22} className="ts-o2-feat-star" />
            ) : (
              <CheckCircle size={24} className="ts-o2-feat-check" />
            )}
            <span>{f.label}</span>
          </li>
        ))}
      </ul>
      {card.promo && (
        <div className="ts-promo ts-o2m-promo">
          <TagIcon size={16} className="ts-promo-icon" />
          <span className="ts-promo-text">{card.promo}</span>
        </div>
      )}
      <TierSelectCta tierKey={card.key} variant="cards-mobile" />
    </div>
  );
}

// ── Option 3 — pricing cards fused with comparison table ────────────────────

function Option3Layout({ heading, subheading, urgency, adminFeeText, chromeless }: { heading: string; subheading?: string; urgency?: string; adminFeeText?: string; chromeless?: boolean }) {
  const { o3, rows3, sizeImage, sizeAlt } = useTierData();
  return (
    <div className="ts-o3">
      {!chromeless && (
        <>
          {urgency && <p className="ts-o3-urgency">{urgency}</p>}
          <div className="ts-o3-header">
            <div className="ts-o3-headings">
              <h2 className="ts-title ts-o3-title">{heading}</h2>
              <p className="ts-subtitle">{subheading}</p>
            </div>
            <p className="ts-o3-admin">
              {adminFeeText}
              <InfoCircle size={22} className="ts-o3-admin-info" />
            </p>
          </div>
          <hr className="ts-rule ts-o3-rule" />
        </>
      )}

      <div className="ts-o3-scroll">
        <div className="ts-o3-grid" style={{ ['--ts-cols']: o3.length } as React.CSSProperties}>
          {/* Feature-label column (unit illustration on top) */}
          <div className="ts-o3-col ts-o3-col--label">
            <div className="ts-o3-head ts-o3-unit">
              {sizeImage ? <img className="ts-o3-unit-img" src={sizeImage} alt={sizeAlt} onError={onSizeImgError} /> : <div className="ts-o3-unit-img ts-o3-unit-img--placeholder" aria-hidden="true" />}
              <button type="button" className="ts-seewhatfits ts-o3-seewhatfits">
                <span>See what fits</span>
                <PlayCircle size={24} />
              </button>
            </div>
            <div className="ts-o3-rows">
              {rows3.map((r) => (
                <div
                  key={r.label}
                  className={`ts-o3-lrow ts-o3-w-${r.weight}${r.gray ? ' ts-o3-row--gray' : ''}`}
                >
                  {r.label}
                </div>
              ))}
            </div>
          </div>

          {o3.map((card) => (
            <O3Column key={card.key} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}

function O3Column({ card }: { card: O3Tier }) {
  const { rows3, selected, setSelected, featuredTier } = useTierData();
  const isSelected = selected === card.key;
  const isFeatured = featuredTier === card.key;
  return (
    <div
      className={`ts-o3-col ts-o3-tier${isFeatured ? ' ts-o3-col--popular' : ''}${isSelected ? ' ts-o3-col--selected' : ''}`}
      onClick={() => !card.soldOut && setSelected?.(card.key)}
      onKeyDown={card.soldOut ? undefined : activateOnKey(() => setSelected?.(card.key))}
      role="button"
      tabIndex={card.soldOut ? -1 : 0}
      aria-pressed={isSelected}
      aria-disabled={card.soldOut || undefined}
    >
      {isFeatured && <span className="ts-o2-badge ts-o3-badge">Most Popular</span>}

      <div className="ts-o3-head ts-o3-card">
        <div className="ts-o3-cardhead">
          <p className="ts-o3-name">{card.name}</p>
          <p className="ts-o3-tag">{card.tagline}</p>
        </div>
        <div className="ts-o3-foot">
          <div className="ts-o3-foot-top">
            <div className="ts-o3-price">
              {card.soldOut ? (
                <span className="ts-o3-amt ts-o3-amt--soldout">Sold Out</span>
              ) : card.promoRate != null ? (
                <>
                  <span className="ts-o3-strike-inline">{priceFmt(card.price)}</span>
                  <span className="ts-o3-amt">{priceFmt(card.promoRate)}</span>
                  <span className="ts-o3-per">/ MONTH</span>
                </>
              ) : (
                <>
                  <span className="ts-o3-amt">{priceFmt(card.price)}</span>
                  <span className="ts-o3-per">/ MONTH</span>
                </>
              )}
            </div>
            {!card.soldOut && <PricingDetails price={card.price} tierKey={card.key} className="ts-o3-details" />}
          </div>
          <div className="ts-o3-foot-bottom">
            <div className="ts-o3-promo-slot">
              {card.promo && !card.soldOut && (
                <div className="ts-promo ts-o3-promo">
                  <TagIcon size={16} className="ts-promo-icon" />
                  <span className="ts-promo-text">{card.promo}</span>
                </div>
              )}
            </div>
            <TierSelectCta
              tierKey={card.key}
              selected={isSelected}
              soldOut={card.soldOut}
              stopPropagation
            />
          </div>
        </div>
      </div>

      <div className="ts-o3-rows">
        {rows3.map((r, i) => (
          <div
            key={r.label}
            className={`ts-o3-vrow${r.gray ? ' ts-o3-row--gray' : ''}${i === rows3.length - 1 ? ' ts-o3-vrow--last' : ''}`}
          >
            <O3Cell row={r} tierKey={card.key} />
          </div>
        ))}
      </div>
    </div>
  );
}

function O3Cell({ row, tierKey }: { row: O3Row; tierKey: TierKey }) {
  const { o3Hours } = useTierData();
  if (row.type === 'hours') {
    if (!o3Hours[tierKey]) return null;
    return (
      <span className="ts-o3-hours">
        <PromoStar size={20} className="ts-o3-hours-star" />
        {o3Hours[tierKey]}
      </span>
    );
  }
  return row[tierKey] ? <CheckIcon size={24} className="ts-o3-check" /> : null;
}
