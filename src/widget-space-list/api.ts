import type { Unit, UnitSize } from './types';
import cfg from './config.json';
import { spaceImageFor } from './spaceImages';
import { fetchWebsiteSpaceGroupId as findWebsiteSpaceGroupId } from '@shared/spaceGroups';
import { resolveCompanyIdFromSources } from '@shared/companySource';

const BASE_URL = cfg.baseUrl;
const APP_ID = cfg.appId;
const API_KEY = cfg.apiKey;
const COMPANY_ID = cfg.companyId;
const PROPERTY_ID = cfg.propertyId;
const SPACE_GROUP_ID = cfg.spaceGroupId;

// ---------------------------------------------------------------------------
// Raw API response types
// ---------------------------------------------------------------------------

interface ApiAmenity {
  id: string;
  name: string;
  type: string | null;
  value: string;
  sort_order?: number;
  show_in_website?: number;
  show_in_filter_bar?: number;
  available_units?: number;
}

interface ApiSpaceTypeAssociation {
  is_primary: number;
  unit_type_id: string;
  unit_type_name: string;
}

interface ApiTier {
  id: string;
  tier_id: string;
  description: string;   // e.g. "10' x 10'" — used directly as Unit.dimensions
  width: string;
  length: string;
  set_rate: number | null;
  sell_rate: number | null;
  promotion_sell_rate: number | null;
  promotion_sell_rate_discount: number;
  units:  { count: number; min_price: number | null; max_price: number | null };
  vacant: { count: number; min_price: number | null; max_price: number | null };
  amenities: ApiAmenity[];
  space_type_associations: ApiSpaceTypeAssociation[];
  /**
   * Promotion(s) on this tier. The API moved shapes (seen 2026-07-31): it used
   * to send a single `allocated_promo` OBJECT and now sends a `promo` ARRAY,
   * with `allocated_promo` left as `{}` on every tier. Both are read so the
   * promo badge — and the #06 "See Qualifying Units" hand-off, which matches on
   * `promoId` — keep working whichever way the API goes. Mirrors
   * `tierPromos` in widget-promotions/api.ts.
   */
  promo?: ApiPromoEntry[];
  allocated_promo?: ApiPromoEntry | Record<string, never>;
}

/**
 * A tier's promotion. `value` is the discount amount, but `type` is 'regular' on
 * every promo the API returns (it used to be 'fixed' | 'percent'), so type alone
 * CANNOT tell us whether value is a percentage or an amount in dollars — see
 * promoKindFromName below.
 */
interface ApiPromoEntry {
  id?: string;
  name?: string;
  type?: string;
  value?: number;
}

interface ApiGroup {
  name: string;
  amenities: ApiAmenity[];
  tiers: ApiTier[];
}

interface ApiSpaceGroupProfile {
  groups: ApiGroup[];
}

interface ApiResponse {
  message: string;
  applicationData: Record<string, Array<{
    status: number;
    data: {
      spaceGroupProfile: Record<string, ApiSpaceGroupProfile>;
    };
  }>>;
}

// ---------------------------------------------------------------------------
// Size classification — width × length area (sq ft) → UnitSize
// ---------------------------------------------------------------------------

/**
 * Area (sq ft) → size bucket, per the client's guide (2026-07-30):
 *
 *   Small        ≤ 50    5×5, 5×10
 *   Medium    51–150     8×10, 8×12, 10×10, 10×15
 *   Large    151–300     10×20, 10×22, 10×25, 10×30, 15×20 (and 20×15, also 300)
 *   Extra Large  > 300   15×30, 20×30
 *
 * The previous thresholds (24 / 76 / 151) put every live tier but the two largest
 * in the wrong bucket — 5×10 read as Medium, 10×10 as Large, 10×20 as Extra Large.
 *
 * `other` is kept for a tier whose width/length don't parse (area 0), so it can't
 * silently land in Small. `extra_small` is no longer produced — it stays in the
 * UnitSize union because the label/open-state maps are keyed on the full union.
 */
export function classifySize(area: number): UnitSize {
  if (area <= 0) return 'other';
  if (area <= 50) return 'small';
  if (area <= 150) return 'medium';
  if (area <= 300) return 'large';
  return 'extra_large';
}

