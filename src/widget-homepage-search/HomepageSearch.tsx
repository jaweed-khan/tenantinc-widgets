import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './HomepageSearch.css';
import { fetchLocationTree, type NavUnitType } from '@shared/propertyNav';
import { MapPinSolidIcon, SearchIcon } from '@shared/ui/icons';
import { openFindStorage } from '@shared/findStorageBus';
import { fetchPlaceDetails, fetchPlaceSuggestions, newSessionToken } from '@shared/placesApi';

export interface HomepageSearchProps {
  /** Operator-selectable presentation. `search-bar` is the original horizontal
   *  control; `promo-card` is the white Figma promotional card. */
  layout?: 'search-bar' | 'promo-card';
  /** Placeholder for the location input (Figma: "City, ZIP or Address"). */
  searchPlaceholder?: string;
  /** Find button label (desktop Figma: "Find Storage"). */
  ctaLabel?: string;
  /** Editor/harness fallback when Properties inventory counts are unavailable. */
  storageTypes?: string;
  /** Show the Storage Type dropdown at all. */
  showStorageType?: boolean;
  /** Dynamic facility-page base path, before the property's full slug. */
  searchUrl?: string;
  /** Duda external collection containing property slugs and addresses. */
  propertiesCollection?: string;
  /** City/state location-page base path, e.g. "/locations". */
  locationsUrl?: string;
  /** Deprecated; retained so existing Duda widget configuration remains compatible. */
  locationsCount?: number;
  /** Deprecated; retained so existing Duda widget configuration remains compatible. */
  locationsLabel?: string;
  /** Search-button accent. Defaults to the theme's --color_2, then red. */
  accentColor?: string;
  /** Layout-2 card heading. */
  cardHeading?: string;
  /** Layout-2 accent promotion copy; wraps naturally to the available width. */
  promotionText?: string;
  /** Layout-2 final promotion line, rendered in black. */
  promotionSuffix?: string;
  /** Layout-2 legal/disclosure copy below the promotion. */
  promotionDisclaimer?: string;
  /** Recent resolved city searches kept on this device (0 disables, max 5). */
  historyLimit?: number;
  inEditor?: boolean;
  siteId?: string;
}

const DEFAULT_TYPES = 'Storage Type,Self Storage,Parking';

interface SearchTarget { kind: 'state' | 'city' | 'property'; label: string; haystack: string; href: string; types: NavUnitType[]; }
interface GeoTarget { lat: number; lng: number; target: SearchTarget; fallbackTarget: SearchTarget; types: NavUnitType[]; }
interface StorageTypeOption { value: NavUnitType; label: string; }
interface RecentSearch { label: string; href: string; savedAt: number; }
const STORAGE_TYPE_OPTIONS: StorageTypeOption[] = [
  { value: 'storage', label: 'Self Storage' },
  { value: 'parking', label: 'Parking' },
];
const HISTORY_KEY = 'ti.homepageSearch.recentCities';
const HISTORY_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const FALLBACK_TARGETS: SearchTarget[] = [
  { kind: 'state', label: 'California', haystack: 'california ca', href: '/locations/california', types: ['storage', 'parking'] },
  // Downloaded data plus the supplied URL examples: Bakersfield has multiple
  // facilities, while Fullerton currently has one.
  { kind: 'city', label: 'Bakersfield', haystack: 'bakersfield california 93307 101 mt vernon', href: '/locations/california/bakersfield', types: ['storage', 'parking'] },
  { kind: 'city', label: 'Fullerton', haystack: 'fullerton california 92831 999 s raymond storage outlet fullerton', href: '/property-landing-page--value-tiers-test/california/fullerton/storage-outlet-fullerton-340079520', types: ['storage', 'parking'] },
  { kind: 'property', label: 'Storage Outlet Fullerton', haystack: 'fullerton california 92831 999 s raymond storage outlet fullerton', href: '/property-landing-page--value-tiers-test/california/fullerton/storage-outlet-fullerton-340079520', types: ['storage', 'parking'] },
];

