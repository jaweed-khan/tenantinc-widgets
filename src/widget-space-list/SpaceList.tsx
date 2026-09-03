import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './SpaceList.css';
import type { SpaceListProps, WidgetConfig, Unit } from './types';
import cfg from './config.json';
import { fetchSpaceGroups, fetchWebsiteSpaceGroupId, mapApiToUnits } from './api';
import { boundText, resolvePropertyId, resolveRequireId } from '@shared/propertyBinding';
import { resolveCompanyIdFromSources } from '@shared/companySource';
import { PropertyIdProvider } from './propertyContext';
import { CompanyIdProvider } from './companyContext';
import { fetchProperties, extractPropertyExtras, type PropertyExtras } from './propertyApi';
import {
  DEFAULT_FILTERS,
  FilterState,
  filterUnits,
  activeFilterCount,
  isUnavailable,
} from './filters';
import { readFiltersFromUrl, writeFiltersToUrl } from './urlFilters';
import {
  FEATURE_COPY,
  buildFeatureHighlights,
  collectFilterBarFeatures,
  copyCoverage,
  findFeature,
  readFeatureFromUrl,
  unitHasFeature,
  writeFeatureToUrl,
  type FeatureHighlight,
} from './featureHighlights';
import { FEATURE_PAGE_COLLECTION, fetchFeaturePageCopy } from './featurePageSource';
import { hasCollectionsApi } from '@shared/dudaCollections';
import { PROMOTION_OPTIONS } from './data';
import { FilterModal } from './components/FilterModal';
import { TopFilterBar } from './components/TopFilterBar';
import { GridView } from './components/GridView';
import { ListView } from './components/ListView';
import { DefaultView } from './components/DefaultView';
import { SectionAccordion } from './components/SectionAccordion';
import { ReorderModal } from './components/ReorderModal';
import { SkeletonLoader } from './components/SkeletonLoader';
import { ACCORDION_SECTIONS, type AccordionConfig } from './accordionSections';
import { instanceKey, readAccordionConfig, saveAccordionConfig } from './accordionConfigApi';
import { PROMO_EVENT, readPromoFromUrl, clearPromoInUrl, type PromoSelection } from '@shared/promoBus';
import { RichText } from '@shared/richText';
import { useStickySlot, useMediaQuery, MOBILE_STICKY_QUERY } from '@shared/stickyStack';
import { PromoTagIcon } from './components/Pricing';

// Wrapper-width breakpoint below which we count as mobile. Keyed off the widget's
// own width, not the viewport, for the same reason as the CSS container queries:
// in Duda the widget often sits in a narrow column inside a wide window.
const MOBILE_BP = 640;

function useIsMobile(breakpoint: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      setIsMobile(entries[0].contentRect.width < breakpoint);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [breakpoint]);
  return { ref, isMobile };
}

