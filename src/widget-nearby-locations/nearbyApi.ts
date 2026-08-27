import cfg from './config.json';
import {
  fetchProperties as sharedFetchProperties,
  extractNearbyProperties,
  fetchPropertySpaces as sharedFetchPropertySpaces,
  fetchSpaceGroupSpaces,
  getUserLocation,
  haversineMiles,
  formatDistance,
  type NearbyApiConfig,
  type NearbyBaseProperty,
  type NearbySpace,
  type PropertySpaceData,
} from '@shared/nearbyProperties';
import { resolveCompanyIdFromSources } from '@shared/companySource';
import { asPropertiesResponse } from '@shared/propertiesSource';
import {
  INTERNAL_PROPERTIES_COLLECTION,
  fetchPriorityOrder,
  fetchSpaceGroupBinding,
  propertyLikeRows,
  readInternalProperties,
  sortByPriorityThenName,
} from '@shared/internalProperties';
import { logSource } from '@shared/dudaCollections';

// Thin widget adapter: binds the shared nearby-properties layer to this widget's
// own API credentials (config.json). The shared module holds all the logic.

export { getUserLocation, haversineMiles, formatDistance };
export { fetchPriorityOrder, sortByPriorityThenName, INTERNAL_PROPERTIES_COLLECTION };
export type { NearbySpace };

/** A card-ready property once distance/spaces/promo are attached. */
export interface NearbyProperty extends NearbyBaseProperty {
  distanceMiles: number | null;
  promo?: string;
  spaces: NearbySpace[];
}

/**
 * This widget's credentials, with the company from the `Company` collection.
 *
 * The company is site data, not build output — config.json's value is only the
 * fallback for the Duda editor, the dev harness, and sites with no `Company`
 * collection yet. The read is cached in @shared/companySource, so resolving it per
 * call costs one collection read for the whole page.
 */
async function creds(): Promise<NearbyApiConfig> {
  return { ...cfg, companyId: await resolveCompanyIdFromSources('#07 nearby', {}, cfg.companyId) };
}

/**
 * The company these cards' facilities belong to.
 *
 * A card's "Select" hands the picked tier to the rental flow (see
 * @shared/unitHandoff), and on a multi-property site the company is part of what
 * makes that unambiguous. Same precedence the space lookups use:
 * `PropertiesInternal`'s own `company_id` when it states one — those curated
 * `spaceGroupId`s belong to that company, so the tiers they priced do too — else
 * the `Company` collection, else config.json.
 *
 * Both reads are cached, so resolving this costs the page nothing extra.
 */
export async function resolveNearbyCompanyId(collectionName?: string): Promise<string> {
  const { companyId } = await fetchSpaceGroupBinding(collectionName);
  return companyId || (await creds()).companyId;
}

/**
 * Every property in the company — this widget lists locations, so it wants them all.
 *
 * SOURCE ORDER: `PropertiesInternal` → `Properties` → keyed REST.
 *
 * `PropertiesInternal` comes first because it is the site's OWN collection: it is
 * where the operator curates this widget (`nearbyLocationPriorityOrder`, hero
 * photos), so where
 * it also carries property data that data is the operator's intent. But it exists
 * mainly to hold those extras, and on a site where it has only
 * `id`/`heroimage`/`images`/`nearbyLocationPriorityOrder` there is no name,
 * address or phone to
 * render — `propertyLikeRows` is the check, and a photos-only collection falls
 * through to `Properties` instead of producing a grid of blank cards.
 *
 * **This re-source is #07-only.** Every other collection-backed widget still
 * starts from `Properties`; nothing shared changed to make room for it.
 *
 * No `requirePropertyId` on the fallback: that trust check needs a property we
 * actually expect to be there, and this widget is given none. Passing
 * config.json's build-time id would look for a property from a DIFFERENT company,
 * declare the site's own collection untrustworthy and fall back to REST — the
 * opposite of the intent.
 */
export async function fetchProperties(
  collectionName: string = INTERNAL_PROPERTIES_COLLECTION,
): Promise<unknown> {
  const c = await creds();
  const internal = propertyLikeRows(await readInternalProperties(collectionName));
  if (internal.length) {
    logSource('#07 nearby', 'properties', true, `${collectionName}, ${internal.length} rows`);
    return asPropertiesResponse(internal, c.appId);
  }
  return sharedFetchProperties(c, {});
}

