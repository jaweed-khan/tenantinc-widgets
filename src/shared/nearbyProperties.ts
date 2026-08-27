// Shared nearby-properties data layer, used by #07 nearby-locations and the
// #05 space-list "Nearby Storage" accordion section. Each widget passes its own
// API credentials (from its config.json) so this stays config-agnostic.
//
//   • fetchProperties()      – all company properties (lat/lng, name, address, phone)
//   • extractNearbyProperties() – map the response to base cards with coordinates
//   • getUserLocation()      – browser geolocation (allow/deny prompt), or null
//   • haversineMiles()       – great-circle distance
//   • fetchPropertySpaces()  – per-property spaces + promo via the space-groups calls
//   • fetchSpaceGroupSpaces() – spaces + promo for MANY space groups in one call

import {
  fetchPropertiesPreferCollection,
  type PropertiesSourceOptions,
} from './propertiesSource';
import { withTimeout, timeoutSignal, TIMEOUTS } from './withTimeout';

export interface NearbyApiConfig {
  baseUrl: string;
  appId: string;
  apiKey: string;
  companyId: string;
}

export interface NearbySpace {
  size: string;
  subtype: string;
  inStorePrice: number;
  startingPrice: number;
  /**
   * The PRICING TIER's id — what a card's "Select" hands to the rental flow
   * (see @shared/unitHandoff). Not a rentable unit id; the flow resolves a real
   * unit from `size` + price, exactly as #05 and #08 already do.
   *
   * Optional because hand-written demo/fixture spaces have no API row behind
   * them; a card whose space carries no tier id simply renders Select inert
   * rather than handing the rental page an id it cannot resolve.
   */
  tierId?: string;
  /** The tier's group (`tier_id` on the API row) — context for the same handoff. */
  unitGroupId?: string;
}

/** One facility's card data: its cheapest spaces and its first promotion. */
export interface PropertySpaceData {
  promo?: string;
  spaces: NearbySpace[];
}

/** A property before distance/spaces/promo are attached. */
export interface NearbyBaseProperty {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /**
   * Did the API actually give coordinates? **False** → lat/lng are 0
   * placeholders and must not be plotted or measured; only ever false when the
   * caller passed `requireCoords: false` (see extractNearbyProperties).
   *
   * Optional, and absent means "assume yes": the default extraction drops
   * coordinate-less rows anyway, and hand-written fixtures shouldn't have to
   * restate it. Test with `hasCoords !== false`, never a bare truthiness check.
   */
  hasCoords?: boolean;
  address: string;
  /** Raw city/state off the Address object — for filtering (see #08 map-locations). */
  city?: string;
  state?: string;
  /**
   * `state/city/property-name-<id>` — the property's page path. Kept because it,
   * not Address, is what the nav's links are built from; see the note at the
   * assignment in extractNearbyProperties.
   */
  slug?: string;
  phone: string;
  /** First facility photo URL from the API, if any (else undefined → placeholder). */
  imageUrl?: string;
}

const headers = (cfg: NearbyApiConfig) => ({
  'x-storageapi-date': String(Math.floor(Date.now() / 1000)),
  'x-storageapi-key': cfg.apiKey,
});

/**
 * `…/applications/{appId}/{version}/companies/{companyId}`.
 *
 * v2 for properties and the per-property space-group chain; the BATCHED
 * space-groups endpoint (`fetchSpaceGroupSpaces`) is **v1** — it is a different
 * route, not a newer one, so the version is a parameter rather than a constant.
 */
const companyBase = (cfg: NearbyApiConfig, version: 'v1' | 'v2' = 'v2') =>
  `${cfg.baseUrl}/applications/${cfg.appId}/${version}/companies/${cfg.companyId}`;

// ---------------------------------------------------------------------------
// Raw response types (only what we read)
// ---------------------------------------------------------------------------

interface ApiAddress {
  address?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  formatted_address?: string | null;
  lat?: number;
  lng?: number;
}

interface ApiPhone { phone?: string; number?: string; status?: number; }

interface ApiPropertyRaw {
  id: string;
  name?: string;
  Address?: ApiAddress | '';
  Phones?: ApiPhone[] | '';
  Images?: unknown[] | '';
  /** `state/city/property-name-<id>` — the page path. */
  slug?: string;
}

interface PropertiesResponse {
  applicationData: Record<string, Array<{ status: number; data: { properties: ApiPropertyRaw[] } }>>;
}

interface ApiSpaceGroup { id: string; name?: string; }
interface SpaceGroupsResponse {
  applicationData: Record<string, Array<{ status: number; data: { spaceGroups: ApiSpaceGroup[] } }>>;
}

