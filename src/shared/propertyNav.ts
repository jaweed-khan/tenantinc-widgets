// ===========================================================================
// "Find Storage" location tree, built from the `Properties` collection.
//
// Each property carries a `slug` of the form  state/city/property-name-<id>,
// e.g. "california/bellflower/storage-outlet-bellflower-340079517". Grouping
// those three segments gives the nav its three levels:
//
//   California                 ← level 1, slug segment 0
//     Bellflower               ← level 2, slug segment 1
//       Storage Outlet - Bellflower   ← level 3, one per property
//
// WHY THE SLUG AND NOT `Address`. The slug IS the page URL, so the tree has to
// group by it or the links won't match the pages they sit under. Be aware the two
// disagree in the live data (verified 2026-08-06): Chula Vista and Escondido are
// Californian properties whose slugs say `arizona/...`, and Gardena's slug says
// `california/irvine/storage-outlet-escondido-...`. That is a data problem to fix
// upstream — this module renders faithfully whatever the slugs say, because
// silently "correcting" them would produce nav links to pages that don't exist.
//
// The LEAF LABEL is the deliberate exception: it uses the property's real `name`
// when there is one, falling back to the slug tail. The name is authoritative and
// already properly punctuated, and it stops a stale slug from mislabelling a
// facility ("Storage Outlet Escondido" for what is actually Gardena).
// ===========================================================================

import { readCollection, str, plainText, logSource, hasCollectionsApi } from './dudaCollections';
import { PROPERTIES_COLLECTION } from './propertiesSource';
import { formatPhone } from './propertyContact';

export type NavUnitType = 'storage' | 'parking';

/** One facility — the third level. */
export interface NavProperty {
  id: string;
  label: string;
  href: string;
  /** The raw slug, for callers that build their own URLs. */
  slug: string;
  /** "8478 3rd Street, Fullerton, CA 02027" — '' when the row carries no Address. */
  address: string;
  /**
   * `Address.city` verbatim, kept alongside the slug-derived city label because
   * the two disagree in the live data (a row reads "LancasTER", and Gardena's
   * slug says Irvine). Search matches both so either spelling finds the place.
   */
  city: string;
  /** `Address.zip`, for ZIP search. '' when the row carries no Address. */
  zip: string;
  /**
   * Just the street line — "736 Orange Avenue" (address + address2). The mega
   * menu's map cards print it under the city, where the full `address` line would
   * repeat the city and state already in the heading above it.
   */
  street: string;
  /** `Address.state`, e.g. "CA". '' when the row carries no Address. */
  state: string;
  /** Formatted primary phone, e.g. "(888) 888-8888"; '' when the row has none. */
  phone: string;
  /** Raw digits for tel: links. */
  phoneDigits: string;
  /** Coordinates for distance sorting; null when the Address has none. */
  lat: number | null;
  lng: number | null;
  /** Unit types with current vacancy, derived from `unit_type_counts`. */
  vacantUnitTypes: NavUnitType[];
}

/** One city — the second level. */
export interface NavCity {
  /** Slug segment, e.g. "huntington-beach". */
  key: string;
  label: string;
  properties: NavProperty[];
  /**
   * Where the city row goes.
   *
   * ONE facility in the city → straight to that facility's page,
   * `/storage-units/<state>/<city>/<property-slug-id>` (i.e. the property's own
   * `href`, `basePath` included). A city page listing a single property is an
   * extra click to a page that says nothing the nav didn't already.
   *
   * TWO OR MORE → the city page, `/locations/<state>/<city>`.
   *
   * The shortcut has been in and out before (added 4ae71d7, reverted for
   * consistency); it is back deliberately — the property landing pages exist
   * today and the city pages do not.
   */
  href: string;
}

/** One state — the first level. */
export interface NavState {
  /** Slug segment, e.g. "california". */
  key: string;
  label: string;
  cities: NavCity[];
  /** Facilities across every city in the state — the mega menu's count bubble. */
  propertyCount: number;
  /**
   * The state page, `/locations/<state>`.
   *
   * Root-relative on purpose: Duda serves every page from the site root on both
   * the preview host (`*.multiscreensite.com`) and the live domain, so one path
   * is correct in both without knowing either. An absolute URL would pin the
   * links to whichever domain was current when the bundle was built.
   */
  href: string;
}

