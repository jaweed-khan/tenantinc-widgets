// ===========================================================================
// Address autocomplete — Kangaroo's server-side proxy over Google Places.
//
// The Google key lives on the SERVER and is attached there. Nothing secret
// belongs in this file: a key in a public bundle can be read from devtools and
// spent against the billing account, which is the whole reason the proxy
// exists. So these are plain unauthenticated GETs.
//
// Two calls, in the order a picker needs them:
//   autocomplete  — on every (debounced) keystroke
//   details       — once, when the shopper picks a suggestion
// ===========================================================================

/** Proxy base. Overridable per site, since staging and production differ. */
export const DEFAULT_PLACES_BASE = 'https://sandbox.kangaroodev.co.uk/tenantproxy';

export interface PlacePrediction {
  placeId: string;
  description: string;
  /** Google's own split — the street line, to render in bold. */
  mainText: string;
  /** The city/state/country line beneath it. */
  secondaryText: string;
}

export interface PlaceAddress {
  street: string;
  city: string;
  state: string;
  stateCode: string;
  zip: string;
  country: string;
  countryCode: string;
}

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  address: PlaceAddress;
  lat?: number;
  lng?: number;
}

/**
 * A session token groups the keystrokes AND the closing `details` call into one
 * billable Google session. Without one every keystroke bills separately.
 *
 * One token per lookup — NOT per page load — and discard it after `details`,
 * because a reused token reverts to per-request billing.
 */
export function newSessionToken(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    // randomUUID needs a secure context; the token only has to be unique.
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * Where a CUSTOMER's own address may be, as opposed to where the company has
 * property. The two are different questions and must not share a default:
 *   - #04's homepage search looks for a storage LOCATION, so it stays 'us' —
 *     the portfolio is US-only, and offering a Canadian city would suggest a
 *     page that does not exist.
 *   - the rental flow asks for the shopper's billing / mailing / business
 *     address, and a Canadian customer renting a US unit is perfectly ordinary.
 *     That is why Canadian addresses returned nothing: not a bug in the search,
 *     just the default below.
 * Google takes up to 5 ISO codes here.
 */
export const CUSTOMER_ADDRESS_COUNTRIES = 'us,ca';

interface AutocompleteOptions {
  base?: string;
  /** ISO country codes, up to 5. Default 'us' — see CUSTOMER_ADDRESS_COUNTRIES. */
  country?: string;
  /** 'address' for street addresses, '(cities)' for a city picker. */
  types?: string;
  sessionToken?: string;
  signal?: AbortSignal;
}

/**
 * Address suggestions for what the shopper has typed.
 *
 * Fails SOFT to an empty list. A dead proxy, a rate limit or a network blip
 * must leave them typing an address by hand, never blocked — autocomplete is a
 * convenience on top of a field that already works.
 *
 * A fragment matching nothing is a 200 with count 0, not an error, so an empty
 * list is a normal result and not worth logging.
 */
export async function fetchPlaceSuggestions(
  input: string, opts: AutocompleteOptions = {},
): Promise<PlacePrediction[]> {
  const q = input.trim();
  // The proxy rejects anything outside 1–200 chars, and under 3 the suggestions
  // are noise — so this is both a guard and a way to not pay for them.
  if (q.length < 3 || q.length > 200) return [];
  const base = (opts.base || DEFAULT_PLACES_BASE).replace(/\/$/, '');
  const params = new URLSearchParams({
    input: q,
    country: opts.country ?? 'us',
    types: opts.types ?? 'address',
  });
  if (opts.sessionToken) params.set('sessionToken', opts.sessionToken);
  try {
    const res = await fetch(`${base}/api/places/autocomplete?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    });
    if (!res.ok) return [];
    const json = await res.json() as { ok?: boolean; predictions?: PlacePrediction[] };
    if (!json?.ok || !Array.isArray(json.predictions)) return [];
    return json.predictions.filter((p) => p && typeof p.placeId === 'string');
  } catch {
    // Includes the AbortError from a superseded keystroke, which is routine.
    return [];
  }
}

/**
 * A chosen prediction → a structured address.
 *
 * Returns null on any failure, which the caller treats as "keep whatever they
 * typed" rather than clearing the field.
 */
export async function fetchPlaceDetails(
  placeId: string, opts: { base?: string; sessionToken?: string; signal?: AbortSignal } = {},
): Promise<PlaceDetails | null> {
  if (!placeId) return null;
  const base = (opts.base || DEFAULT_PLACES_BASE).replace(/\/$/, '');
  const params = new URLSearchParams({ placeId });
  if (opts.sessionToken) params.set('sessionToken', opts.sessionToken);
  try {
    const res = await fetch(`${base}/api/places/details?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      ok?: boolean;
      placeId?: string;
      formattedAddress?: string;
      address?: Partial<PlaceAddress>;
      // The proxy returns these as STRINGS.
      lat?: string | number;
      lng?: string | number;
    };
    if (!json?.ok || !json.address) return null;
    const num = (v: string | number | undefined): number | undefined => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const a = json.address;
    return {
      placeId: json.placeId ?? placeId,
      formattedAddress: json.formattedAddress ?? '',
      address: {
        street: a.street ?? '',
        city: a.city ?? '',
        state: a.state ?? '',
        stateCode: a.stateCode ?? '',
        zip: a.zip ?? '',
        country: a.country ?? '',
        countryCode: a.countryCode ?? '',
      },
      lat: num(json.lat),
      lng: num(json.lng),
    };
  } catch {
    return null;
  }
}