interface ApiAmenity { name: string; value?: string; type?: string | null; sort_order?: number; show_in_website?: number; }
interface ApiTier {
  // Identity of the tier row. Both are what #05 maps to `Unit.id`/`unitGroupId`,
  // and they ride through to the card's Select handoff. Optional here (the older
  // per-property route was only ever read for prices) so a response missing them
  // degrades to an inert Select instead of failing the whole parse.
  id?: string;
  tier_id?: string;
  description: string;
  sell_rate: number | null;
  set_rate: number | null;
  units?: { count: number; min_price: number | null; max_price: number | null };
  vacant?: { count: number };
  amenities?: ApiAmenity[];
  allocated_promo?: { id?: string; name?: string } | Record<string, never>;
}
interface ApiGroup { name: string; tiers: ApiTier[]; }
interface GroupsResponse {
  applicationData: Record<string, Array<{ status: number; data: { spaceGroupProfile: Record<string, { groups: ApiGroup[] }> } }>>;
}

/**
 * The BATCHED endpoint's envelope. Same `spaceGroupProfile`, but keyed by SPACE
 * GROUP ID first and then by space TYPE id, so its groups sit one level deeper
 * than the per-property route's:
 *
 *   per property: spaceGroupProfile[<spaceTypeId>].groups
 *   batched:      spaceGroupProfile[<spaceGroupId>][<spaceTypeId>].groups
 *
 * Typed as `unknown` under the group id and walked by `groupsUnder`, which reads
 * either depth — the two routes are documented separately and this is the seam
 * where a shape change would otherwise silently price every card at zero.
 */
interface BatchGroupsResponse {
  applicationData: Record<string, Array<{ status: number; data: { spaceGroupProfile: Record<string, unknown> } }>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return raw;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

function buildAddress(a: ApiAddress): string {
  if (a.formatted_address) return a.formatted_address;
  const line1 = [a.address, a.address2].map((s) => s?.trim()).filter(Boolean).join(' ');
  return [line1, a.city, `${a.state ?? ''} ${a.zip ?? ''}`.trim()].filter(Boolean).join(', ');
}

/** First usable image URL from the API's Images array (string or object shape). */
function firstImageUrl(images: unknown): string | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const first = images[0];
  if (typeof first === 'string') return first.trim() || undefined;
  if (first && typeof first === 'object') {
    const o = first as Record<string, unknown>;
    for (const key of ['url', 'image', 'src', 'path', 'full', 'large', 'original', 'thumbnail']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) return v;
    }
  }
  return undefined;
}

// boolean/"Yes" amenities → the name is the label; otherwise the value is.
function amenityLabel(a: ApiAmenity): string {
  return a.type === 'boolean' || a.value === 'Yes' || a.value === 'No' ? a.name : (a.value ?? a.name);
}

/** Great-circle distance in miles between two lat/lng points. */
export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8; // Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Card-ready distance label: thousands separator, decimals dropped.
 *   5183.9 → "5,183 Miles"    1.7 → "1 Miles"
 * Truncates rather than rounds, per the spec'd example (5183.9 → 5,183).
 */
export function formatDistance(miles: number): string {
  return `${Math.trunc(miles).toLocaleString('en-US')} Miles`;
}

/**
 * Browser geolocation, resolving null on denial/error/timeout (never rejects).
 *
 * ── THE `timeout` OPTION IS NOT ENOUGH, AND THAT WAS A HANG ─────────────────
 * Geolocation's own `timeout` does not start counting until the permission
 * prompt is ANSWERED — it bounds acquiring a fix, not deciding whether to allow
 * one. So a visitor who ignores the prompt, or dismisses it without choosing,
 * gets NEITHER callback: this promise never settled, and every caller that
 * `Promise.all`s it (#07's card list, #05's nearby section, #08, #02's mega
 * menu) waited forever. #07 showed skeleton cards for the life of the page, and
 * because it depends on whether a prompt appears and what the visitor does with
 * it, it came and went between reloads.
 *
 * `withTimeout` puts a WALL CLOCK over the whole ask, prompt included, and its
 * expiry lands on the same `null` that a denial does — which every caller
 * already handles by rendering without distances. Long enough for a visitor to
 * read the prompt and click; short enough that one left sitting doesn't hold a
 * widget on skeletons.
 *
 * A late answer is then ignored rather than applied: there is no cancelling a
 * geolocation request, so the browser may still deliver a position after we have
 * given up. Rendering the list unordered is the documented degradation; jumping
 * the cards around ten seconds later would be worse.
 */
export function getUserLocation(timeoutMs = TIMEOUTS.geolocation): Promise<{ lat: number; lng: number } | null> {
  const ask = new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    );
  });
  return withTimeout(ask, timeoutMs, null, 'geolocation (prompt unanswered?)');
}

// ---------------------------------------------------------------------------
// Fetches
// ---------------------------------------------------------------------------