/** "huntington-beach" → "Huntington Beach". */
export function slugLabel(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * The property segment carries a trailing numeric id
 * ("storage-outlet-bellflower-340079517") which must not appear in the label.
 * Only a PURELY numeric tail is dropped, so a facility legitimately named
 * "... - Unit 5" keeps it.
 */
export function propertySlugLabel(segment: string): string {
  return slugLabel(segment.replace(/-\d+$/, ''));
}

export interface ParsedSlug {
  state: string;
  city: string;
  property: string;
}

/**
 * Split "california/bellflower/storage-outlet-bellflower-340079517".
 *
 * Returns null unless all three levels are present — a property we cannot place
 * is left out of the nav rather than dropped into a blank or "Undefined" branch.
 * Leading/trailing slashes are tolerated; any extra segments are folded into the
 * property part so a deeper path still lands under the right city.
 */
export function parseSlug(slug: unknown): ParsedSlug | null {
  const parts = str(slug).split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  return {
    state: parts[0].toLowerCase(),
    city: parts[1].toLowerCase(),
    property: parts.slice(2).join('/'),
  };
}

export interface BuildTreeOptions {
  /**
   * Path the property pages live under, prefixed to every slug. The Duda dynamic
   * pages sit at `/storage-units/<slug>`, which is #02's default.
   *
   * Normalised before use, so `storage-units`, `/storage-units` and
   * `/storage-units/` all behave the same — a missing leading slash would make the
   * href relative to the current page, and a trailing one would double up into
   * `/storage-units//california/…`.
   */
  basePath?: string;
  /**
   * Path the CITY pages live under — `/locations/<state>/<city>`, the default.
   * Only used for cities holding more than one facility — a single-facility city
   * links straight to the facility under `basePath` (see `NavCity.href`).
   * Normalised exactly like `basePath`.
   *
   * NOTE: those city pages are not built yet. The links are correct by
   * construction, but they 404 until the pages exist.
   */
  cityBasePath?: string;
}

/** Where the city pages live. */
export const DEFAULT_CITY_BASE_PATH = '/locations';

/** '' | 'x' | '/x' | '/x/' → '' | '/x'. */
export function normaliseBasePath(basePath: string): string {
  const trimmed = basePath.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Row shape this module needs — a subset of a `Properties` collection row. */
export interface PropertyRowLike {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  /** External collection ⇒ already-parsed object. Anything else is ignored. */
  Address?: unknown;
  /** External collection ⇒ already-parsed array. */
  Phones?: unknown;
  /** External collection ⇒ already-parsed inventory summary array. */
  unit_type_counts?: unknown;
}

/**
 * A collection value that should be JSON, however it arrives.
 *
 * `Properties` is an EXTERNAL collection, so `Address` and `Phones` come through
 * as a parsed object and array (see @shared/propertiesSource) — that is the normal
 * path. But Duda's collection editor types EVERY column "Rich Text" regardless,
 * so a site whose columns went through the rich-text path would hand back the JSON
 * as a string, possibly wrapped in `<p class="rteBlock">`. Accept all three rather
 * than silently dropping every address, phone and map pin on such a site.
 *
 * Anything that still isn't JSON returns null, so the caller renders a row with no
 * address instead of "[object Object]".
 */
function asJson<T>(v: unknown): T | null {
  if (v && typeof v === 'object') return v as T;
  const s = plainText(v).trim();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * Contact details off a row, for the mega menu's "Nearby Storage Facilities"
 * column and for the keyword search (which matches on the address line).
 */
function rowContact(
  row: PropertyRowLike,
): Pick<NavProperty, 'address' | 'city' | 'zip' | 'street' | 'state' | 'phone' | 'phoneDigits' | 'lat' | 'lng'> {
  const addr = asJson<Record<string, unknown>>(row.Address);
  const street = addr ? [str(addr.address), str(addr.address2)].filter(Boolean).join(' ').trim() : '';
  const address = addr
    ? [
        street,
        str(addr.city),
        `${str(addr.state)} ${str(addr.zip)}`.trim(),
      ].filter(Boolean).join(', ')
    : '';

  // Array.isArray after parsing, not before: a JSON string parses to whatever it
  // held, and `.find` on a non-array would throw right through the widget.
  const parsedPhones = asJson<unknown>(row.Phones);
  const phones = Array.isArray(parsedPhones) ? (parsedPhones as Record<string, unknown>[]) : [];
  // status 0 is a retired number — same rule as @shared/propertyContact.
  const primary = phones.find((ph) => Number(ph.status) !== 0) ?? phones[0];
  const rawPhone = str(primary?.phone ?? primary?.number);

  return {
    address,
    city: addr ? str(addr.city) : '',
    zip: addr ? str(addr.zip) : '',
    street,
    state: addr ? str(addr.state) : '',
    phone: rawPhone ? formatPhone(rawPhone) : '',
    phoneDigits: rawPhone.replace(/\D/g, ''),
    lat: addr && typeof addr.lat === 'number' ? addr.lat : null,
    lng: addr && typeof addr.lng === 'number' ? addr.lng : null,
  };
}

/**
 * Group property rows into state → city → property.
 *
 * Everything is sorted alphabetically by label at each level, so the menu order
 * is stable regardless of the order the collection hands rows back in.
 */
export function buildLocationTree(
  rows: PropertyRowLike[],
  opts: BuildTreeOptions = {},
): NavState[] {
  const base = normaliseBasePath(opts.basePath ?? '');
  const cityBase = normaliseBasePath(opts.cityBasePath ?? DEFAULT_CITY_BASE_PATH);
  const states = new Map<string, { label: string; cities: Map<string, { label: string; properties: NavProperty[] }> }>();

  for (const row of rows) {
    const parsed = parseSlug(row.slug);
    if (!parsed) continue;

    let state = states.get(parsed.state);
    if (!state) {
      state = { label: slugLabel(parsed.state), cities: new Map() };
      states.set(parsed.state, state);
    }

    let city = state.cities.get(parsed.city);
    if (!city) {
      city = { label: slugLabel(parsed.city), properties: [] };
      state.cities.set(parsed.city, city);
    }

    const slug = str(row.slug).replace(/^\/+|\/+$/g, '');
    const rawCounts = asJson<unknown>(row.unit_type_counts);
    const vacantUnitTypes = Array.isArray(rawCounts)
      ? [...new Set(rawCounts.flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return [];
          const count = entry as Record<string, unknown>;
          const unitType = str(count.unit_type).toLowerCase();
          return Number(count.vacant_count) > 0 && (unitType === 'storage' || unitType === 'parking')
            ? [unitType as NavUnitType]
            : [];
        }))]
      : [];
    city.properties.push({
      id: str(row.id),
      // Real name first — see the header note on stale slugs.
      label: str(row.name) || propertySlugLabel(parsed.property),
      href: `${base}/${slug}`,
      slug,
      vacantUnitTypes,
      ...rowContact(row),
    });
  }

  const byLabel = <T extends { label: string }>(a: T, b: T) => a.label.localeCompare(b.label);

  return [...states.entries()]
    .map(([key, s]) => {
      const cities = [...s.cities.entries()]
        .map(([cityKey, c]) => {
          const properties = [...c.properties].sort(byLabel);
          return {
            key: cityKey,
            label: c.label,
            properties,
            // One facility ⇒ its landing page (already carries `basePath`);
            // otherwise the city listing. See `NavCity.href`.
            href: properties.length === 1
              ? properties[0].href
              : `${cityBase}/${key}/${cityKey}`,
          };
        })
        .sort(byLabel);
      return {
        key,
        label: s.label,
        cities,
        propertyCount: cities.reduce((n, c) => n + c.properties.length, 0),
        href: `${cityBase}/${key}`,
      };
    })
    .sort(byLabel);
}

/**
 * The location tree straight from the `Properties` collection.
 *
 * Fails soft to [] — no dmAPI (Duda editor / dev harness), collection missing, or
 * no row carrying a usable slug — so the caller keeps its own fallback menu.
 */
export async function fetchLocationTree(
  widgetTag: string,
  opts: BuildTreeOptions & { collectionName?: string } = {},
): Promise<NavState[]> {
  const { collectionName = PROPERTIES_COLLECTION, ...treeOpts } = opts;

  if (!hasCollectionsApi()) {
    logSource(widgetTag, 'location tree', false, 'no dmAPI — not on a published Duda page');
    return [];
  }

  const rows = await readCollection(collectionName);
  const tree = buildLocationTree(rows as PropertyRowLike[], treeOpts);

  if (!tree.length) {
    logSource(
      widgetTag, 'location tree', false,
      rows.length
        ? `${collectionName} has ${rows.length} row(s) but none with a state/city/property slug`
        : `${collectionName} empty or missing`,
    );
    return [];
  }

  const counts = tree.reduce(
    (acc, s) => {
      acc.cities += s.cities.length;
      acc.props += s.propertyCount;
      return acc;
    },
    { cities: 0, props: 0 },
  );
  logSource(
    widgetTag, 'location tree', true,
    `${collectionName} → ${tree.length} state(s), ${counts.cities} cities, ${counts.props} properties`,
  );
  return tree;
}
