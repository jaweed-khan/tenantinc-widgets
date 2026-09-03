import cfg from './config.json';
import {
  computeStatus, formatSchedule,
  type AccessHoursSection, type HoursStatus, type ScheduleRow,
} from '@shared/accessHours';
import { createLead as submitLead, type LeadInput } from '@shared/leadsApi';
import { fetchPropertiesPreferCollection, asPropertiesResponse } from '@shared/propertiesSource';
import {
  resolveBoundProperty, resolvePropertyId, resolveRequireId, boundText,
  type BoundPropertyProps,
} from '@shared/propertyBinding';
import { resolveCompanyIdFromSources } from '@shared/companySource';
import { fetchFacilities, type FacilityOption } from '@shared/facilities';

export type { LeadInput };
export type { BoundPropertyProps };
export type { FacilityOption };

/**
 * Every property on the company, for the contact modal's "Select Property".
 * Wrapped here rather than called from the component so the creds stay in the
 * one file that owns them, exactly as every other call in this widget does.
 */
export function fetchFacilityOptions(bound: BoundPropertyProps = {}): Promise<FacilityOption[]> {
  return fetchFacilities(
    '#03 property-info',
    { baseUrl: BASE_URL, appId: APP_ID, apiKey: API_KEY, companyId: COMPANY_ID },
    boundText(bound.companyId),
  );
}

const BASE_URL = cfg.baseUrl;
const APP_ID = cfg.appId;
const API_KEY = cfg.apiKey;
const COMPANY_ID = cfg.companyId;
const PROPERTY_ID = cfg.propertyId;

// ---------------------------------------------------------------------------
// Raw API response types — only the fields we actually use
// ---------------------------------------------------------------------------

interface ApiAddress {
  id: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  lat: number;
  lng: number;
}

interface ApiPhone {
  phone?: string;
  number?: string;
  type?: string;   // e.g. "Main"
  status?: number;
}

interface ApiEmail {
  email?: string;
  type?: string;
  status?: number;
}

interface ApiSocialMedia {
  platform?: string;
  type?: string;
  url?: string;
  link?: string;
}

interface ApiUnitTypeCount {
  unit_type: string;        // "storage" | "parking"
  total_count: number;
  vacant_count: number;
}

export interface ApiProperty {
  id: string;
  name: string;
  status: number;
  utc_offset?: string;      // IANA tz, e.g. "America/Los_Angeles"
  // Capitalized in the API; may be missing/empty when unset.
  Address?: ApiAddress | '';
  Phones?: ApiPhone[] | '';
  Emails?: ApiEmail[] | '';
  Images?: unknown[] | '';
  AccessHours?: AccessHoursSection[] | '';
  SocialMedia?: ApiSocialMedia[] | '';
  unit_type_counts?: ApiUnitTypeCount[];
}

interface ApiResponse {
  message: string;
  applicationData: Record<string, Array<{
    status: number;
    data: { properties: ApiProperty[] };
  }>>;
}

// ---------------------------------------------------------------------------
// Mapped shape the widget consumes
// ---------------------------------------------------------------------------

export interface PropertyDetails {
  id: string;
  name: string;
  /** "5281 California, Irvine, CA 92617" */
  address: string;
  /** Address parts, kept separate so the breadcrumb can be built per property
   *  ("Home / Find storage / California / Irvine / 5281 California") instead of
   *  being hardcoded to one city. Empty strings when the API has no Address. */
  street: string;
  city: string;
  /** Two-letter code as the API gives it, e.g. "CA". */
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  phones: { number: string; note?: string }[];
  /** First active email, e.g. "email.test@tenantinc.com" — null when unset. */
  email: string | null;
  /** Computed live status per section; null when that section is disabled/absent. */
  hours: { office: HoursStatus | null; gate: HoursStatus | null; callCenter: HoursStatus | null };
  /** Grouped weekly schedule per section for the "See all Hours" panel. */
  schedule: { office: ScheduleRow[]; gate: ScheduleRow[]; callCenter: ScheduleRow[] };
  /** One entry per enabled AccessHours type (Office / Gate / Call Center / …). */
  scheduleSections: { title: string; rows: ScheduleRow[] }[];
  socials: { platform: string; url: string }[];
  unitCounts: { storage: number | null; parking: number | null };
}

/** "LancasTER" → "Lancaster". The live data's city casing is inconsistent. */
function titleCase(s: string): string {
  return s.trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * State code → full name, for the breadcrumb ("CA" → "California"). The API only
 * ever gives the two-letter code; the design shows the full name. An unknown or
 * already-spelled-out value passes through unchanged.
 */
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico',
};