export async function fetchProperties(
  cfg: NearbyApiConfig,
  opts: PropertiesSourceOptions = {},
): Promise<unknown> {
  // Duda's "Properties" collection first (no API key, no round trip); the keyed
  // call is the fallback. Same envelope either way — see @shared/propertiesSource.
  return fetchPropertiesPreferCollection(cfg.appId, async () => {
    const res = await fetch(`${companyBase(cfg)}/properties?unit_type_counts=true`, { headers: headers(cfg), signal: timeoutSignal(TIMEOUTS.request) });
    if (!res.ok) throw new Error(`fetchProperties failed: ${res.status} ${res.statusText}`);
    return res.json();
  }, opts);
}

/**
 * Properties mapped to the base card shape.
 *
 * By default only those with usable coordinates: #07 and #05's nearby section
 * rank by distance, so a property that can't be placed can't be ranked.
 *
 * `requireCoords: false` keeps the rest, for a consumer that lists by something
 * other than distance — #08's city page groups by `Address.city`. It matters:
 * verified live 2026-08-13 that ALL SEVEN properties on the current company have
 * `lat: null, lng: null`, so the default would drop every one of them and render
 * an empty page. Coordinate-less rows come back with lat/lng 0 and `hasCoords`
 * false, so callers can hide the map and distances instead of plotting them off
 * the coast of Africa.
 */
export function extractNearbyProperties(
  raw: unknown,
  appId: string,
  opts: { requireCoords?: boolean } = {},
): NearbyBaseProperty[] {
  const { requireCoords = true } = opts;
  const response = raw as PropertiesResponse;
  const list = response?.applicationData?.[appId]?.[0]?.data?.properties ?? [];
  const out: NearbyBaseProperty[] = [];

  for (const p of list) {
    const addr = p.Address && typeof p.Address === 'object' ? p.Address : null;
    if (!addr) continue;
    const hasCoords = typeof addr.lat === 'number' && typeof addr.lng === 'number';
    if (requireCoords && !hasCoords) continue;
    const firstPhone = Array.isArray(p.Phones) ? p.Phones.find((ph) => ph.status !== 0) : undefined;
    out.push({
      id: p.id,
      name: p.name ?? '',
      // 0/0 rather than null keeps the type a plain number for the distance and
      // map maths; `hasCoords` is the flag callers must check first.
      lat: hasCoords ? (addr.lat as number) : 0,
      lng: hasCoords ? (addr.lng as number) : 0,
      hasCoords,
      address: buildAddress(addr),
      // Kept separate from the formatted address so a city page can filter on it
      // exactly, rather than substring-matching "…, Irvine, CA 92620".
      city: (addr.city ?? '').trim(),
      state: (addr.state ?? '').trim(),
      // The slug is the PAGE URL, so a /locations/{state}/{city} page has to be
      // able to match on it — the nav builds those links from the slug, and the
      // slug and Address disagree on three live properties. Address alone would
      // leave a nav link resolving to an empty page.
      slug: typeof p.slug === 'string' ? p.slug.trim() : '',
      phone: firstPhone ? formatPhone(firstPhone.phone ?? firstPhone.number ?? '') : '',
      imageUrl: firstImageUrl(p.Images),
    });
  }
  return out;
}

/**
 * Fetch a property's spaces (cheapest few, in-store + starting price) and its
 * first promotion title, via the space-groups list → groups chain. Returns
 * empty data (never throws) so one property's failure can't break the grid.
 */
export async function fetchPropertySpaces(
  cfg: NearbyApiConfig,
  propertyId: string,
): Promise<PropertySpaceData> {
  const base = companyBase(cfg);
  try {
    const listRes = await fetch(`${base}/properties/${propertyId}/space-groups`, { headers: headers(cfg), signal: timeoutSignal(TIMEOUTS.request) });
    if (!listRes.ok) return { spaces: [] };
    const listJson = (await listRes.json()) as SpaceGroupsResponse;
    const groups = listJson?.applicationData?.[cfg.appId]?.[0]?.data?.spaceGroups ?? [];
    // Prefer the "Website group" (public-facing), else the first available.
    const sg = groups.find((g) => /website/i.test(g.name ?? '')) ?? groups[0];
    if (!sg) return { spaces: [] };

    const grpRes = await fetch(`${base}/properties/${propertyId}/space-groups/${sg.id}/groups`, { headers: headers(cfg), signal: timeoutSignal(TIMEOUTS.request) });
    if (!grpRes.ok) return { spaces: [] };
    const grpJson = (await grpRes.json()) as GroupsResponse;
    const profile = grpJson?.applicationData?.[cfg.appId]?.[0]?.data?.spaceGroupProfile;
    if (!profile) return { spaces: [] };

    const profileGroups: ApiGroup[] = [];
    for (const prof of Object.values(profile)) profileGroups.push(...(prof.groups ?? []));
    return spacesFromGroups(profileGroups);
  } catch {
    return { spaces: [] };
  }
}