function editorSafeHref(path: string, inEditor?: boolean, siteId?: string): string {
  let referrerPath = '';
  try { referrerPath = document.referrer ? new URL(document.referrer).pathname : ''; } catch { /* unavailable */ }
  const prefix = window.location.pathname.match(/^(\/home\/site\/[^/]+\/)/)?.[1]
    ?? referrerPath.match(/^(\/home\/site\/[^/]+\/)/)?.[1]
    ?? (inEditor && siteId ? `/home/site/${encodeURIComponent(siteId)}/` : '/');
  return prefix + path.replace(/^\/+/, '');
}

function Chevron() {
  return (
    <svg className="hs-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function distanceSquared(latA: number, lngA: number, latB: number, lngB: number): number {
  const latitudeScale = Math.cos(((latA + latB) / 2) * Math.PI / 180);
  const lat = latA - latB;
  const lng = (lngA - lngB) * latitudeScale;
  return lat * lat + lng * lng;
}

export function HomepageSearch({
  layout = 'search-bar',
  searchPlaceholder = 'City, ZIP or Address',
  ctaLabel = 'Find Storage',
  storageTypes = DEFAULT_TYPES,
  showStorageType = true,
  searchUrl = '/property-landing-page--value-tiers-test',
  propertiesCollection = 'Properties',
  locationsUrl = '/locations',
  accentColor,
  cardHeading = 'Find Storage Near Me',
  promotionText = '$1 Summer Move-In',
  promotionSuffix = 'Special',
  promotionDisclaimer = '*All new rentals are subject to a $30 Admin Fee. Other fees like coverage may apply, select a space to see price details.',
  historyLimit = 5,
  inEditor,
  siteId,
}: HomepageSearchProps) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<NavUnitType | ''>('');
  const [selectedTarget, setSelectedTarget] = useState<SearchTarget>();
  const [targets, setTargets] = useState<SearchTarget[]>(FALLBACK_TARGETS);
  const [geoTargets, setGeoTargets] = useState<GeoTarget[]>([]);
  const [inventoryTypesResolved, setInventoryTypesResolved] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsAbove, setSuggestionsAbove] = useState(false);
  const [suggestionsBottom, setSuggestionsBottom] = useState(0);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeAbove, setTypeAbove] = useState(false);
  const [activeType, setActiveType] = useState(-1);
  const [locating, setLocating] = useState(false);
  const [resolvingCity, setResolvingCity] = useState(false);
  const safeHistoryLimit = Math.max(0, Math.min(5, Math.floor(historyLimit)));
  const [recent, setRecent] = useState<RecentSearch[]>(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]') as Partial<RecentSearch>[];
      const cutoff = Date.now() - HISTORY_MAX_AGE;
      return Array.isArray(parsed) ? parsed.filter((x): x is RecentSearch =>
        typeof x.label === 'string' && typeof x.href === 'string' && typeof x.savedAt === 'number' && x.savedAt >= cutoff,
      ).slice(0, 5) : [];
    } catch { return []; }
  });
  const findRef = useRef<HTMLAnchorElement>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLFormElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const typeMenuRef = useRef<HTMLUListElement>(null);
  const typeOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const suggestionsId = 'hs-city-suggestions';
  const typeListId = 'hs-storage-types';

  useEffect(() => {
    let cancelled = false;
    void fetchLocationTree('#04 homepage-search', {
      collectionName: propertiesCollection,
      basePath: searchUrl,
      cityBasePath: locationsUrl,
    }).then((tree) => {
      if (cancelled) return;
      if (!tree.length) return;
      const mapped: SearchTarget[] = [];
      const mappedGeo: GeoTarget[] = [];
      const cityBase = locationsUrl.trim().replace(/\/+$/, '') || '/locations';
      for (const state of tree) {
        const stateTypes = [...new Set(state.cities.flatMap((city) => city.properties.flatMap((property) => property.vacantUnitTypes)))];
        mapped.push({ kind: 'state', label: state.label, haystack: `${state.label} ${state.key}`.toLowerCase(), href: state.href, types: stateTypes });
        for (const city of state.cities) {
          const cityHref = city.properties.length === 1 ? city.properties[0].href : city.href;
          const facilityTerms = city.properties.flatMap((property) => [property.label, property.address, property.street, property.zip]).join(' ');
          const cityTypes = [...new Set(city.properties.flatMap((property) => property.vacantUnitTypes))];
          const cityTarget: SearchTarget = { kind: 'city', label: city.label, haystack: `${city.label} ${state.label} ${city.key} ${facilityTerms}`.toLowerCase(), href: cityHref, types: cityTypes };
          const cityPageTarget: SearchTarget = { ...cityTarget, href: `${cityBase}/${state.key}/${city.key}` };
          mapped.push(cityTarget);
          for (const property of city.properties) {
            mapped.push({
              kind: 'property',
              label: property.label,
              haystack: [property.label, property.address, property.street, property.city, property.state, property.zip, city.label, state.label].join(' ').toLowerCase(),
              href: property.href,
              types: property.vacantUnitTypes,
            });
            if (property.lat != null && property.lng != null
              && Number.isFinite(property.lat) && property.lat >= -90 && property.lat <= 90
              && Number.isFinite(property.lng) && property.lng >= -180 && property.lng <= 180
              && (property.lat !== 0 || property.lng !== 0)) {
              mappedGeo.push({
                lat: property.lat,
                lng: property.lng,
                target: cityTarget,
                fallbackTarget: cityPageTarget,
                types: property.vacantUnitTypes,
              });
            }
          }
        }
      }
      setTargets(mapped);
      setGeoTargets(mappedGeo);
      setInventoryTypesResolved(true);
    });
    return () => { cancelled = true; };
  }, [propertiesCollection, searchUrl, locationsUrl]);

  const parts = storageTypes.split(',').map((s) => s.trim()).filter(Boolean);
  const typePlaceholder = parts[0] ?? 'Storage Type';
  const availableTypes = new Set(targets.flatMap((target) => target.types));
  const collectionTypeOptions = STORAGE_TYPE_OPTIONS.filter((option) => availableTypes.has(option.value));
  const typeOptions = inventoryTypesResolved ? collectionTypeOptions : STORAGE_TYPE_OPTIONS;
  const selectedTypeLabel = typeOptions.find((option) => option.value === type)?.label;
  const selectedTypeAvailable = !type || availableTypes.has(type);
  const filteredTargets = useMemo(
    () => (type ? targets.filter((target) => target.types.includes(type)) : targets),
    [targets, type],
  );

  useEffect(() => {
    if (inventoryTypesResolved && !selectedTypeAvailable) setType('');
  }, [inventoryTypesResolved, selectedTypeAvailable]);

  const match = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return undefined;
    if (selectedTarget?.label.toLowerCase() === needle && (!type || selectedTarget.types.includes(type))) return selectedTarget;
    // Exact state/city/facility names first. Address/ZIP and partial searches
    // then prefer a property over a broader city/state result.
    return filteredTargets.find((row) => row.label.toLowerCase() === needle)
      ?? filteredTargets.find((row) => row.kind === 'property' && row.haystack.includes(needle))
      ?? filteredTargets.find((row) => row.kind === 'city' && row.haystack.includes(needle))
      ?? filteredTargets.find((row) => row.haystack.includes(needle));
  }, [filteredTargets, q, selectedTarget, type]);

  // Suggestions are CITY-ONLY and therefore can never advertise a market the
  // Properties collection does not actually serve. Address/ZIP terms still find
  // the owning city because each city's haystack includes its facilities.
  const citySuggestions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return filteredTargets
      .filter((row) => row.kind === 'city' && row.haystack.includes(needle))
      .sort((a, b) => {
        const ae = a.label.toLowerCase() === needle ? -1 : 0;
        const be = b.label.toLowerCase() === needle ? -1 : 0;
        return ae - be || a.label.localeCompare(b.label);
      })
      .slice(0, 8);
  }, [filteredTargets, q]);

  const visibleSuggestions: SearchTarget[] = q.trim()
    ? citySuggestions
    : recent.slice(0, safeHistoryLimit).flatMap((item) => {
        const target = targets.find((row) => row.kind === 'city' && row.href === item.href)
          ?? geoTargets.find((row) => row.fallbackTarget.href === item.href)?.fallbackTarget;
        return target && (!type || target.types.includes(type)) ? [{ ...target, label: item.label }] : [];
      });
  const showLocationPanel = suggestionsOpen && (!q.trim() || visibleSuggestions.length > 0);

  useLayoutEffect(() => {
    if (!showLocationPanel) {
      setSuggestionsAbove(false);
      return undefined;
    }

    const placePanel = () => {
      const bar = barRef.current;
      const panel = suggestionsRef.current;
      const container = panelContainerRef.current;
      if (!bar || !panel || !container) return;
      const barRect = bar.getBoundingClientRect();
      const panelHeight = panel.getBoundingClientRect().height;
      const below = window.innerHeight - barRect.bottom - 8;
      const above = barRect.top - 8;
      setSuggestionsBottom(container.getBoundingClientRect().bottom - barRect.top + 8);
      setSuggestionsAbove(panelHeight > below && above > below);
    };

    placePanel();
    window.addEventListener('resize', placePanel);
    window.addEventListener('scroll', placePanel, true);
    return () => {
      window.removeEventListener('resize', placePanel);
      window.removeEventListener('scroll', placePanel, true);
    };
  }, [showLocationPanel, visibleSuggestions.length, q]);

  useLayoutEffect(() => {
    if (!typeOpen) {
      setTypeAbove(false);
      return undefined;
    }

    const placeMenu = () => {
      const bar = barRef.current;
      const menu = typeMenuRef.current;
      if (!bar || !menu) return;
      const barRect = bar.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const below = window.innerHeight - barRect.bottom - 8;
      const above = barRect.top - 8;
      setTypeAbove(menuHeight > below && above > below);
    };

    placeMenu();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [typeOpen, typeOptions.length]);

  useEffect(() => {
    if (typeOpen && activeType >= 0) typeOptionRefs.current[activeType]?.focus();
  }, [typeOpen, activeType]);

  const remember = (target: SearchTarget) => {
    if (!safeHistoryLimit) return;
    const next = [
      { label: target.label, href: target.href, savedAt: Date.now() },
      ...recent.filter((item) => item.href !== target.href),
    ].slice(0, safeHistoryLimit);
    setRecent(next);
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const chooseCity = (target: SearchTarget) => {
    setQ(target.label);
    setSelectedTarget(target);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
  };

  const chooseCurrentLocation = () => {
    if (locating || !navigator.geolocation || !geoTargets.length) return;
    const candidates = type ? geoTargets.filter((candidate) => candidate.types.includes(type)) : geoTargets;
    if (!candidates.length) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nearest = candidates.reduce((best, candidate) => (
          distanceSquared(coords.latitude, coords.longitude, candidate.lat, candidate.lng)
            < distanceSquared(coords.latitude, coords.longitude, best.lat, best.lng)
            ? candidate : best
        ));
        chooseCity(nearest.target);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const navigateToNearbyCity = async () => {
    const query = q.trim();
    if (!query) {
      if (!openFindStorage()) console.warn('[HomepageSearch] Find Storage: no navigation bar answered the open request');
      return;
    }
    if (resolvingCity) return;
    setResolvingCity(true);
    try {
      const sessionToken = newSessionToken();
      const predictions = await fetchPlaceSuggestions(query, { types: '(cities)', sessionToken });
      const exact = predictions.find((p) => p.mainText.trim().toLowerCase() === query.toLowerCase()) ?? predictions[0];
      if (!exact) {
        if (!openFindStorage()) console.warn('[HomepageSearch] No city match and no navigation bar answered the open request');
        return;
      }
      const place = await fetchPlaceDetails(exact.placeId, { sessionToken });
      if (!place || place.lat == null || place.lng == null) {
        if (!openFindStorage()) console.warn('[HomepageSearch] City details were incomplete and no navigation bar answered the open request');
        return;
      }
      const candidates = type ? geoTargets.filter((candidate) => candidate.types.includes(type)) : geoTargets;
      if (!candidates.length) {
        if (!openFindStorage()) console.warn('[HomepageSearch] No geocoded properties and no navigation bar answered the open request');
        return;
      }
      const nearest = candidates.reduce((best, candidate) => (
        distanceSquared(place.lat!, place.lng!, candidate.lat, candidate.lng)
          < distanceSquared(place.lat!, place.lng!, best.lat, best.lng)
          ? candidate : best
      ));
      const destination = nearest.fallbackTarget;
      const url = new URL(destination.href, window.location.origin);
      if (type) url.searchParams.set('sl_types', type);
      remember({
        ...destination,
        label: place.address.city || exact.mainText || query,
        href: destination.href,
      });
      window.location.assign(editorSafeHref(url.pathname + url.search, inEditor, siteId));
    } finally {
      setResolvingCity(false);
    }
  };

  // The Properties collection already produced the correct state/city/facility
  // target according to the one-vs-many rule. No generic results page is invented.
  const href = (() => {
    if (!match) return undefined;
    let url: URL;
    try { url = new URL(match.href, window.location.origin); } catch { return undefined; }
    if (url.origin !== window.location.origin) return undefined;
    if (type) url.searchParams.set('sl_types', type);
    return editorSafeHref(url.pathname + url.search, inEditor, siteId);
  })();

  const style = accentColor ? ({ ['--hs-accent']: accentColor } as React.CSSProperties) : undefined;
  const promoCard = layout === 'promo-card';

  return (
    <div
      className={`hs hs--${layout}`}
      style={style}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setSuggestionsOpen(false);
          setTypeOpen(false);
        }
      }}
    >
      <div ref={panelContainerRef} className={promoCard ? 'hs-card' : 'hs-search-layout'}>
        {promoCard && <h2 className="hs-card-heading">{cardHeading}</h2>}
        <form ref={barRef} className="hs-bar" onSubmit={(e) => { e.preventDefault(); findRef.current?.click(); }}>
        <div className="hs-field">
          <input
            className="hs-input"
            type="text"
            value={q}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showLocationPanel}
            aria-controls={suggestionsId}
            aria-activedescendant={activeSuggestion >= 0 ? `hs-city-option-${activeSuggestion}` : undefined}
            onFocus={() => { setTypeOpen(false); setSuggestionsOpen(true); }}
            onChange={(e) => { const v = e.target.value; setQ(v.charAt(0).toUpperCase() + v.slice(1)); setSelectedTarget(undefined); setSuggestionsOpen(true); setActiveSuggestion(-1); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && visibleSuggestions.length) {
                e.preventDefault(); setSuggestionsOpen(true); setActiveSuggestion((i) => (i + 1) % visibleSuggestions.length);
              } else if (e.key === 'ArrowUp' && visibleSuggestions.length) {
                e.preventDefault(); setSuggestionsOpen(true); setActiveSuggestion((i) => (i <= 0 ? visibleSuggestions.length - 1 : i - 1));
              } else if (e.key === 'Enter' && suggestionsOpen && activeSuggestion >= 0) {
                e.preventDefault(); chooseCity(visibleSuggestions[activeSuggestion]);
              } else if (e.key === 'Escape') {
                e.preventDefault(); setSuggestionsOpen(false); setActiveSuggestion(-1);
              }
            }}
          />
        </div>

        {showStorageType && (
          <div className="hs-type">
            <button
              className="hs-type-trigger"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={typeOpen}
              aria-controls={typeListId}
              onClick={() => { setSuggestionsOpen(false); setTypeOpen((open) => !open); setActiveType(-1); }}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && typeOptions.length) {
                  e.preventDefault();
                  setSuggestionsOpen(false);
                  setTypeOpen(true);
                  setActiveType(e.key === 'ArrowDown' ? 0 : typeOptions.length - 1);
                } else if (e.key === 'Escape') {
                  setTypeOpen(false);
                }
              }}
            >
              <span className="hs-type-label">{selectedTypeLabel || typePlaceholder}</span>
              <Chevron />
            </button>
            {typeOpen && (
              <ul
                className={typeAbove ? 'hs-type-menu hs-type-menu--above' : 'hs-type-menu'}
                ref={typeMenuRef}
                id={typeListId}
                role="listbox"
                aria-label={typePlaceholder}
              >
                {typeOptions.map((option, index) => (
                  <li key={option.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={type === option.value}
                      ref={(node) => { typeOptionRefs.current[index] = node; }}
                      className={index === activeType ? 'hs-type-option hs-type-option--active' : 'hs-type-option'}
                      onMouseEnter={() => setActiveType(index)}
                      onClick={() => { setType(option.value); setSelectedTarget(undefined); setTypeOpen(false); setActiveType(-1); }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault(); setActiveType((index + 1) % typeOptions.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault(); setActiveType((index - 1 + typeOptions.length) % typeOptions.length);
                        } else if (e.key === 'Escape') {
                          e.preventDefault(); setTypeOpen(false);
                        }
                      }}
                    >{option.label}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <a
          ref={findRef}
          className="hs-find"
          href={href ?? undefined}
          onClick={(e) => {
            if (!href) {
              e.preventDefault();
              void navigateToNearbyCity();
              return;
            }
            if (match) remember(match.kind === 'property'
              ? (filteredTargets.find((target) => target.kind === 'city' && target.haystack.includes(match.label.toLowerCase())) ?? match)
              : match);
          }}
        >
          <span className="hs-find-label">{ctaLabel}</span>
          <SearchIcon className="hs-search-icon" size={22} />
        </a>
        </form>

        {showLocationPanel && (
          <ul
            ref={suggestionsRef}
            className={`hs-suggestions${suggestionsAbove ? ' hs-suggestions--above' : ''}`}
            id={suggestionsId}
            role="listbox"
            aria-label="Storage locations"
            style={suggestionsAbove ? ({ '--hs-suggestions-bottom': `${suggestionsBottom}px` } as React.CSSProperties) : undefined}
          >
          {!q.trim() && (
            <>
              <li role="presentation">
                <button className="hs-current-location" type="button" disabled={locating} onClick={chooseCurrentLocation}>
                  <MapPinSolidIcon size={24} />
                  <span>Current Location</span>
                </button>
              </li>
              {visibleSuggestions.length > 0 && (
                <li className="hs-history-head" role="presentation">Search History</li>
              )}
            </>
          )}
          {visibleSuggestions.map((city, index) => (
            <li key={`${city.label}-${city.href}`} role="presentation">
              <button
                id={`hs-city-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeSuggestion}
                className={`hs-suggestion${index === activeSuggestion ? ' hs-suggestion--active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => chooseCity(city)}
              >
                <span>{city.label}</span>
              </button>
            </li>
          ))}
          </ul>
        )}

        {promoCard && (
          <div className="hs-promotion">
            <p className="hs-promotion-title"><span>{promotionText}</span><strong>{promotionSuffix}</strong></p>
            {promotionDisclaimer && <p className="hs-promotion-disclaimer">{promotionDisclaimer}</p>}
          </div>
        )}
      </div>

    </div>
  );
}