export function stateName(code: string): string {
  const key = code.trim().toUpperCase();
  return STATE_NAMES[key] ?? code.trim();
}

/**
 * Per-property breadcrumb, so a dynamic page doesn't render another city's trail.
 * Returns null when there's nothing to build from, in which case the caller keeps
 * its `breadcrumb` prop / DEFAULT. Empty segments are dropped, so a property with
 * no state still gets "Home / Find storage / Irvine / 5281 California".
 */
export function propertyBreadcrumb(
  details: PropertyDetails | null,
  leadingCrumbs: string[] = ['Home', 'Find storage'],
): string[] | null {
  if (!details) return null;
  const tail = [stateName(details.state), details.city, details.street].filter(Boolean);
  return tail.length ? [...leadingCrumbs, ...tail] : null;
}

/** "18888888888" → "(888) 888-8888"; leaves anything unrecognized as-is. */
export function formatPhone(rawNumber: string): string {
  const digits = rawNumber.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return rawNumber;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

// ---------------------------------------------------------------------------
// Fetch + filter
// ---------------------------------------------------------------------------

/**
 * Duda's "Properties" collection when it's bound to our company, else the keyed
 * REST call. Same envelope either way, so findProperty below is unchanged.
 * See @shared/propertiesSource.
 */
export async function fetchProperties(requirePropertyId?: string): Promise<unknown> {
  // NO default of PROPERTY_ID here: callers pass `resolveRequireId(...)`, which is
  // undefined when Duda bound nothing, and a default would quietly put the stale
  // config id back — rejecting the site's own collection.
  return fetchPropertiesPreferCollection(APP_ID, fetchPropertiesFromApi, { requirePropertyId });
}

/**
 * The property this widget instance should render, resolved for BOTH the static
 * and the dynamic-page case.
 *
 * Dynamic page: `bound.propertyId` is connected to `Properties > id`, so we read
 * that row from the collection and wrap it in the REST envelope — which means
 * `findProperty` below does all the mapping, unchanged, and every nested field
 * (AccessHours, SocialMedia, unit_type_counts) keeps its real array shape.
 *
 * Static page / Duda editor / dev harness: no bound row, so this falls through to
 * the existing collection-then-REST fetch. The trust check uses the EFFECTIVE id,
 * not the config.json one — on this site the collection is pointed at a different
 * company, and checking the stale id would reject the right collection and then
 * serve another company's property from REST.
 */
export async function fetchPropertyDetails(bound: BoundPropertyProps = {}): Promise<PropertyDetails | null> {
  const effectiveId = resolvePropertyId(bound, PROPERTY_ID);
  const row = await resolveBoundProperty('#03 property-info', bound, { configPropertyId: PROPERTY_ID });

  if (row) {
    const details = findProperty(asPropertiesResponse([row], APP_ID), String(row.id ?? effectiveId));
    if (details) return withAddressFallback(details, row);
  }

  const raw = await fetchProperties(resolveRequireId(bound, PROPERTY_ID));
  return findProperty(raw, effectiveId);
}

/**
 * `Address` bound through a text content-menu field can arrive as a display string
 * instead of an object. That carries no lat/lng — so we use it for the address line
 * and leave the map to fall back, rather than inventing coordinates.
 */
function withAddressFallback(details: PropertyDetails, row: Record<string, unknown>): PropertyDetails {
  if (details.address) return details;
  const text = boundText(row.__addressText);
  return text ? { ...details, address: text } : details;
}

/**
 * The company every request here is scoped to.
 *
 * The `Company` collection is the source of truth — config.json's value is only
 * the fallback for the Duda editor, the dev harness, and sites without the
 * collection. Cached in @shared/companySource, so calling this per request costs
 * one collection read for the whole page.
 */
function companyId(bound: BoundPropertyProps = {}): Promise<string> {
  return resolveCompanyIdFromSources('#03 property-info', bound, COMPANY_ID);
}

async function fetchPropertiesFromApi(): Promise<unknown> {
  // Expansion flags pull in the nested sections the widget renders.
  const params = 'access_hours=true&amenities=true&unit_type_counts=true&faq=true&social_media=true';
  const url = `${BASE_URL}/applications/${APP_ID}/v2/companies/${await companyId()}/properties?${params}`;

  const res = await fetch(url, {
    headers: {
      'x-storageapi-date': String(Math.floor(Date.now() / 1000)),
      'x-storageapi-key': API_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`fetchProperties failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Lead creation ("Send us a Message") — delegates to the shared leads API.
 *
 * The lead must be filed against the company AND property the visitor is actually
 * looking at, so both come from the live sources rather than config.json: the
 * company from the `Company` collection, the property from the dynamic-page
 * binding when there is one.
 */
export async function createLead(input: LeadInput, bound: BoundPropertyProps = {}): Promise<unknown> {
  return submitLead(
    {
      baseUrl: BASE_URL,
      appId: APP_ID,
      apiKey: API_KEY,
      companyId: await companyId(bound),
      propertyId: resolvePropertyId(bound, PROPERTY_ID),
    },
    input,
  );
}

/** Pull the properties array out of the nested response and find ours by id. */
export function findProperty(raw: unknown, propertyId: string = PROPERTY_ID): PropertyDetails | null {
  const response = raw as ApiResponse;
  const list = response?.applicationData?.[APP_ID]?.[0]?.data?.properties ?? [];
  const prop = list.find((p) => p.id === propertyId);
  if (!prop) return null;

  // Address / Phones are "" (empty string) when unset — guard before reading.
  const addr = prop.Address && typeof prop.Address === 'object' ? prop.Address : null;
  const address = addr
    ? [addr.address, addr.address2].filter(Boolean).join(' ') + `, ${addr.city}, ${addr.state} ${addr.zip}`
    : '';

  const phones = Array.isArray(prop.Phones)
    ? prop.Phones
        .filter((p) => p.status !== 0)
        .map((p) => ({ number: formatPhone(p.phone ?? p.number ?? ''), note: p.type }))
        .filter((p) => p.number)
    : [];

  const email = Array.isArray(prop.Emails)
    ? prop.Emails.find((e) => e.status !== 0 && e.email)?.email ?? null
    : null;

  // Live gate/office/call-centre status + grouped weekly schedule, in the property's own tz.
  const access = Array.isArray(prop.AccessHours) ? prop.AccessHours : [];
  const sectionOf = (type: string) => access.find((a) => a.type === type);
  const officeSection = sectionOf('office');
  const gateSection = sectionOf('gate');
  const callCenterSection = sectionOf('call_center');
  const hours = {
    office: computeStatus(officeSection, 'Office', prop.utc_offset),
    gate: computeStatus(gateSection, 'Gate', prop.utc_offset),
    callCenter: computeStatus(callCenterSection, 'Call Center', prop.utc_offset),
  };
  const schedule = {
    office: formatSchedule(officeSection),
    gate: formatSchedule(gateSection),
    callCenter: formatSchedule(callCenterSection),
  };

  // A titled schedule per enabled AccessHours type, so the "See all Hours" modal
  // can show Gate / Office / Call Center (etc.) as separate columns. Preferred
  // order first; empty/disabled sections are dropped.
  const TYPE_LABELS: Record<string, string> = {
    gate: 'Gate Hours', office: 'Office Hours', call_center: 'Call Center Hours',
  };
  const TYPE_ORDER = ['gate', 'office', 'call_center'];
  const titleFor = (type: string) =>
    TYPE_LABELS[type] ?? `${type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Hours`;
  const scheduleSections = access
    // Grouped, not one row per day: consecutive days sharing hours collapse to
    // "Mon – Sat", matching the design and the inline schedule above.
    .map((s) => ({ type: s.type, title: titleFor(s.type), rows: formatSchedule(s) }))
    .filter((s) => s.rows.length > 0)
    .sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type); const bi = TYPE_ORDER.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(({ title, rows }) => ({ title, rows }));

  const socials = Array.isArray(prop.SocialMedia)
    ? prop.SocialMedia
        .map((s) => ({ platform: (s.platform ?? s.type ?? '').toLowerCase(), url: s.url ?? s.link ?? '' }))
        .filter((s) => s.platform && s.url)
    : [];

  const counts = Array.isArray(prop.unit_type_counts) ? prop.unit_type_counts : [];
  const vacantOf = (type: string) => counts.find((c) => c.unit_type === type)?.vacant_count ?? null;
  const unitCounts = { storage: vacantOf('storage'), parking: vacantOf('parking') };

  return {
    id: prop.id,
    name: prop.name,
    address,
    street: addr ? [addr.address, addr.address2].filter(Boolean).join(' ').trim() : '',
    // The live data has "LancasTER" / "Lancaster" for the same city, so normalise
    // the casing rather than printing the API's inconsistency in a breadcrumb.
    city: titleCase(addr?.city ?? ''),
    state: (addr?.state ?? '').trim(),
    zip: (addr?.zip ?? '').trim(),
    lat: addr?.lat ?? null,
    lng: addr?.lng ?? null,
    phones,
    email,
    hours,
    schedule,
    scheduleSections,
    socials,
    unitCounts,
  };
}