/**
 * `requireCoords: false` — keep properties the API gave no lat/lng for.
 *
 * The default drops them, because ranking by distance needs a position. But this
 * widget already renders a distance-less list (no geolocation and no page
 * property is the normal site-wide case, and `distanceMiles: null` just hides the
 * badge), and "featured" ordering does not use distance at all. Verified live
 * 2026-08-13 that every property on the current company has `lat: null`, so the
 * strict default would drop the whole portfolio and leave the widget showing demo
 * cards. Rows without coordinates come back with lat/lng 0 and `hasCoords` false
 * — callers must check that flag before measuring or plotting them.
 */
export const extractProperties = (raw: unknown): NearbyBaseProperty[] =>
  extractNearbyProperties(raw, cfg.appId, { requireCoords: false });

export const fetchPropertySpaces = async (propertyId: string) =>
  sharedFetchPropertySpaces(await creds(), propertyId);

/** What one property's space lookup yields. */
export type PropertySpaces = PropertySpaceData;

/**
 * The whole portfolio's spaces, from ONE request — promise-cached for the page.
 *
 * `PropertiesInternal` curates a `spaceGroupId` per property and the `company_id`
 * they belong to, which together are everything the batched endpoint needs
 * (`fetchSpaceGroupBinding`). One call then prices EVERY facility, so the widget
 * no longer pays two REST round trips per card — and paging, re-sorting and
 * swiping cost nothing at all afterwards.
 *
 * Resolves **null** when the collection cannot supply that binding: no `dmAPI`
 * (the Duda editor, the dev harness), no collection, or the two columns simply
 * not filled in yet. Null means "no batch available", and the caller keeps the
 * per-property chain — which is what every site does today, so an operator who
 * has not filled the columns in sees exactly the current behaviour rather than a
 * grid of price-less cards.
 *
 * The PROMISE is cached, so the several page-turns that can fire before the
 * first one lands all join the same request instead of each issuing their own.
 *
 * The company for this call comes from the collection when it states one, NOT
 * from `Company`/config: these `spaceGroupId`s belong to that company, and
 * pairing them with a different id would ask the API for groups it does not own.
 */
let portfolioPromise: Promise<Map<string, PropertySpaces> | null> | null = null;

async function loadPortfolioSpaces(): Promise<Map<string, PropertySpaces> | null> {
  const { companyId, groupByProperty } = await fetchSpaceGroupBinding();
  if (!groupByProperty.size) return null;

  const c = await creds();
  const withCompany = companyId ? { ...c, companyId } : c;
  const byGroup = await fetchSpaceGroupSpaces(withCompany, [...groupByProperty.values()]);
  // An empty answer is a FAILED batch (the fetch fails soft), not a portfolio
  // with no spaces — returning the empty map would pin every card at "no spaces"
  // for the life of the page, so hand back null and let the per-property chain
  // try instead.
  if (!byGroup.size) {
    console.warn('[#07 nearby] batched space-groups call returned nothing; falling back per property');
    return null;
  }

  logSource('#07 nearby', 'spaces', true, `1 batched call, ${byGroup.size}/${groupByProperty.size} groups`);

  // Re-key from space group to PROPERTY, which is what the cards are keyed by.
  // A group missing from the response is simply absent here, so that one property
  // falls back on its own rather than dragging the whole batch down with it.
  const byProperty = new Map<string, PropertySpaces>();
  for (const [propertyId, groupId] of groupByProperty) {
    const hit = byGroup.get(groupId);
    if (hit) byProperty.set(propertyId, hit);
  }
  return byProperty;
}

function portfolioSpaces(): Promise<Map<string, PropertySpaces> | null> {
  portfolioPromise ??= loadPortfolioSpaces().catch(() => null);
  return portfolioPromise;
}