/**
 * Every space group's spaces + promo in **ONE** request.
 *
 *   GET …/v1/companies/{companyId}/space-groups?space_group_id=A&space_group_id=B…
 *
 * The group ids repeat as a query parameter, one per group, exactly as the API
 * documents it. This replaces the per-property chain for #07: that route costs
 * two sequential round trips per facility, so a page could only afford to price
 * the cards actually on screen, whereas this prices the whole portfolio at once
 * and every later page turn is free.
 *
 * Keyed by SPACE GROUP id, not property id — this layer has no idea which
 * property a group belongs to. `PropertiesInternal` holds that join, and the
 * caller applies it (see `fetchSpacesForProperties` in the widget's nearbyApi).
 *
 * Fails soft to an EMPTY MAP, never throws: an unreachable batch is the same
 * situation as an unreachable per-property lookup, and the caller renders cards
 * without prices rather than no cards.
 */
export async function fetchSpaceGroupSpaces(
  cfg: NearbyApiConfig,
  spaceGroupIds: string[],
): Promise<Map<string, PropertySpaceData>> {
  const out = new Map<string, PropertySpaceData>();
  // De-duplicated: two properties sharing a group would otherwise repeat the
  // parameter, and the URL is capped in practice by servers and proxies.
  const ids = [...new Set(spaceGroupIds.filter(Boolean))];
  if (!ids.length) return out;

  try {
    const query = ids.map((id) => `space_group_id=${encodeURIComponent(id)}`).join('&');
    const res = await fetch(`${companyBase(cfg, 'v1')}/space-groups?${query}`, { headers: headers(cfg), signal: timeoutSignal(TIMEOUTS.request) });
    if (!res.ok) return out;
    const json = (await res.json()) as BatchGroupsResponse;
    const profile = json?.applicationData?.[cfg.appId]?.[0]?.data?.spaceGroupProfile;
    if (!profile) return out;

    for (const [groupId, node] of Object.entries(profile)) {
      out.set(groupId, spacesFromGroups(groupsUnder(node)));
    }
    return out;
  } catch {
    return out;
  }
}

/**
 * The `groups` arrays under one `spaceGroupProfile` entry, at EITHER depth.
 *
 * The batched route nests by space TYPE id first (`{ wNjG5IpNvK: { groups: […] } }`)
 * where the per-property one does not (`{ groups: […] }`). Reading both costs a
 * single `in` check and means a route that drops or gains that level cannot
 * silently yield zero tiers — which would render as a card with no prices rather
 * than as an error.
 */
function groupsUnder(node: unknown): ApiGroup[] {
  if (!node || typeof node !== 'object') return [];
  const direct = (node as { groups?: ApiGroup[] }).groups;
  if (Array.isArray(direct)) return direct;
  const out: ApiGroup[] = [];
  for (const child of Object.values(node as Record<string, unknown>)) {
    if (child && typeof child === 'object') {
      const groups = (child as { groups?: ApiGroup[] }).groups;
      if (Array.isArray(groups)) out.push(...groups);
    }
  }
  return out;
}

/**
 * Groups → the card's cheapest three spaces and its first promotion.
 *
 * Shared by both routes so the batched call cannot drift from the per-property
 * one: a card must look identical whichever fetched it.
 *
 * The promo is read from ALL tiers, before the vacancy filter, because a promo
 * belongs to the facility rather than to the space that happens to be cheapest —
 * dropping it with a full tier would make the banner flicker in and out as
 * occupancy changes.
 */
function spacesFromGroups(groups: ApiGroup[]): PropertySpaceData {
  const tiers: ApiTier[] = [];
  for (const g of groups) tiers.push(...(g.tiers ?? []));

  let promo: string | undefined;
  const spaces: NearbySpace[] = [];
  for (const t of tiers) {
    if (!promo && t.allocated_promo && 'id' in t.allocated_promo && t.allocated_promo.name) {
      promo = t.allocated_promo.name;
    }
    // Only offer tiers that have vacancy and a real starting price.
    if ((t.vacant?.count ?? 0) <= 0) continue;
    const startingPrice = t.sell_rate ?? t.units?.min_price ?? 0;
    if (startingPrice <= 0) continue;
    const website = [...(t.amenities ?? [])]
      .filter((a) => a.show_in_website === 1)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    spaces.push({
      size: t.description,
      subtype: website[0] ? amenityLabel(website[0]) : '',
      inStorePrice: t.set_rate ?? t.units?.max_price ?? 0,
      startingPrice,
      tierId: t.id,
      unitGroupId: t.tier_id,
    });
  }

  // Cheapest three, so the card leads with the best-value spaces.
  return { promo, spaces: spaces.sort((a, b) => a.startingPrice - b.startingPrice).slice(0, 3) };
}