export function SpaceList({
  layoutMode = 'grid',
  apLocation = 'right',
  showSideAccordions = true,
  propertyHeader,
  showHeading = true,
  showInstorePrice = true,
  instorePriceLabel = 'IN-STORE',
  instorePriceMode = 'percentOfWeb',
  instorePriceAmount = 0,
  enablePromoLogic = false,
  // Dynamic-page bindings — see types.ts and @shared/propertyBinding.
  propertyId,
  companyId,
  spaceGroupId,
  showJunkFeeDisclaimer = false,
  junkFeeCopy = '',
  showUrgencyMessage = true,
  urgencyThreshold = 5,
  sortBy = 'sizeAsc',
  categoryOrdering = 'spaces',
  showUnavailableUnits = false,
  enableWaitlist = false,
  callOnLimitedAvailability = false,
  ctaButtonCopy = 'Select',
  enableValueTiers = false,
  valueTiersChannel,
  valueTiersPageUrl,
  rentalPageUrl,
  limitedAvailabilityCopy = '',
  startingAtLabel = 'Starting at',
  showSizeGuideVideos = true,
  aboutTitle,
  aboutContent,
  notesContent,
  blogCollection,
  blogBasePath,
  featureCollection = FEATURE_PAGE_COLLECTION,
  stickyFilterBar = true,
  stickyOffsetTop = 0,
  inEditor    = false,
  elementId,
  siteId,
  configApiUrl,
  configCollection = 'accordionConfig',
  spaceImageBaseUrl,
}: SpaceListProps) {
  const [liveUnits, setLiveUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // The default layout has no mobile frame of its own — below MOBILE_BP it falls
  // back to the grid layout, which does.
  const { ref: wrapperRef, isMobile } = useIsMobile(MOBILE_BP);

  // Mobile: pin the filter bar to the shared stack, BELOW #03's contact row
  // (order 20 vs 10). Viewport query rather than the container width above,
  // because it has to agree with #03 about what "mobile" means.
  const isMobileViewport = useMediaQuery(MOBILE_STICKY_QUERY);

  /* A sticky slot only watches its START sentinel, so once the bar pinned it
     stayed pinned — over whatever Duda section came after this widget. This
     watches the listing's END and switches the slot off when it goes by, which
     unpins the bar, releases its slot and clears the frozen placeholder height
     (see the `enabled` branch in useStickySlot). Scrolling back up re-arms it,
     because the start sentinel is observed again the moment it is re-enabled. */
  const [pastListing, setPastListing] = useState(false);
  /* The LISTING AREA itself, not a marker at the end of it. A zero-box marker
     was tried and could not work here: .sl-listing-area is a flex column, and
     the static position of an absolutely-positioned child of a FLEX container
     is the container's content-box START — it is laid out as though it were the
     sole flex item, wherever it sits in source order. So the "end" marker
     resolved to the same point as the START sentinel, `pastListing` went true
     the instant the listing's top crossed the line, and the bar unpinned at
     exactly the moment it should have pinned. It never pinned at all.
     Anchoring the marker with `bottom: 0` does not fix it either: nothing up
     the tree is a containing block, so it resolves against the viewport.
     The element's own bottom edge is the honest signal, and it needs no
     marker, no containing block and no assumptions about flex. */
  const listingAreaRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = listingAreaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        // Past only when the listing's BOTTOM has gone above the line — the
        // same direction test the stack itself makes. Scrolled ABOVE the
        // listing it is also "not intersecting", but its bottom is below the
        // line, which is what keeps first paint from reading as past.
        const rootTop = e.rootBounds?.top ?? 0;
        setPastListing(!e.isIntersecting && e.boundingClientRect.bottom <= rootTop);
      },
      // The bar's own line, so it lets go exactly where it would have sat.
      { rootMargin: `-${stickyOffsetTop}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stickyOffsetTop]);

  const filterSticky = useStickySlot({
    // Per instance: two space lists on one page must not share a slot.
    id: `sl-filter-bar-${elementId || 'default'}`,
    order: 20,
    enabled: stickyFilterBar && isMobileViewport && !inEditor && !pastListing,
    offsetTop: stickyOffsetTop,
    // `sl-wrapper` comes along so the bar's existing scoped CSS still matches
    // once it's portaled out of the widget's tree.
    className: 'sl-wrapper sl-top-bar-pinned',
  });

  // Second API call: property FAQ / phone / socials for the sidebar accordion.
  // Null until loaded (or on failure) → sections fall back to their demo data.
  const [propertyExtras, setPropertyExtras] = useState<PropertyExtras | null>(null);
  /* Whether the property call has SETTLED, which is not the same question as
     whether it produced a name. Without it the title cannot tell "still
     loading" from "loaded, and this property has no name" — and the second
     case has to fall back to config rather than shimmer forever. */
  const [propertySettled, setPropertySettled] = useState(false);

  // Section visibility + order are managed entirely in the "Manage accordions"
  // modal (persisted to the collection), not via content-panel isX toggles.
  // Declared after propertyExtras so the sold-out "Call" CTA can carry the same
  // number as the "Call our Storage Experts" card.
  const config: WidgetConfig = {
    showInstorePrice,
    instorePriceLabel,
    instorePriceMode,
    showJunkFeeDisclaimer,
    // Duda text fields arrive as '' until the editor types something, which a
    // default parameter won't catch — so fall back here to the standard wording.
    junkFeeCopy:
      junkFeeCopy.trim() ||
      '* Prices shown exclude applicable taxes and admin fees. Final price confirmed at checkout.',
    showUrgencyMessage,
    // Duda content-menu numbers can arrive as strings ("5") or blank, so floor it
    // to a positive integer and fall back to 5 on anything unusable.
    urgencyThreshold: (() => {
      const n = Math.floor(Number(urgencyThreshold));
      return Number.isFinite(n) && n > 0 ? n : 5;
    })(),
    // Radio values arrive as strings, and an untouched Duda control sends '' —
    // which a default parameter won't catch — so whitelist instead of trusting it.
    sortBy: (['sizeAsc', 'sizeDesc', 'priceAsc', 'priceDesc'] as const).includes(sortBy as never)
      ? (sortBy as WidgetConfig['sortBy'])
      : 'sizeAsc',
    categoryOrdering: categoryOrdering === 'parking' ? 'parking' : 'spaces',
    showUnavailableUnits,
    enableWaitlist,
    callOnLimitedAvailability,
    ctaButtonCopy,
    enableValueTiers,
    valueTiersChannel,
    valueTiersPageUrl,
    rentalPageUrl,
    // The ACTUAL property + company this widget is showing (dynamic pages vary
    // both) — passed through the value-tiers handoff so the target page prices
    // the same unit group. companyId is the bound content field (per-property on
    // dynamic pages); the target page can't infer it from its own collection.
    propertyId: resolvePropertyId({ propertyId }, cfg.propertyId),
    companyId,
    // Deliberately NO fallback: blank means the editor wants no note at all, so a
    // sold-out unit shows its CTA with nothing underneath. (The junk-fee field
    // still falls back — that one has standard legal wording worth defaulting to.)
    limitedAvailabilityCopy: limitedAvailabilityCopy.trim(),
    startingAtLabel,
    // Percent/currency amount for the in-store calc. Duda number fields arrive as
    // strings; anything unusable (blank, NaN, negative) means "don't calculate".
    instorePriceAmount: (() => {
      const n = Number(instorePriceAmount);
      return Number.isFinite(n) && n > 0 ? n : 0;
    })(),
    // Duda toggles can arrive as the strings 'true'/'false', so coerce rather than
    // trusting truthiness ('false' is truthy).
    enablePromoLogic: enablePromoLogic === true || enablePromoLogic === 'true',
    contactPhone: propertyExtras?.phones[0]?.number ?? '',
    facilityName: propertyExtras?.name ?? '',
  };

  // Effective property for this instance: the dynamic-page binding if the editor
  // connected one, else the config.json default.
  const effectivePropertyId = resolvePropertyId({ propertyId }, cfg.propertyId);

  // The company id is site DATA, not build output: it comes from the one-row
  // `Company` collection so this same bundle can serve every site we spin up from
  // the template. Async (a collection read), hence state rather than a plain call.
  // null = not resolved yet; the data effects below wait for it rather than firing
  // against config.json's company and then re-firing against the real one.
  const [effectiveCompanyId, setEffectiveCompanyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveCompanyIdFromSources('#05 space-list', { companyId }, cfg.companyId)
      .then((id) => { if (!cancelled) setEffectiveCompanyId(id); })
      .catch((err) => {
        console.error('[SpaceList] company id resolve error:', err);
        // Never leave the widget stuck on the skeleton — fall back to the build-time id.
        if (!cancelled) setEffectiveCompanyId(cfg.companyId);
      });
    return () => { cancelled = true; };
  }, [companyId]);

  // Is this instance pointed somewhere other than the configured facility? Then the
  // configured space group belongs to a DIFFERENT property and must never be used —
  // it would list another facility's units and prices.
  const isDynamicTarget =
    effectivePropertyId !== cfg.propertyId || effectiveCompanyId !== cfg.companyId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Wait for the Company collection read; the skeleton stays up meanwhile, which
    // is why this can't just fall back to cfg.companyId and correct itself later.
    if (effectiveCompanyId === null) return;

    // Resolve the space group before asking for units. It is per-property, REST-only
    // and not on the Properties collection, so it can't be bound: an explicit
    // spaceGroupId pins it, otherwise we list the property's groups and take the one
    // named "Website Group" (see @shared/spaceGroups — the public list is not always
    // first, and picking "Revenue Management"/"test" would publish wrong prices).
    // An EMPTY cfg.spaceGroupId also triggers discovery, so config.json can simply
    // omit it rather than carrying a value that has to be kept in step with
    // propertyId by hand (getting that pair out of step 404s the whole widget).
    const resolveGroup = spaceGroupId
      ? Promise.resolve(spaceGroupId)
      : isDynamicTarget || !cfg.spaceGroupId
        ? fetchWebsiteSpaceGroupId(effectivePropertyId, effectiveCompanyId)
        : Promise.resolve(cfg.spaceGroupId);

    resolveGroup
      .then((sg) => {
        // No website group and nothing configured for THIS property: render empty
        // rather than falling back to the configured group, which belongs to another
        // facility. spaceGroups.ts has already logged why it found none.
        if (!sg) {
          if (!cancelled) setLiveUnits([]);
          return null;
        }
        return fetchSpaceGroups(effectivePropertyId, sg, effectiveCompanyId);
      })
      .then((raw) => {
        // siteId is Duda's own (data.siteId) and is what builds the Media
        // Manager URL. Absent — the dev harness, or a JS tab that does not
        // forward it — every card simply keeps its bundled render.
        if (raw && !cancelled) setLiveUnits(mapApiToUnits(raw, { siteId, baseUrl: spaceImageBaseUrl }));
      })
      .catch((err) => console.error('[SpaceList] fetchSpaceGroups error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [effectivePropertyId, effectiveCompanyId, spaceGroupId, isDynamicTarget]);

  useEffect(() => {
    if (effectiveCompanyId === null) return;
    let cancelled = false;
    // Trust-check only against a Duda-bound id; see resolveRequireId.
    fetchProperties(resolveRequireId({ propertyId }, cfg.propertyId), effectiveCompanyId)
      .then((raw) => {
        if (!cancelled) setPropertyExtras(extractPropertyExtras(raw, effectivePropertyId));
      })
      .catch((err) => console.error('[SpaceList] fetchProperties error:', err))
      // Settled covers the failure too: a name we will never get must not leave
      // the heading shimmering for the rest of the visit.
      .finally(() => { if (!cancelled) setPropertySettled(true); });
    return () => { cancelled = true; };
  }, [effectivePropertyId, effectiveCompanyId]);

  const units = liveUnits;

  const [filters, setFilters] = useState<FilterState>(() => readFiltersFromUrl());
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Cross-widget promo filter: the Promotions widget's "See Qualifying Units"
  // sets this (event + URL param) to narrow the list to one promotion's units.
  const [promoId, setPromoId] = useState<string | null>(() => readPromoFromUrl());
  const [promoTitleFromEvent, setPromoTitleFromEvent] = useState<string | null>(null);

  useEffect(() => {
    const onShowPromo = (e: Event) => {
      const detail = (e as CustomEvent<PromoSelection>).detail;
      if (!detail) return;
      setPromoId(detail.promoId);
      setPromoTitleFromEvent(detail.promoTitle);
    };
    window.addEventListener(PROMO_EVENT, onShowPromo);
    return () => window.removeEventListener(PROMO_EVENT, onShowPromo);
  }, []);

  function clearPromoFilter() {
    setPromoId(null);
    setPromoTitleFromEvent(null);
    clearPromoInUrl();
  }

  // Feature-page mode: `?feature=<slug>` (set by the Feature Highlights
  // accordion) turns this listing into that one feature's landing page — see
  // featureHighlights.ts.
  const [featureParam, setFeatureParam] = useState<string | null>(() => readFeatureFromUrl());

  // Selecting a feature pushes a history entry, so Back has to bring the full
  // listing back rather than leaving a stale heading over unfiltered units.
  useEffect(() => {
    const onPop = () => setFeatureParam(readFeatureFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function selectFeature(slug: string | null) {
    setFeatureParam(slug);
    writeFeatureToUrl(slug);
    // The bar that opens this modal is about to disappear, so an open panel would
    // be orphaned — and would pop back up on returning to the full listing.
    setPanelOpen(false);
  }

  // Per-instance accordion arrangement (order + hidden). Read from Duda on
  // mount (step: collections read); null until then = default order, none hidden.
  const [accordionConfig, setAccordionConfig] = useState<AccordionConfig | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { writeFiltersToUrl(filters); }, [filters]);

  // Read this instance's saved arrangement from the Duda collection on mount.
  // No-ops (keeps defaults) when not in Duda or ids are missing.
  useEffect(() => {
    const key = instanceKey(siteId, elementId);
    if (!key) return;
    let cancelled = false;
    readAccordionConfig(configCollection, key).then((cfg) => {
      if (!cancelled && cfg) setAccordionConfig(cfg);
    });
    return () => { cancelled = true; };
  }, [siteId, elementId, configCollection]);

  // Save the arrangement. With no endpoint/ids (dev harness, not in Duda) we
  // just apply locally. Otherwise POST to the PHP proxy and only commit + close
  // on success; on failure keep the modal open with an inline error to retry.
  async function handleSaveConfig(next: AccordionConfig) {
    setSaveError(null);
    const key = instanceKey(siteId, elementId);
    if (!configApiUrl || !key || !siteId || !elementId) {
      setAccordionConfig(next);
      setReorderOpen(false);
      return;
    }
    setSavingConfig(true);
    try {
      await saveAccordionConfig({ endpoint: configApiUrl, siteId, elementId, config: next });
      setAccordionConfig(next);
      setReorderOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSavingConfig(false);
    }
  }

  // Feature-page copy from the `featurePage` collection, joined onto the live
  // features below. Seeded from `hasCollectionsApi()` rather than starting null:
  // outside Duda there is nothing to wait for, so the bundled copy goes in at
  // once; inside Duda we start EMPTY so a feature page briefly shows its
  // generated one-liner instead of flashing another site's bundled prose.
  const [featureCopy, setFeatureCopy] = useState<FeatureHighlight[]>(() =>
    hasCollectionsApi() ? [] : FEATURE_COPY,
  );

  useEffect(() => {
    let cancelled = false;
    fetchFeaturePageCopy(featureCollection).then((rows) => {
      // Empty means the collection is absent or unpopulated (and every widget on
      // a site without it) — keep the bundled copy so the section still reads.
      if (!cancelled) setFeatureCopy(rows.length > 0 ? rows : FEATURE_COPY);
    });
    return () => { cancelled = true; };
  }, [featureCollection]);

  // Rows for the Feature Highlights accordion — the property's OWN filter-bar
  // amenities, so the accordion and the pills can never list different features.
  // Authored prose is joined on per row; see featureHighlights.ts.
  const featureHighlights = useMemo(() => {
    const live = collectFilterBarFeatures(units);
    if (live.length > 0) return buildFeatureHighlights(live, featureCopy);
    // No units at all means loading, or credentials that can't reach the API —
    // both the Duda editor and the dev harness land here — so show the authored
    // rows to keep the section previewable. Units that DID load but carry no
    // filter-bar amenity get an EMPTY section instead: five features this
    // property demonstrably doesn't have would filter to nothing on a live page.
    return units.length === 0
      ? buildFeatureHighlights(FEATURE_COPY.map((c) => c.name), featureCopy)
      : [];
  }, [units, featureCopy]);

  // The name→amenity join is silent by design: an unmatched feature still renders
  // a working row with a generated line. That makes a typo'd `name` column
  // invisible on the page, so say so in the console instead.
  useEffect(() => {
    const live = collectFilterBarFeatures(units);
    if (live.length === 0 || featureCopy.length === 0) return;
    const { missingCopy, unusedRows } = copyCoverage(live, featureCopy);
    if (missingCopy.length > 0) {
      console.info(
        `[featurePage] no copy row for: ${missingCopy.join(', ')} — add a row whose "name" matches, or leave it for the generated line.`,
      );
    }
    if (unusedRows.length > 0) {
      console.warn(
        `[featurePage] rows matching no amenity on this property: ${unusedRows.join(', ')} — check the "name" column against the filter-bar labels.`,
      );
    }
  }, [units, featureCopy]);

  // Resolved against the rows this property actually has, so `?feature=` naming
  // an amenity that isn't on any of its tiers is IGNORED rather than filtering
  // the listing down to nothing.
  const activeFeature = useMemo(
    () => findFeature(featureHighlights, featureParam),
    [featureHighlights, featureParam],
  );

  useEffect(() => {
    if (featureParam && !activeFeature && units.length > 0) {
      console.warn(
        `[SpaceList] ?feature=${featureParam} matches no filter-bar amenity on this property — showing the full listing.`,
      );
    }
  }, [featureParam, activeFeature, units.length]);

  const amenityOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const u of units) {
      if (filters.types.length > 0 && !filters.types.includes(u.type)) continue;
      for (const a of u.amenities) {
        seen.add(a);
        if (seen.size >= 5) break;
      }
    }
    return Array.from(seen);
  }, [units, filters.types]);

  const featureOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const u of units) {
      if (filters.types.length > 0 && !filters.types.includes(u.type)) continue;
      for (const f of u.filterBarFeatures) seen.add(f);
    }
    return Array.from(seen).sort();
  }, [units, filters.types]);

  const visibleUnits = useMemo(() => {
    // A feature page shows no filter bar and no search box, so it must not APPLY
    // either: state whose controls aren't on screen would narrow the listing for
    // a reason the visitor can neither see nor undo (filter to Extra Large, click
    // a feature, get an empty page with nothing to explain it). Both are kept in
    // memory rather than reset, so "Show all spaces" restores what they had.
    let filtered = activeFeature
      ? units.filter((u) => unitHasFeature(u, activeFeature))
      : filterUnits(units, filters, searchTerm);
    // Cross-widget promo filter: only units allocated to the selected promotion.
    if (promoId) filtered = filtered.filter((u) => u.promoId === promoId);
    // Sold-out units are hidden unless showUnavailableUnits is on. Visibility is
    // this toggle's job ALONE — enableWaitlist no longer hides anything, it only
    // picks the CTA ("Join waitlist" vs "Call") for whatever is shown. So
    // showUnavailableUnits off + waitlist on still shows nothing sold out.
    return showUnavailableUnits ? filtered : filtered.filter((u) => !isUnavailable(u));
  }, [units, filters, searchTerm, showUnavailableUnits, promoId, activeFeature]);
  const badge = activeFilterCount(filters);
  const totalVacant = units.reduce((sum, u) => sum + (u.vacantCount ?? 0), 0);

  // Title for the active-promo banner: the event's title, else the promo name
  // carried on any matching unit (covers deep-links where only the id is known).
  const promoTitle = promoId
    ? (promoTitleFromEvent || units.find((u) => u.promoId === promoId)?.promo || 'Selected Promotion')
    : null;

  const sectionPanel = (
    <SectionAccordion
      config={accordionConfig}
      inEditor={inEditor}
      onReorderClick={() => { setSaveError(null); setReorderOpen(true); }}
      showSizeGuideVideos={showSizeGuideVideos}
      propertyExtras={propertyExtras}
      aboutTitle={aboutTitle}
      aboutContent={aboutContent}
      notesContent={notesContent}
      blogCollection={blogCollection}
      blogBasePath={blogBasePath}
      featureHighlights={featureHighlights}
      activeFeatureSlug={activeFeature?.slug ?? null}
      onSelectFeature={selectFeature}
    />
  );

  const filterBar = (
    <TopFilterBar
      filters={filters}
      onChange={setFilters}
      featureOptions={featureOptions}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      panelOpen={panelOpen}
      onTogglePanel={() => setPanelOpen((o) => !o)}
      activeCount={badge}
    />
  );

  // Filters always render as a top bar inside the main content column so they
  // line up with the title and the listing below them. On mobile the bar pins to
  // the shared sticky stack (below #03's contact row) once scrolled past; the
  // modal deliberately stays put — it's already a fixed overlay.
  //
  // NOT rendered at all on a feature page: the feature IS the filter there. Note
  // `filterSticky` above stays registered — a slot with no sentinel is never
  // activated, stays `display:none` and is skipped by heightAbove(), so it costs
  // #03's shared stack nothing.
  const topBar = activeFeature ? null : (
    <>
      <div ref={filterSticky.sentinelRef} className="sl-sticky-sentinel" />
      <div ref={filterSticky.slotRef} className="sl-top-bar-slot">
        {filterSticky.target ? createPortal(filterBar, filterSticky.target) : filterBar}
      </div>
      {panelOpen && (
        <FilterModal
          filters={filters}
          onChange={setFilters}
          badge={badge}
          onClose={() => setPanelOpen(false)}
          /* Reset CLOSES as well as clearing. Both panels write straight
             through (`onChange={setFilters}`), so there is no draft for the
             close to discard — the cleared state is already the live one. */
          onReset={() => { setFilters(DEFAULT_FILTERS); setPanelOpen(false); }}
          amenityOptions={amenityOptions}
          featureOptions={featureOptions}
          promotionOptions={PROMOTION_OPTIONS}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
      )}
    </>
  );

  /* The name the title interpolates. Null means "not known yet" — distinct from
     the configured fallback, which is only reached once the call has settled. */
  const propertyLabel = propertyExtras?.name || (propertySettled ? cfg.propertyName : null);
  /* An authored heading is already here and names no property, so it never
     waits. Everything else does, because every other branch interpolates a
     name. */
  const authoredHeading = activeFeature ? activeFeature.heading?.trim() : boundText(propertyHeader);
  const titlePending = !authoredHeading && !propertyLabel;

  // Filters are always a top bar inside the listing column; the accordion panel
  // sits on whichever side apLocation specifies.
  return (
    <PropertyIdProvider propertyId={effectivePropertyId}>
     <CompanyIdProvider companyId={effectiveCompanyId ?? ''}>
    <div className={`sl-wrapper filter-top ap-${apLocation}`} ref={wrapperRef}>
      {/* Off when #18 draws the heading instead — see showHeading. */}
      {showHeading && (
      <div className="sl-heading">
        <p className="sl-select-heading">Select a Space {totalVacant > 0 && `— ${totalVacant} Available`}</p>
        {/* Nothing until the name is known — the same guard #18 already carries,
            and for the same reason. The fallback is config.json's, which on this
            site names a property of the OLD company, so rendering early flashed
            a heading for the wrong facility and then swapped it. A skeleton
            holds the line at the height the real title will take, so nothing
            below it jumps when the name lands.

            An AUTHORED heading needs no wait: it is already here, and it does
            not name the property. Only the branches that interpolate a name are
            held back. Once the call has settled without one, config is all
            there is, so it renders rather than shimmering forever. */}
        {titlePending ? (
          <div className="sl-title-skeleton" aria-hidden="true" />
        ) : (
        <h1 className="sl-page-title">
          {activeFeature
            // A feature page names the feature. With no explicit heading on the row
            // it still names the location, the way the unfiltered page does — the
            // page really is "climate controlled units at THIS facility".
            ? activeFeature.heading?.trim() ||
              `${activeFeature.name} Storage Units in ${propertyLabel}`
            : boundText(propertyHeader) ||
              `Storage Units in ${propertyLabel}`}
        </h1>
        )}
      </div>
      )}
      {/* Outside .sl-heading on purpose: a feature page's explanation and its way
          back out are their own block, not part of the title. (.sl-heading used
          to be display:none on mobile, which is what made that separation
          load-bearing; the title is visible at every width now.) */}
      {activeFeature && (
        <div className="sl-feature-intro">
          <p className="sl-feature-intro-text">{activeFeature.description}</p>
          <button
            type="button"
            className="sl-feature-intro-clear"
            onClick={() => selectFeature(null)}
          >
            Show all spaces
          </button>
        </div>
      )}
      <div className="sl-row">
        {showSideAccordions && apLocation === 'left' && sectionPanel}
        <main className="sl-listing-area" ref={listingAreaRef}>
          {topBar}
          {promoId && (
            <div className="sl-promo-banner">
              <span className="sl-promo-banner-tag">
                {/* PromoTagIcon, the Figma vector (429:46379) the grid and
                    list-card promo banners already draw. This banner had its
                    own inline path — a generic rounded tag on a 24 grid, not
                    the frame's — so the same idea appeared as two different
                    marks on one page. */}
                <PromoTagIcon size={20} />
                <span className="sl-promo-banner-text">
                  Showing spaces with <strong>{promoTitle}</strong>
                </span>
              </span>
              <button type="button" className="sl-promo-banner-clear" onClick={clearPromoFilter}>
                Clear
              </button>
            </div>
          )}
          {loading ? (
            <SkeletonLoader />
          ) : layoutMode === 'list' ? (
            <ListView units={visibleUnits} config={config} />
          ) : layoutMode === 'default' && !isMobile ? (
            <DefaultView units={visibleUnits} config={config} />
          ) : (
            <GridView units={visibleUnits} config={config} />
          )}
          {/* Long-form copy for the selected feature, under the listing. Rich text
              because the Duda collection column that replaces this will be. */}
          {activeFeature && activeFeature.details.trim() && (
            <section className="sl-feature-details">
              {activeFeature.detailsTitle && (
                <h2 className="sl-feature-details-title">{activeFeature.detailsTitle}</h2>
              )}
              <RichText value={activeFeature.details} className="sl-feature-details-body" />
            </section>
          )}
        </main>
        {showSideAccordions && apLocation === 'right' && sectionPanel}
      </div>
      {reorderOpen && (
        <ReorderModal
          sections={ACCORDION_SECTIONS}
          config={accordionConfig}
          onClose={() => setReorderOpen(false)}
          onSave={handleSaveConfig}
          saving={savingConfig}
          error={saveError}
        />
      )}
    </div>
     </CompanyIdProvider>
    </PropertyIdProvider>
  );
}