// boolean amenities → the name IS the label (e.g. "Climate Controlled", not "Yes")
// string/text/null amenities → the value IS the label (e.g. "Drive-Up Access", not "Access")
function amenityLabel(a: ApiAmenity): string {
  return a.type === 'boolean' || a.value === 'Yes' || a.value === 'No'
    ? a.name
    : a.value;
}

/**
 * Group names that are bookkeeping, not a description of the unit.
 *
 * The group name is the card subtitle's LAST resort, and on some tenants it is
 * not a label at all: this one names EVERY group "all units" (verified live
 * 2026-08-27 — one group name across all 39 tiers), which tells a shopper
 * nothing and reads as a bug sitting under the size. Matched case- and
 * whitespace-insensitively; anything else is a real name and still prints.
 */
const GENERIC_GROUP_NAMES = new Set(['all units', 'all spaces', 'all sizes', 'all']);

function groupSubtitle(name: string): string {
  return GENERIC_GROUP_NAMES.has(name.trim().toLowerCase()) ? '' : name;
}

/**
 * The tier's promotion, or null when it has none — reading the current `promo`
 * array first and falling back to the legacy `allocated_promo` object (see the
 * note on ApiTier). Empty tiers send `promo: []` / `allocated_promo: {}`,
 * neither of which counts; only an entry with an id does.
 */
/**
 * Is the promo's `value` a percentage or a flat move-in price?
 *
 * The API can't tell us: `type` is 'regular' on every promo, and the two live
 * shapes are "$1 MOVE IN SPECIAL" (value 1 = one dollar) and "50% OFF FIRST
 * MONTH" (value 50 = fifty percent). The NAME is the only signal that survives,
 * so we read the symbol out of it:
 *
 *   name contains '%' → 'percent'  → rate = starting x (1 - value/100)
 *   name contains '$' → 'fixed'    → rate = value  (the promo IS the price)
 *   neither           → null       → no promo rate; the card shows the normal
 *                                    single price rather than inventing a number.
 *
 * Deliberately conservative: mis-reading a $1 move-in as 1% off would print a
 * wrong price on a live site, which is worse than showing no promo rate at all.
 * The proper fix is upstream — `promotion_sell_rate` is null on every tier today;
 * once the API populates it we use that and this heuristic stops mattering.
 */
function promoKindFromName(name: string | undefined): 'percent' | 'fixed' | null {
  if (!name) return null;
  if (name.includes('%')) return 'percent';
  if (name.includes('$')) return 'fixed';
  return null;
}

function tierPromo(tier: ApiTier): ApiPromoEntry | null {
  const fromArray = tier.promo?.find((p) => p && p.id);
  if (fromArray) return fromArray;
  const legacy = tier.allocated_promo;
  return legacy && 'id' in legacy ? legacy : null;
}

// ---------------------------------------------------------------------------
// Mapper — raw API response → Unit[]
// ---------------------------------------------------------------------------