/**
 * Spaces + promo for several properties — **the batch endpoint, when available.**
 *
 * Two routes, and the first is one request for the entire portfolio:
 *
 *  1. **Batched** — `PropertiesInternal` gives a `spaceGroupId` per property and
 *     the `company_id` they sit under, so a single
 *     `space-groups?space_group_id=…&space_group_id=…` call prices every
 *     facility at once. Cached for the page, so only the FIRST batch of ids
 *     pays for it and every page turn after that is free.
 *  2. **Per property** — the original chain (list the property's space-groups,
 *     then read the website one: two sequential round trips each), used for any
 *     property the batch could not answer for, and for every property on a site
 *     that has not curated the columns yet.
 *
 * The signature is unchanged, which is the point: `onResult` still fires **per
 * property as it resolves** and the returned promise still settles when every id
 * has reported, so the component above — its cache, its in-flight set, its
 * `SpacesSkeleton` — did not move.
 *
 * On the batched route `onResult` fires for **every facility in the portfolio**,
 * not only the ids passed in: the single call already fetched them, so every card
 * fills at once and the caller's cache is seeded for pages it has not reached yet.
 * `propertyIds` is then only "the ids that must be answered", not a limit.
 *
 * Fails soft PER ID: a property whose lookup throws reports empty spaces, so one
 * bad property can never reject the batch and blank the rest of the page.
 */
export async function fetchSpacesForProperties(
  propertyIds: string[],
  onResult: (propertyId: string, data: PropertySpaces) => void,
): Promise<void> {
  if (!propertyIds.length) return;

  // EVERY REQUESTED ID GETS AN ANSWER, WHATEVER HAPPENS BELOW.
  //
  // "Fails soft per id" was only true of the per-property fan-out's own
  // try/catch. Between the batch and that fan-out sit `fetchSpaceGroupBinding()`
  // and `creds()`, and a throw from either used to reject this function before a
  // single `onResult` fired — so no card ever left `SpacesSkeleton`, and because
  // the caller's in-flight set is only cleared BY a result, those ids were never
  // retried either. One failure there froze the shimmer on every visible card
  // for the life of the page.
  //
  // Reporting the same `{ spaces: [] }` a per-property failure gives means an
  // unreachable API renders the card's three reserved rows — the SAME thing a
  // facility with nothing bookable shows — instead of a permanent loader.
  const answered = new Set<string>();
  const report = (id: string, data: PropertySpaces): void => {
    answered.add(id);
    onResult(id, data);
  };

  try {
    await fetchSpacesForPropertiesInner(propertyIds, report);
  } finally {
    for (const id of propertyIds) {
      if (!answered.has(id)) report(id, { spaces: [] });
    }
  }
}

/**
 * The real work. Split out so the guarantee above wraps every exit path — a
 * `finally` around the whole body is what makes "every id gets an answer" true
 * of a throw as well as of a clean run.
 */
async function fetchSpacesForPropertiesInner(
  propertyIds: string[],
  onResult: (propertyId: string, data: PropertySpaces) => void,
): Promise<void> {
  const batched = await portfolioSpaces();

  // REPORT EVERY FACILITY THE BATCH COVERED, not just the ids asked for.
  //
  // The one call already paid for the whole portfolio, so holding back the rest
  // would leave cards on later pages showing skeletons that a request has
  // already answered — and would make the batch look, from the outside, exactly
  // like the per-page fan-out it replaced. Reporting them fills every card at
  // once and seeds the caller's cache, so no later page turn fetches anything.
  //
  // Safe against the caller's bookkeeping: its in-flight set is a Set (deleting
  // an id that was never added is a no-op) and its updater matches on id, so an
  // unrequested id simply lands in the cache and on its own card. React 18
  // batches the resulting state updates into one render.
  const reported = new Set<string>();
  if (batched) {
    for (const [id, data] of batched) {
      reported.add(id);
      onResult(id, data);
    }
  }

  // Only ids the batch could not answer for — an uncurated property, or a site
  // with no binding at all — fall through to the per-property chain.
  const missing = propertyIds.filter((id) => !reported.has(id));
  if (!missing.length) return;

  // The collection's `company_id` wins here too. These are properties the
  // collection listed but curated no `spaceGroupId` for, so they belong to the
  // company it names — asking config.json's company for them would 404 every
  // lookup and render price-less cards. Re-reading the binding is free: it is a
  // second pass over the same cached rows, not a second request.
  const { companyId } = await fetchSpaceGroupBinding();
  const base = await creds();
  const c = companyId ? { ...base, companyId } : base;
  await Promise.all(
    missing.map(async (id) => {
      try {
        onResult(id, await sharedFetchPropertySpaces(c, id));
      } catch {
        onResult(id, { spaces: [] });
      }
    }),
  );
}