export function mapApiToUnits(raw: unknown): Unit[] {
  const response = raw as ApiResponse;
  const appEntries = response?.applicationData?.[APP_ID];
  if (!appEntries?.length) return [];

  const spaceGroupProfile = appEntries[0]?.data?.spaceGroupProfile;
  if (!spaceGroupProfile) return [];

  const units: Unit[] = [];

  for (const profile of Object.values(spaceGroupProfile)) {
    for (const group of profile.groups ?? []) {
      for (const tier of group.tiers ?? []) {
        const width = parseFloat(tier.width) || 0;
        const length = parseFloat(tier.length) || 0;
        const area = width * length;
        const size = classifySize(area);

        const primaryAssoc = tier.space_type_associations?.find((a) => a.is_primary === 1);
        const type: Unit['type'] = primaryAssoc?.unit_type_name === 'parking' ? 'parking' : 'storage';

        const bySortOrder = (a: ApiAmenity, b: ApiAmenity) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
        const uniqueByName = (a: ApiAmenity, i: number, arr: ApiAmenity[]) =>
          arr.findIndex((x) => x.name === a.name) === i;

        // Three lists off the same tier, each answering a different question.
        // They deliberately use different flags — see each block.

        // 1. THE CARD (`features`): every amenity, sorted and de-duped, no flag
        //    check at all. `show_in_website` is not a display gate: it was
        //    blanking the cards outright on properties that never set it (all
        //    of Storage Outlet), while parking cards listed the same data.
        const displayAmenities = [...(tier.amenities ?? [])].sort(bySortOrder).filter(uniqueByName);

        // 2. THE FILTER POPUP → "Amenities" checkboxes (`amenities`). NEVER
        //    rendered on a card; it only populates that list and matches
        //    against it. This IS where show_in_website belongs — it's the
        //    operator's choice of which amenities are worth filtering on.
        const amenityNames = [...(tier.amenities ?? [])]
          .filter((a) => a.show_in_website === 1)
          .sort(bySortOrder)
          .filter(uniqueByName)
          .map(amenityLabel);

        // 3. THE FILTER POPUP → "Space Features" pills (`filterBarFeatures`),
        //    on show_in_filter_bar. `available_units > 0` keeps a pill from
        //    filtering to nothing; `?? 1` treats an absent count as available.
        const filterBarFeatures = Array.from(new Set(
          (tier.amenities ?? [])
            .filter((a) => a.show_in_filter_bar === 1 && (a.available_units ?? 1) > 0)
            .map(amenityLabel)
        ));

        // The card SUBTITLE still consults show_in_website, because it needs ONE
        // amenity that describes the unit and only the curated ordering reliably
        // leads with one. Ungated, the first entry is whatever sorts first —
        // "ID Verification" on Storage Outlet, a facility policy that reads
        // badly as a unit subtitle. Verified unchanged on all 291 live tiers.
        const curatedSource = [...(tier.amenities ?? [])]
          .filter((a) => type === 'parking' || a.show_in_website === 1)
          .sort(bySortOrder)
          .filter(uniqueByName);

        // FALLBACK when nothing is curated. This tenant sets show_in_website=0
        // on every amenity — 0 of 39 tiers curated, verified live 2026-08-27 —
        // so `curatedSource` is always empty and the subtitle fell through to
        // the group name ("all units") on every card. The operator's own
        // sort_order still leads with a real description of the unit, which the
        // group name is not, so take the first of those instead.
        //
        // Curated stays FIRST so tenants that do use the flag are unchanged —
        // that gate exists to keep "ID Verification" off the Storage Outlet
        // cards, and this only applies where the gate leaves nothing at all.
        const subtypeSource = curatedSource.length
          ? curatedSource
          : [...(tier.amenities ?? [])].sort(bySortOrder).filter(uniqueByName);

        // '' when there is neither an amenity nor a meaningful group name —
        // every card renders the subtitle only when it is non-empty.
        const subtype = subtypeSource[0] ? amenityLabel(subtypeSource[0]) : groupSubtitle(group.name);

        // Four bullets, as before. Whichever label became the subtitle is
        // dropped so the card never prints it twice; without the gate that
        // entry is now usually still in the list.
        const features = displayAmenities
          .map(amenityLabel)
          .filter((l) => l !== subtype)
          .slice(0, 4);

        const vacantCount = tier.vacant?.count ?? 0;

        // Which min_price to quote (per Jaweed, 2026-07-30): a tier with vacancy is
        // quoted from `vacant.min_price` — the cheapest unit a customer can actually
        // rent — and only a tier with nothing vacant falls back to the whole-tier
        // `units.min_price`.
        //
        // Not cosmetic: 10'x10' reports units.min_price 0 across all 267 units (some
        // occupied at a legacy/zero rate) while its 125 vacant units start at 70, so
        // the card was advertising $0.00.
        //
        // `>= 1`, not `> 1`: the spec said "more than 1" / "0 or less" and left 1
        // unstated — one vacant unit still has a real vacant price. No live tier is
        // affected either way (the single vacant.count === 1 tier, 8'x12', reports
        // 116 in both objects).
        const availableMinPrice =
          vacantCount >= 1 ? tier.vacant?.min_price : tier.units?.min_price;

        // sell_rate stays the leading preference for when the API starts setting it;
        // it is null on every tier today, so the rule above governs in practice.
        const startingPrice =
          tier.sell_rate ?? availableMinPrice ?? tier.units?.min_price ?? 0;
        const inStorePrice = tier.set_rate ?? tier.units?.max_price ?? 0;

        // Promotion allocated to this tier (matched against the Promotions
        // widget by id). A tier carries at most one today, so take the first.
        const promo = tierPromo(tier);

        units.push({
          id: tier.id,
          unitGroupId: tier.tier_id,
          type,
          size,
          dimensions: tier.description,
          subtype,
          features,
          amenities: amenityNames,
          filterBarFeatures,
          vacantCount,
          // DEMO: derive card image from dimensions/size/type until the API
          // returns one per unit — see spaceImages.ts.
          image: spaceImageFor({ type, dimensions: tier.description, size, subtype }),
          inStorePrice,
          startingPrice,
          promoId: promo?.id,
          promo: promo?.name || undefined,
          // Promo pricing inputs for `enablePromoLogic` (see promoRate in
          // components/Pricing.tsx). promotionPrice is the API's own computed
          // figure and wins when present — it's null on every tier today, which
          // is why the value/kind pair exists as the fallback.
          promotionPrice: tier.promotion_sell_rate ?? undefined,
          promoValue: typeof promo?.value === 'number' ? promo.value : undefined,
          promoKind: promoKindFromName(promo?.name) ?? undefined,
        });
      }
    }
  }

  return units;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Unit tiers for one property's space group.
 *
 * DYNAMIC PAGES: this endpoint is REST-only (there is no space-groups collection),
 * and it needs ALL THREE ids. `propertyId` can be bound to `Properties > id`, but
 * `spaceGroupId` CANNOT — it is not a column on the properties collection, and
 * every property has a different one (plus 2–4 non-website groups to choose
 * wrongly from). So on a dynamic page `spaceGroupId` has to come from its own
 * content-menu field, or be discovered with `fetchWebsiteSpaceGroupId` below.
 *
 * `companyId` is a parameter for the same reason: a property id only resolves
 * within its company, and the dynamic-page site's properties belong to a different
 * company than the configured one. Defaults keep the pre-dynamic-page behaviour for
 * static pages.
 */
export async function fetchSpaceGroups(
  propertyId: string = PROPERTY_ID,
  spaceGroupId: string = SPACE_GROUP_ID,
  companyId?: string,
): Promise<unknown> {
  // Omitted → the `Company` collection, never config.json directly. SpaceList
  // passes its already-resolved id; anything else gets it from the same source.
  const company = companyId || await resolveCompanyIdFromSources('#05 space-list', {}, COMPANY_ID);
  const url = `${BASE_URL}/applications/${APP_ID}/v2/companies/${company}/properties/${propertyId}/space-groups/${spaceGroupId}/groups`;

  const res = await fetch(url, {
    headers: {
      'x-storageapi-date': String(Math.floor(Date.now() / 1000)),
      'x-storageapi-key': API_KEY,
    },
  });

  if (!res.ok) {
    // Include the ids: a 404 here almost always means company/property/space-group
    // are out of step with each other, and the status alone can't show that.
    throw new Error(
      `fetchSpaceGroups failed: ${res.status} ${res.statusText} — ` +
      `company=${companyId} property=${propertyId} spaceGroup=${spaceGroupId}`,
    );
  }

  return res.json();
}

/**
 * The property's public ("Website Group") space group, bound to this widget's own
 * credentials. See @shared/spaceGroups for why the name is the only usable signal.
 */
export async function fetchWebsiteSpaceGroupId(
  propertyId: string,
  companyId?: string,
): Promise<string | null> {
  // Callers that already resolved the company pass it; anyone else gets it from
  // the `Company` collection rather than config.json.
  const company = companyId || await resolveCompanyIdFromSources('#05 space-list', {}, COMPANY_ID);
  return findWebsiteSpaceGroupId(
    { baseUrl: BASE_URL, appId: APP_ID, apiKey: API_KEY, companyId: company },
    propertyId,
  );
}
