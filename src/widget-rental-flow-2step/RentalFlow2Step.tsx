import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './RentalFlow2Step.css';
import { Step2, type AutopayMode } from './Step2';
import {
  fetchProperty, fetchSpaceGroups, fetchProtectionPlans, plansForUnitType, fetchLeaseDocument,
  extractSelectionContext, fetchSelectionFromOffers, findUnitForSelection, fetchMoveInQuote, fetchUnitInfo,
  holdUnit, releaseHold, releaseHoldOnUnload, HOLD_TTL_SECONDS, defaultRentalCtx, reserveSpace, rentSpace, quoteToCosts,
  updateContactDetails, dobToIso,
  type RentResult,
  type ProtectionPlan, type LeaseDocument, type SelectionContext, type MoveInQuote,
  type UnitHold, type RentalCtx,
} from './api';
import cfg from './config.json';
import { Confirmation, type EntryMode } from './Confirmation';
import { tokenizeCard } from './gpTokenize';
import { OrderRail } from './OrderRail';
import { ChevronSolidIcon } from './icons';
/* The ASSET ONLY, deliberately — not the #02 component, its config, its props
   or any collection data. The rental flow replaces the site header on desktop
   and needs to look like it, so it borrows the mark and rebuilds the shell
   locally. Importing NavigationBar would drag in its nav tree, Properties
   lookups and Duda bindings, none of which belong on a checkout page. */
import storelocalLogo from '../widget-navigation-bar/Storelocal_logo.png';
import { imageUrl } from '@shared/dudaCollections';
import { RfCheckbox } from './RfCheckbox';
import { splitBusinessName } from './businessName';
import { readUnitSelection, clearUnitSelection } from '@shared/unitHandoff';
import { ProcessingModal } from './ProcessingModal';
import { SuccessStep } from './SuccessStep';
import { Shimmer } from '@shared/Shimmer';
import { FormField, Button, DateModal, AlertIcon, isPossiblePhone, type FieldType, type PhoneCountry } from '@shared/ui';
import { resolvePropertyId, boundText } from '@shared/propertyBinding';
import { resolveCompanyIdFromSources } from '@shared/companySource';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Local calendar date → YYYY-MM-DD (facility-local, no UTC shift). */
const ymd = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ---------------------------------------------------------------------------
// Widget #99 (TBD) — Rental Flow (2 Step). Figma: Mariposa — Duda.
// Step 1 ("Secure your space now", 8507-23264): contact form + Rent/Reserve.
//   Rent → Move-In Date lightbox (8507-23637). Confirming closes the modal and
//   crossfades to…
// Step 2 ("Secure your space now", 8507-23329): full checkout form.
// ---------------------------------------------------------------------------

export interface RentalFlow2StepProps {
  /**
   * Content-menu IMAGE input (`logoImage`) — the checkout header's logo, so a
   * site that sets its own in #02 can set the same one here.
   *
   * Typed `unknown` and read through `imageUrl()` for the reason #02 documents:
   * Duda hands images over in more than one shape — a plain URL string, or an
   * object keyed image / url / src / href / path / original — so the value is
   * normalised rather than trusted. Unset falls through to the bundled logo, so
   * an unconfigured widget looks exactly as it does today.
   */
  logoImage?: unknown;
  /** Same thing as a plain URL, for a site that has one to hand. */
  logoUrl?: string;
  eyebrow?: string;
  heading?: string;
  /** Underlined link at the end of the SMS-consent paragraph. */
  termsHref?: string;
  /** Operator-editable copy shown under the Reserve button when the reservation
   *  API call fails. Kept generic on purpose — raw status codes / backend text
   *  stay in the console, never in front of the shopper. */
  reserveFailedMessage?: string;
  /** Operator-editable confirmation-page headings (reservation vs rental). */
  reservationHeading?: string;
  rentalHeading?: string;
  /**
   * Where "Write a Review" points — the operator's Google review link.
   *
   * The confirmation and access screens show the review card ONLY when this is
   * set. The Figma frames draw it, but a review link is per-facility operator
   * data with no sensible default: a made-up or empty link would send people
   * nowhere, so the card stays hidden until someone supplies one.
   */
  reviewUrl?: string;
  /** Selection handed off from the value-tiers page (?size= / ?tier=) —
   *  display context only; the transaction re-resolves server-side. */
  size?: string;
  tier?: string;
  /** Facility handed off from value-tiers (?propertyId=/?companyId=) — resolved
   *  per instance like #14 (bound → Company collection → config), never hardcoded. */
  propertyId?: string;
  companyId?: string;
  /**
   * The property's autopay treatment, from the content panel's
   * `enrollmentAutoCheck` radio: optional | required | preselected.
   *
   * `required` is the always-enrolled frame — no checkbox at all, the terms at
   * the foot of the section and the consent on the pay button — which the
   * component calls `default`, so it is mapped rather than renamed: the radio's
   * words are the editor's, and "required" reads better than "default" beside
   * the other two in a Duda panel.
   *
   * The fourth treatment, the card processing fee, has no option here — it
   * describes a fee the property charges rather than how enrolment is offered,
   * so it will come from Hummingbird, not this radio. Until either arrives the
   * demo picker in step 2 covers all four.
   */
  autopay?: string;
  /** Tier's group id from the value-tiers handoff (?unitGroupId=) — the proxy
   *  reserve route needs it for the ownership check. */
  unitGroupId?: string;
  /** Proxy base URL for the Reserve write (e.g. https://proxy.host). Empty →
   *  reserve is unavailable (writes never hit the direct edge key). */
  proxyBaseUrl?: string;
  /** "Change Space" link target on the order rail (the value-tiers page). */
  changeSpaceUrl?: string;
  /** Protection-plan brochure PDF, opened from step 2's "Learn More" lightbox. */
  brochureUrl?: string;
  /**
   * DEV HARNESS ONLY — fills the designed surfaces with their Figma samples when
   * no live data has resolved, so the frames can be reviewed:
   *   • the order rail (8507-23233) without a value-tiers handoff
   *   • step 2's protection plans (8507-23352 / 8508-32894), which no API
   *     currently exposes pre-lease at all
   *
   * Never set this in Duda. Both surfaces carry a NO-DEMO-MONEY policy because
   * invented figures would show shoppers prices that are not real; this prop is
   * the one deliberate, opt-in exception, and live data always wins over it.
   */
  previewContent?: boolean;
  /** Duda runtime trio, passed by the Widget Builder shim (see #05's shim
   *  for the pattern). inEditor gates editor-vs-published behavior — in
   *  this widget it SUPPRESSES real writes (no unit holds while an editor
   *  fiddles with the page); siteId/elementId identify this placement for
   *  observability and future per-site config lookups. */
  inEditor?: boolean;
  siteId?: string;
  elementId?: string;
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// ---------------------------------------------------------------------------
// PREVIEW-ONLY rail content (Figma 8507-23233).
//
// This exists so the dev harness can show the rail as designed — with no
// value-tiers handoff there is no `?size=`/`?tier=`, so no selection resolves,
// no unit resolves, and therefore no quote: the rail correctly renders its
// empty state and the frame can't be reviewed.
//
// It is gated behind the `previewContent` prop and NOTHING sets that except
// dev/index.html. That gate is the point, not ceremony: OrderRail carries an
// explicit NO-DEMO-MONEY policy (Raymond, 2026-08-03) because a rail that
// invents figures when the quote pipeline fails would quote real shoppers
// prices that are not real. Live sites keep the honest empty state.
// ---------------------------------------------------------------------------
const PREVIEW_PROPERTY: import('./api').PropertyInfo = {
  // Not a real id on purpose: the preview must not resolve a hero photo out of
  // a live collection and pass it off as this invented property's.
  id: '',
  name: '3rd Street Storage',
  address: '1301 E. Mission Ave, Fullerton, CA 02027',
  // Unformatted digits — OrderRail applies the (xxx) xxx-xxxx formatting itself,
  // so pre-formatting here would bypass the code path being previewed.
  phone: '8776577465',
};

const PREVIEW_SELECTION: SelectionContext = {
  size: '5’ x 7’',
  inStore: 86,
  online: 64,
  promo: 'First Full Month FREE',
  // features[0] is the bold sub-line, the rest are the ticked list.
  features: ['Climate Controlled', '24 Hour Access', 'Drive Up', 'Near Entrances', 'No Late Fees'],
};

const PREVIEW_QUOTE: MoveInQuote = {
  unitId: 'preview',
  // Deliberately no unitNumber: MoneyBreakdown would add a "Unit #111" ROW, and
  // the frame shows the unit in the header line instead.
  totalDue: 99.68,
  totalTax: 0,
  lines: [
    // name 'Rent' + startDate is what makes MoneyBreakdown render
    // "Rent (Prorated)" with the date range beneath it.
    { name: 'Rent', cost: 53.68, startDate: '05/06/2026', endDate: '05/31/2026' },
    { name: 'Admin Fee', cost: 29 },
    { name: 'Protection', cost: 17 },
  ],
};

/**
 * Sample protection plans (Figma 8508-32894), harness/editor preview only.
 *
 * Live plans now come from the property's `insurances` endpoint and win
 * whenever it returns any. These fill the card only when the list is empty AND
 * previewContent is on, so a property with no coverage configured still shows
 * the honest "confirmed at checkout" note rather than invented money.
 */
const PREVIEW_PLANS: ProtectionPlan[] = [
  { id: 'preview-1000', coverage: 1000, premium: 11 },
  { id: 'preview-2000', coverage: 2000, premium: 12, name: 'Best Value' },
  { id: 'preview-3000', coverage: 3000, premium: 13 },
];

// A single labelled field — now the shared @shared/ui <FormField>. `valid`
// drives the green success state; `error` (submit attempted while invalid)
// turns it red with a concise message. Resting/focus states are the kit's CSS.
function Field({
  id, label, type = 'text', value, valid, error, onChange, phoneCountry,
}: {
  id: string;
  label: string;
  type?: FieldType;
  value: string;
  valid?: boolean;
  /** Submit was attempted while this field is invalid — red state. */
  error?: boolean;
  onChange: (v: string) => void;
  /** Opt in libphonenumber as-you-type formatting for a tel field. */
  phoneCountry?: PhoneCountry;
}) {
  const errorMsg = error
    ? type === 'email'
      ? 'Enter a valid email address'
      : type === 'tel'
        ? 'Enter a valid phone number'
        : `${label} is required`
    : undefined;
  return (
    <FormField
      id={id}
      label={label}
      type={type}
      value={value}
      onChange={onChange}
      required
      state={valid ? 'success' : 'default'}
      error={errorMsg}
      phoneCountry={phoneCountry}
    />
  );
}

/**
 * Rail-only placeholder used while Step 1 is already interactive.
 *
 * GROWTH-ONLY. What is drawn is only what the loaded card ALWAYS has at a size it
 * always has: the 208px hero, the 29px size line, the flat 50px price pair, the
 * payments row. Everything whose height is decided by the data — the amenity
 * list, the summary line, the promo pill, the breakdown's line items — is
 * deliberately NOT drawn.
 *
 * Those parts cannot be predicted: their sizes ARE the payload of the request
 * being waited on, so any figure typed here is right for one dataset and wrong
 * for the rest. Amenity rows reserve ~99px against a real 0 for a space with no
 * features, the promo pill reserves 72px for a promotion that may never exist,
 * and a three-row breakdown was tuned to a three-line quote on sites that bill
 * seven (rent, deposit, admin, key deposit, lock cut, lien notice, tax).
 * Reserving nothing for them means the card can only GROW when the data lands —
 * it can never come up short and snap.
 *
 * Growing is close to free: .rf-layout is a two-column grid with
 * align-items:start and the card is position:sticky above 901px, so its top edge
 * is pinned and the extra height extends downward into empty space. Between
 * 640-900px it sits below the form in one column and grows downward there too.
 * In no layout does the rail's height move the form beside it.
 *
 * The payments row IS drawn: SummaryRail defaults showPayments to true and
 * OrderRail never overrides it, so it is always present at a fixed height —
 * reserving it costs no shrink risk and takes that much out of the jump.
 *
 * "Change Space" is NOT drawn: that link needs a same-origin referrer
 * (backToSpacesUrl) and is absent on a direct navigation, so its 20px + 24px gap
 * would over-reserve in exactly the case where someone opens /rental cold.
 */
function RailSkeleton({ sheet = false }: { sheet?: boolean }) {
  return (
    <aside className="ts-card" aria-hidden="true">
      {/* Whichever header this copy of the rail will show. The sheet's is the
          logo row (.rf-sheethead), reusing the real header's classes so the
          two cannot drift — same padding, same 8px gap, same column, and the
          address reserves 30px because it is one <p> of two 15px lines. The
          desktop column still opens with the photo, so it keeps the full-bleed
          block it always had. */}
      {sheet ? (
        <div className="rf-sheethead rf-sheethead--skel">
          <Shimmer w={184} h={82} r={4} />
          <div className="rf-sheethead-info">
            <Shimmer w={128} h={30} r={4} />
            <Shimmer w={116} h={15} r={4} />
          </div>
        </div>
      ) : (
        <div className="ts-card-hero"><Shimmer w="100%" h="100%" r={0} /></div>
      )}
      <div className="ts-card-body">
        {/* .ts-card-top is a two-column flex, so its height is the TALLER of the
            two. Both sides are at their minimum, making this row 50px — exactly
            what the real card measures with no features and no "Change Space",
            and less than it measures in every other case. */}
        <div className="ts-card-top">
          <div className="ts-card-top-left">
            {/* .ts-card-size is 21px/1.2 here — see the .rf-wrapper override
                in RentalFlow2Step.css; the component's own rule is 24px. No
                sub-line and no amenity rows below it: both are slices of
                `selection.features`, routinely empty. */}
            <Shimmer w={152} h={25} r={4} />
          </div>
          <div className="ts-card-top-right">
            {/* .ts-card-prices is a flat 50px in BOTH the single-price and the
                struck-through variants, so this one is safe to reserve. */}
            <Shimmer w={124} h={50} r={4} />
          </div>
        </div>
        {/* The breakdown at ITS minimum: the single-line note and the total row
            OrderRail renders before a quote resolves. The line items are whatever
            the property bills, which varies most of all, so they are left to
            arrive rather than guessed at. */}
        <div className="ts-card-breakdown">
          <Shimmer w="100%" h={20} mb={12} r={4} />
          <div style={{ marginTop: 8 }}><Shimmer w="100%" h={22} r={4} /></div>
        </div>
        <div className="ts-card-payments">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Shimmer key={i} w={39} h={24} r={3} />
          ))}
        </div>
      </div>
    </aside>
  );
}

// Container-width breakpoint: below this the rail becomes the sticky
// top bar (mobile export m01–m05 / spec-05). Same value as #14.
const MOBILE_BP = 640;

const fmtBarCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// The confirmation page's version of the bar (Figma 8550-19760). Same 80px
// band, same rows, same sheet — only the copy differs, because by this point
// there is no hold left to count down and nothing left to pay: it reports what
// WAS paid and offers the lease summary.
function MobileLeaseBar({
  total, expanded, onToggle,
}: {
  total?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="rfm-bar" onClick={onToggle} aria-expanded={expanded}>
      <span className="rfm-bar-row">
        <span className="rfm-bar-title">Total Paid:</span>
        <span className="rfm-bar-total">{total != null ? `$${total.toFixed(2)}` : '\u2014'}</span>
      </span>
      <span className="rfm-bar-row">
        <span className="rfm-bar-lease">Lease Summary</span>
        <ChevronSolidIcon size={14} className={`rfm-bar-chev${expanded ? ' rfm-bar-chev--up' : ''}`} />
      </span>
    </button>
  );
}

// Sticky collapsed cost bar (mobile): "Total Cost to Move-In: $X /
// Holding Space for 14:59" + chevron. Tapping toggles the full rail
// card in a drop-down sheet (spec-05 Total Cost Dropdown Card).
//
// COST, not paid: this bar only exists inside the flow, where nothing has been
// charged yet — there is still a hold counting down beside it. The
// confirmation page has its own bar, MobileLeaseBar, which says "Total Paid:".
function MobileRailBar({
  total, holdRemaining, expanded, onToggle,
}: {
  total?: number;
  holdRemaining?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="rfm-bar" onClick={onToggle} aria-expanded={expanded}>
      {/* Two rows, each space-between (Figma 8509-51290): title | price, then
          countdown | chevron. */}
      <span className="rfm-bar-row">
        <span className="rfm-bar-title">Total Cost to Move-In:</span>
        <span className="rfm-bar-total">{total != null ? `$${total.toFixed(2)}` : '\u2014'}</span>
      </span>
      <span className="rfm-bar-row">
        {/* Empty span keeps the chevron hard right when there is no hold. */}
        {holdRemaining != null
          ? <span className="rfm-bar-hold">Holding Space for <b>{fmtBarCountdown(holdRemaining)}</b></span>
          : <span />}
        {/* Same solid mark as the plan dropdown — the frame's leaf is 8x14 in a
            24px box, which is this icon's own viewBox. It points RIGHT as
            drawn, so the caller rotates it. */}
        <ChevronSolidIcon size={14} className={`rfm-bar-chev${expanded ? ' rfm-bar-chev--up' : ''}`} />
      </span>
    </button>
  );
}

/**
 * Desktop checkout header (Figma 8507-23231).
 *
 * On this flow the site's own Duda header is hidden and replaced by this, so a
 * shopper mid-checkout keeps the brand but loses the navigation — there is
 * nowhere to wander off to. The nav is replaced by the hold countdown, which
 * is the only thing that matters on the page.
 *
 * Rebuilt from #02's design rather than imported: see the logo import above.
 */
function RentalHeader({ holdRemaining, homeHref, logoSrc, shrunk, innerRef }: {
  holdRemaining?: number;
  homeHref: string;
  /** Already resolved by the caller — the custom logo, or the bundled one. */
  logoSrc: string;
  /** Pinned and scrolled — the strip and banner contract, the countdown does not. */
  shrunk?: boolean;
  innerRef?: React.Ref<HTMLElement>;
}) {
  return (
    <header ref={innerRef} className={`rf-hdr${shrunk ? ' rf-hdr--shrunk' : ''}`}>
      {/* #02's structure exactly: the logo is an absolutely positioned banner
          that overhangs the bar, and .rf-hdr-inner is the white strip whose
          left gutter is reserved for it. The grey top bar (phone, live chat)
          is simply not built — checkout has no use for it — which puts this in
          #02's single-bar mode, hence the 210x104 banner rather than 264x150. */}
      <a className="rf-hdr-logo" href={homeHref} aria-label="Home">
        <img className="rf-hdr-logo-img" src={logoSrc} alt="" />
      </a>
      <div className="rf-hdr-inner">
        {/* Where #02 puts .nav-links. */}
        {holdRemaining != null && (
          <p className="rf-hdr-hold">
            Holding Space for <b>{fmtBarCountdown(holdRemaining)}</b>
          </p>
        )}
      </div>
    </header>
  );
}

export interface Contact {
  first: string;
  last: string;
  email: string;
  phone: string;
  business: boolean;
  /**
   * The trading name, when renting as a business — the one field that replaces
   * First/Last on that path.
   *
   * `first`/`last` are still populated from it, because the API requires both
   * on a contact and a lease cannot be filed without them. This keeps the name
   * as the operator typed it, so nothing downstream has to reassemble it from
   * a split that was never a real first and last name.
   */
  businessName?: string;
}

function Step1Form({
  eyebrow, heading, termsHref, brandName, transactionState, onRetry, changeSpaceUrl,
  onRent, onReserve, reserveError,
}: {
  eyebrow: string;
  heading: string;
  termsHref: string;
  brandName?: string;
  transactionState: 'loading' | 'ready' | 'unavailable' | 'error';
  onRetry: () => void;
  changeSpaceUrl?: string;
  onRent: (c: Contact) => void;
  onReserve: (c: Contact) => void;
  reserveError?: string;
}) {
  const [business, setBusiness] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  // Renting as a business replaces First + Last with a single trading name.
  const [bizName, setBizName] = useState('');
  const [attempted, setAttempted] = useState(false);
  const transactionReady = transactionState === 'ready';

  // The contact information the lease POST ultimately requires — Rent/Reserve
  // don't proceed until it's present. Which NAME fields count depends on the
  // business toggle, so an unfilled first name cannot block a business rental
  // that never showed the field.
  const checks: Array<[string, boolean]> = [
    ['rf-email', isValidEmail(email)],
    ['rf-phone', isPossiblePhone(phone, 'US')],
    ...(business
      ? [['rf-bizname', bizName.trim().length > 0]] as Array<[string, boolean]>
      : [['rf-first', first.trim().length > 0],
        ['rf-last', last.trim().length > 0]] as Array<[string, boolean]>),
  ];
  const gate = (proceed: (c: Contact) => void) => () => {
    if (!transactionReady) return;
    const firstInvalid = checks.find(([, ok]) => !ok);
    if (firstInvalid) {
      setAttempted(true);
      document.getElementById(firstInvalid[0])?.focus();
      return;
    }
    const name = business ? splitBusinessName(bizName) : { first: first.trim(), last: last.trim() };
    proceed({
      ...name,
      email: email.trim(),
      phone: phone.trim(),
      business,
      businessName: business ? bizName.trim() : undefined,
    });
  };
  const bad = (id: string) => attempted && !(checks.find(([k]) => k === id)?.[1]);

  return (
    <div className="rf-card">
      <div className="rf-title">
        <p className="rf-eyebrow">{eyebrow}</p>
        <h2 className="rf-heading">{heading}</h2>
      </div>

      <RfCheckbox checked={business} onChange={setBusiness} className="rf-business">
        I am renting as a business
      </RfCheckbox>

      <div className="rf-form">
        {/* The labels say whose details these are. Same fields, same
            validation — only the words change with the toggle. */}
        <div className="rf-row">
          <Field id="rf-email" label={business ? 'Business Email' : 'Email'} type="email" value={email}
            valid={isValidEmail(email)} error={bad('rf-email')} onChange={setEmail} />
          <Field id="rf-phone" label={business ? 'Business Phone' : 'Phone'} type="tel" value={phone} phoneCountry="US"
            valid={isPossiblePhone(phone, 'US')} error={bad('rf-phone')} onChange={setPhone} />
        </div>

        {phone.trim().length > 0 && brandName && (
          <p className="rf-consent">
            By providing your mobile number, you agree to receive text messages from
            {' '}{brandName}. Message frequency may vary. Standard rates apply. Reply HELP
            for assistance or STOP to unsubscribe.{' '}
            <a href={termsHref}>See Terms and Privacy Policy.</a>
          </p>
        )}

        {/* A business has one name, not a first and a last — so the pair
            collapses into a single full-width field rather than leaving an
            empty half-row. */}
        {business ? (
          <Field id="rf-bizname" label="Business Name" value={bizName}
            valid={bizName.trim().length > 0} error={bad('rf-bizname')} onChange={setBizName} />
        ) : (
          <div className="rf-row">
            <Field id="rf-first" label="First Name" value={first}
              valid={first.trim().length > 0} error={bad('rf-first')} onChange={setFirst} />
            <Field id="rf-last" label="Last Name" value={last}
              valid={last.trim().length > 0} error={bad('rf-last')} onChange={setLast} />
          </div>
        )}
      </div>

      <div className="rf-actions">
        <Button tone="cta" block disabled={!transactionReady} onClick={gate(onRent)}>Rent</Button>
        <div className="rf-or"><span>or</span></div>
        <Button tone="cta" fill="outline" block disabled={!transactionReady} onClick={gate(onReserve)}>Reserve</Button>
      </div>
      {transactionState === 'loading' && (
        <p className="rf-availability" role="status">Checking current availability and move-in pricing…</p>
      )}
      {/* Both error states are the boxed treatment (Figma 12029-86499), not
          just the one that could not fetch: they share .rf-availability--error
          and sit in the same slot, so styling one as a box and leaving the
          other as loose red text would read as a bug. The LOADING line above
          stays plain — it is not an error.
          A div, not a p: it holds the alert mark beside the text now. */}
      {transactionState === 'unavailable' && (
        <div className="rf-availability rf-availability--error" role="alert">
          <AlertIcon size={24} className="rf-availability-ico" />
          <span>
            This space is no longer available. {changeSpaceUrl && <a href={changeSpaceUrl}>Choose another space.</a>}
          </span>
        </div>
      )}
      {transactionState === 'error' && (
        <div className="rf-availability rf-availability--error" role="alert">
          <AlertIcon size={24} className="rf-availability-ico" />
          <span>
            We couldn’t verify this space right now. <button type="button" onClick={onRetry}>Try again</button>
            {changeSpaceUrl && <> or <a href={changeSpaceUrl}>choose another space</a></>}.
          </span>
        </div>
      )}
      {reserveError && <p className="rf-form-error" role="alert">{reserveError}</p>}
    </div>
  );
}

// Quick crossfade between steps.
const FADE_MS = 160;

/**
 * Access code shown on the STATIC path only.
 *
 * PLACEHOLDER. Nothing was rented, so there is no gate code to read — this is
 * the Figma's own sample value (8507-24349), kept obviously fake rather than
 * generated, so it can't be mistaken for a real one. The keyed path reads the
 * genuine code off the rental response and never reaches this.
 *
 * Bare digits, like a real code: <Confirmation> adds the "#…*" itself, and the
 * QR encodes this value verbatim — punctuation here would be scanned as part of
 * the code and printed twice on screen.
 */
const STATIC_ACCESS_CODE = '87368976';

/** "17604567890" → "(760) 456-7890". Leaves anything else untouched. */
function formatUsPhone(phone?: string): string | undefined {
  return phone ? phone.replace(/^1?(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : undefined;
}

/** thank-you page params (?type=…): confirmation mode instead of the flow. */
export interface ConfirmationData {
  kind: 'rental' | 'reservation';
  unitNumber?: string; code?: string; name?: string; phone?: string;
  moveInDate?: string; reservationDate?: string; entry?: EntryMode; errorMessage?: string;
  /** Immutable order-summary snapshot taken at success — the confirmation rail
   *  renders from THIS, never a live refetch (the unit is now reserved). */
  rail?: {
    property?: import('./api').PropertyInfo;
    selection?: SelectionContext;
    quote?: MoveInQuote;
  };
}

/** One-time random id for the confirmation payload handoff. */
function makeConfirmationNonce(): string {
  try { return crypto.randomUUID().replace(/-/g, ''); } catch { /* older browser */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
const fmtDisplayDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Persist the confirmation payload under a one-time nonce and return the
 *  `?type=&c=` params for the redirect. The transactional/PII values live in
 *  sessionStorage (never the URL); the nonce is the only thing in the query. */
function stashConfirmation(data: ConfirmationData): string {
  const nonce = makeConfirmationNonce();
  try { sessionStorage.setItem(`hb_conf_${nonce}`, JSON.stringify(data)); } catch { /* unavailable */ }
  return nonce;
}

/**
 * Resolve the confirmation to render. Real success is bound to a one-time nonce
 * written at the end of the transaction: the payload is read ONCE and deleted,
 * so a crafted `?type=…` URL — guessed nonce, or altered code/unit/date — can
 * never fake a confirmed page. The editor gets a demo preview; error pages stay
 * URL-driven (they carry no success claim).
 */
function readConfirmationPayload(inEditor: boolean): ConfirmationData | undefined {
  try {
    const p = new URLSearchParams(window.location.search);
    const type = p.get('type');
    if (type !== 'rental' && type !== 'reservation') return undefined;

    if (inEditor) {
      return {
        kind: type, name: 'John', unitNumber: '#111', code: '87368976',
        phone: '(949) 456-8765', moveInDate: 'Jun 20, 2026', reservationDate: 'Jun 18, 2026', entry: 'gate',
      };
    }

    const nonce = p.get('c');
    if (nonce && /^[A-Za-z0-9_-]{6,64}$/.test(nonce)) {
      const key = `hb_conf_${nonce}`;
      const raw = sessionStorage.getItem(key);
      if (raw) {
        sessionStorage.removeItem(key); // single-use
        const data = JSON.parse(raw) as ConfirmationData;
        if (data && data.kind === type) return data;
      }
    }

    // Error page: no success claim, low-sensitivity — still allowed via URL.
    const rawErr = p.get('errorMessage');
    const errorMessage = rawErr
      ? rawErr.slice(0, 140).replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[\d()+\-.\s]{10,}/g, ' ').trim() || undefined
      : undefined;
    if (errorMessage) return { kind: type, errorMessage };

    return undefined;
  } catch {
    return undefined;
  }
}

export function RentalFlow2Step({
  autopay,
  logoImage,
  logoUrl,
  eyebrow = 'Great choice!',
  heading = 'Secure your space now',
  termsHref = '#',
  brochureUrl,
  reserveFailedMessage = 'We couldn’t complete your reservation right now. Please try again in a moment — if it keeps happening, contact the facility and we’ll be glad to help.',
  reservationHeading = 'Your reservation is confirmed!',
  rentalHeading = 'Your Space is ready!',
  reviewUrl,
  size: sizeArg,
  tier: tierArg,
  propertyId: propertyIdArg,
  companyId: companyIdArg,
  unitGroupId: unitGroupIdArg,
  proxyBaseUrl = cfg.proxyBaseUrl ?? '',
  changeSpaceUrl,
  previewContent = false,
  inEditor = false,
  siteId,
  elementId,
}: RentalFlow2StepProps) {
  // The value-tiers Select hands off via the URL (?size/tier/propertyId/
  // companyId/unitGroupId). Read those first, falling back to props (Duda
  // content fields) — mirrors #14. Without this, companyId is undefined and the
  // widget wrongly queries the Company collection / its config-default facility.
  const urlParam = (k: string): string | undefined => {
    try { return new URLSearchParams(window.location.search).get(k) || undefined; } catch { return undefined; }
  };
  // A "Select" on #05 or #08 links here as a bare /rental and leaves the picked
  // unit in localStorage (@shared/unitHandoff), so read that too. Read ONCE per
  // mount: it must not change under the flow mid-rental if another tab writes a
  // different pick.
  const storedRef = useRef<ReturnType<typeof readUnitSelection> | undefined>(undefined);
  if (storedRef.current === undefined) storedRef.current = readUnitSelection();
  const stored = storedRef.current;

  // The URL still wins everywhere — existing links and the value-tiers handoff
  // behave exactly as before; the stored pick only fills what the URL omits.
  const sizeProp = sizeArg ?? urlParam('size') ?? stored?.size;
  const tierProp = tierArg ?? urlParam('tier');
  const propertyIdProp = propertyIdArg ?? urlParam('propertyId') ?? stored?.propertyId;
  const companyIdProp = companyIdArg ?? urlParam('companyId') ?? stored?.companyId;
  const unitGroupIdProp = unitGroupIdArg ?? urlParam('unitGroupId') ?? stored?.unitGroupId;
  // NOT filled from the stored pick: what the space lists hand over is a
  // pricing TIER id, and this slot means a rentable unit id. Passing a tier
  // here sends GET /units/{id}/lease-set-up an id it cannot resolve, so the
  // rail loses its money breakdown. The tier resolves to a real unit through
  // size + price below, the same route the value-tiers handoff takes.
  const unitIdProp = urlParam('unitId');
  // "Change Space" returns to the value-tiers page the shopper came from.
  const backToSpacesUrl = (() => {
    try {
      const ref = document.referrer;
      if (ref && new URL(ref).origin === window.location.origin) return ref;
    } catch { /* referrer unavailable */ }
    return undefined;
  })();
  // Placement context for every log line — which site/element misbehaved.
  const where = [siteId && `site ${siteId}`, elementId && `element ${elementId}`]
    .filter(Boolean).join(', ');
  const logTag = `[RentalFlow2Step${where ? ` ${where}` : ''}${inEditor ? ' (editor)' : ''}]`;

  /* The radio's three words to the component's four modes. `boundText` throws
     away an unsubstituted {{token}} and Duda's empty-string default, so an
     unset field falls through to undefined and the demo picker stays — rather
     than an empty string quietly selecting a mode nobody chose. */
  const autopayMode: AutopayMode | undefined = (() => {
    switch (boundText(autopay).toLowerCase()) {
      case 'required': return 'default';
      case 'preselected': return 'preselected';
      case 'optional': return 'optional';
      default: return undefined;
    }
  })();

  // Global Payments PUBLIC key — tokenization only; it cannot charge or read.
  const gpKey = ((cfg as { gpPublicKey?: string }).gpPublicKey ?? '').trim();
  const cfgCtx = React.useMemo(() => defaultRentalCtx(), []);
  const effectivePropertyId = resolvePropertyId({ propertyId: propertyIdProp }, cfgCtx.propertyId);
  const [effectiveCompanyId, setEffectiveCompanyId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveCompanyIdFromSources('#99 rental-flow', { companyId: companyIdProp }, cfgCtx.companyId)
      .then((id) => { if (!cancelled) setEffectiveCompanyId(id); })
      .catch(() => { if (!cancelled) setEffectiveCompanyId(cfgCtx.companyId); });
    return () => { cancelled = true; };
  }, [companyIdProp, cfgCtx.companyId]);
  const ctx: RentalCtx = React.useMemo(
    () => ({
      companyId: effectiveCompanyId ?? '',
      propertyId: effectivePropertyId,
      spaceGroupId: propertyIdProp ? undefined : cfgCtx.spaceGroupId,
      // Phase-2 writes (hold / hold-aware quote) go through the proxy, scoped to
      // the handed-off group — mirrors the Reserve boundary. Both required, else
      // the legacy direct-edge test-tenant path is used.
      proxyBaseUrl,
      unitGroupId: unitGroupIdProp,
    }),
    [effectiveCompanyId, effectivePropertyId, propertyIdProp, cfgCtx.spaceGroupId, proxyBaseUrl, unitGroupIdProp],
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [intent, setIntent] = useState<'rent' | 'reserve'>('rent');
  const [contact, setContact] = useState<Contact | undefined>(undefined);
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | undefined>(undefined);
  const [moveIn, setMoveIn] = useState<Date>(startOfToday);
  const timer = useRef<number | undefined>(undefined);

  // READ-ONLY wiring (GETs only — see api.ts). Each fetch fails soft to the
  // hard-coded demo content so the widget still renders in the editor, the
  // dev harness offline, or if the API shifts shape.
  const [brandName, setBrandName] = useState('');
  const [propertyInfo, setPropertyInfo] = useState<import('./api').PropertyInfo | undefined>(undefined);
  const [plans, setPlans] = useState<ProtectionPlan[]>([]);
  // Space type ID of the unit being rented, once resolved. Plans are configured
  // per space type, so this is what keeps a storage rental from being offered
  // the property's Commercial coverage (Bellflower returns both).
  const [unitTypeId, setUnitTypeId] = useState<string | undefined>(undefined);
  // Coverage chosen in step 2, or undefined for "I have my own insurance".
  // Lives here rather than in Step2 because it changes the QUOTE, not just the
  // card: lease-set-up prices the selected plan as its own invoice line.
  const [insuranceId, setInsuranceId] = useState<string | undefined>(undefined);
  // Only the plans for the space type being rented. Before the unit resolves
  // (or if its type is unknown) this is the full list — showing every plan is
  // recoverable, showing none would re-create the "confirmed at checkout" bug.
  const shownPlans = React.useMemo(() => plansForUnitType(plans, unitTypeId), [plans, unitTypeId]);
  const [leaseDoc, setLeaseDoc] = useState<LeaseDocument | undefined>(undefined);
  const [selection, setSelection] = useState<SelectionContext | undefined>(undefined);
  const [selectionStatus, setSelectionStatus] = useState<
    'loading' | 'matched' | 'unit-unavailable' | 'unit-unverified' | 'malformed' | 'network-error' | 'legacy-display'
  >('loading');
  const [quote, setQuote] = useState<MoveInQuote | undefined>(undefined);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // FIRST WRITE: entering step 2 places a real hold on the quoted unit
  // (test tenant only — api.ts writesEnabled() guard fails closed elsewhere).
  // 409 = someone else holds it; the unit also vanishes from
  // units/available, so recovery is re-pick → re-quote → re-hold once.
  /**
   * The hold, ADOPTED from the value-tiers popup when it sent one.
   *
   * #14 takes the hold the moment a tier is chosen, so the countdown here is
   * the real time remaining rather than a fresh fifteen minutes. Seeded from
   * the URL once, on mount: re-reading it later would resurrect a hold this
   * page had already released or replaced.
   *
   * An already-expired handoff is ignored, so the effect below acquires a new
   * one exactly as it did before this existed.
   */
  const [hold, setHold] = useState<UnitHold | undefined>(() => {
    const token = urlParam('holdToken');
    const heldAtRaw = urlParam('heldAt');
    const heldUnit = urlParam('unitId');
    // No unit id, no adoption: releasing later needs it, and a release against
    // an empty id is a 404 rather than a returned unit.
    if (!token || !heldAtRaw || !heldUnit) return undefined;
    const heldAt = Number(heldAtRaw);
    if (!Number.isFinite(heldAt) || heldAt <= 0) return undefined;
    const elapsed = (Date.now() - heldAt) / 1000;
    // Also rejects a clock-skewed future timestamp, which would otherwise show
    // a countdown longer than the hold really has.
    if (elapsed < 0 || elapsed >= HOLD_TTL_SECONDS) return undefined;
    return { unitId: heldUnit, holdToken: token, heldAt };
  });
  const [finalizing, setFinalizing] = useState<{ firstName: string } | undefined>(undefined);
  // The contact the LEASE was created with. Step 2 seeds from step 1 but is
  // editable, so this can differ from `contact` — and the confirmation has to
  // show what was actually filed, not what was typed a screen earlier.
  // Which optional sections the shopper ticked in step 2, carried to the
  // post-purchase screen so it opens them already ticked.
  const [chosenSections, setChosenSections] = useState<
    { business?: boolean; military?: boolean; altContact?: boolean; vehicle?: boolean } | undefined
  >(undefined);
  const [rentedContact, setRentedContact] = useState<
    { first: string; last: string; email: string; phone: string } | undefined
  >(undefined);
  /** Static payment path (no GP key): the lightbox has finished, show the
   *  post-purchase form rather than navigating to the confirmation page. */
  const [staticPaid, setStaticPaid] = useState(false);
  // The real rental (documents → lease → autopay). Present ⇒ money moved.
  const [rental, setRental] = useState<Extract<RentResult, { ok: true }> | undefined>(undefined);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | undefined>(undefined);
  /** "Get Access" pressed on the static post-purchase form. */
  const [accessGranted, setAccessGranted] = useState(false);
  /* Whether the shopper cleared ID verification on the step before. Held here
     rather than read back out of SuccessStep, which unmounts the moment access
     is granted. Starts true so nothing changes for a flow that never renders
     that step. */
  const [idVerified, setIdVerified] = useState(true);
  // Office/Gate hours fallback for the confirmation page: the immutable success
  // snapshot occasionally predates propertyInfo loading, so it can lack hours.
  // Hours are read-only + non-sensitive (unlike the money block), so it's safe
  // to refetch them here when the snapshot is missing them. Fail-soft.
  const [confHours, setConfHours] = useState<{ officeHours?: string[]; gateHours?: string[] } | undefined>(undefined);

  // Mobile mode is CONTAINER-width based (widgets embed at any width).
  // Observer attaches to the persistent wrapper — both the skeleton and
  // the live tree share the same root div, so it survives the swap
  // (lesson learned the hard way on #14).
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  /**
   * Tapping the cost bar opens or closes the sheet. Nothing else — it used to
   * also scroll the page back to the summary when pinned, which is redundant
   * now the sheet drops over the content instead of being appended below it.
   */
  const onRailToggle = () => setRailOpen((o) => !o);

  /**
   * How tall the sheet may be: whatever is left of the viewport below the bar's
   * slot — which is also exactly what drops the bar onto the bottom of the
   * screen, since the bar rides the sheet's bottom edge.
   *
   * Measured rather than assumed. The bar only sits at the top of the screen
   * once the page has scrolled past the widget; before that it is wherever the
   * flow puts it, and a hardcoded `100vh - 80px` would run off the bottom —
   * unreachable, because the page behind is locked.
   */
  const railBarRef = useRef<HTMLDivElement | null>(null);
  // Layout effect, not a plain one: the scrim is sized from this too, and a
  // frame at its fallback height would briefly add page scroll.
  useLayoutEffect(() => {
    if (!isMobile || !railOpen) return undefined;
    const measure = () => {
      const bar = railBarRef.current;
      const wrap = wrapRef.current;
      if (!bar || !wrap) return;
      const room = Math.max(window.innerHeight - bar.getBoundingClientRect().bottom, 0);
      // The scrim covers exactly what is visible below the bar. Not 100vh — an
      // absolutely positioned box past the viewport bottom lengthens the page
      // and creates the very scrollbar this is here to suppress.
      wrap.style.setProperty('--rfm-room', `${room}px`);
      // Exactly `room`, and no floor. The bar now sits on the sheet's BOTTOM
      // edge, so this number is what puts it on the bottom of the browser once
      // the card is taller than the screen: sheet top is .rfm-top's top, plus
      // `room`, plus the bar's own height, lands on innerHeight.
      //
      // The old 200px floor traded a faithfully-measured 20px sheet for a
      // usable scrollable one. That trade has inverted — overflow used to run
      // harmlessly off the bottom, where now it carries the bar off with it.
      //
      // CLAMPED TO THE CONTENT, not just to `room`. `room` is a CAP, and
      // max-height only caps: a card shorter than the screen leaves the wrap at
      // its content height while this variable says otherwise. The opening
      // animation then finishes early — the clip stops growing at the content
      // height while .rfm-sheet's translateY, which travels its OWN height, is
      // still running. That gap between the two is the sheet visibly parting
      // from the bar riding on its bottom edge. Taking the smaller of the two
      // makes the distance the clip grows and the distance the sheet travels
      // the same number, so they arrive together.
      const sheet = wrap.querySelector<HTMLElement>('.rfm-sheet');
      const content = sheet ? sheet.scrollHeight : room;
      wrap.style.setProperty('--rfm-sheet-max', `${Math.min(room, content)}px`);
    };
    measure();
    // The bar can still move: it is only pinned once the page has scrolled past
    // the widget, so a sheet opened before then travels with it.
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [isMobile, railOpen]);

  /**
   * Wheel over the scrim must not scroll the page behind it.
   *
   * Touch is handled in CSS (`touch-action: none`), but wheel has no such
   * property, and React attaches its own wheel listener passively — so
   * preventDefault has to come from a native non-passive one.
   *
   * There is deliberately NO document-level scroll lock. `overflow: hidden` on
   * html/body stops the content overflowing at all, so the browser clamps
   * scrollTop to 0: the page jumps to the top and takes the sticky bar with it.
   * The position:fixed-body variant is worse — it unpins sticky outright.
   * Blocking the interaction at the scrim leaves the document untouched.
   */
  const scrimRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = scrimRef.current;
    if (!node || !isMobile || !railOpen) return undefined;
    const block = (e: Event) => e.preventDefault();
    node.addEventListener('wheel', block, { passive: false });
    return () => node.removeEventListener('wheel', block);
  }, [isMobile, railOpen]);
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return undefined;
    // Synchronous seed: RO's first callback is async (and throttled to
    // nothing in hidden tabs) — without this a phone gets a desktop flash.
    // Guard on width > 0 like the observer below: Duda can mount the widget
    // before layout, and a 0 width would read as mobile (0 < 640), flashing the
    // mobile layout on desktop and expanding the page when it corrects.
    const seedWidth = node.getBoundingClientRect().width;
    if (seedWidth) setIsMobile(seedWidth < MOBILE_BP);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setIsMobile(w < MOBILE_BP);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Rail readiness. Step 1 stays mounted while these requests settle; this flag
  // swaps only the order rail's placeholder for verified live data.
  const [loading, setLoading] = useState(true);
  const [holdRemaining, setHoldRemaining] = useState<number | undefined>(undefined);
  const [holdExpired, setHoldExpired] = useState(false);
  /* The arrival hold could not be taken and no replacement was free. Step 1
     then shows its existing 'unavailable' state, so nobody fills a whole
     form against a space that was never secured. */
  const [holdFailed, setHoldFailed] = useState(false);
  const holdRef = useRef<UnitHold | undefined>(undefined);
  holdRef.current = hold;
  /*
   * One acquisition at a time, and `selection` read without depending on it.
   *
   * The acquire effect below WRITES `selection` and `quote` on the conflict
   * re-pick, and both were in its own dependency list — so it re-entered
   * itself mid-flight. The superseded run then finished its `holdUnit` call
   * and threw the token away because `cancelled` had been set, leaving a real
   * hold on a real unit that nothing would ever release. Every re-pick leaked
   * one, which is what "This unit is currently being held by another customer"
   * turned out to be: our own orphans.
   */
  const acquiringRef = useRef(false);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const unitTypeIdRef = useRef(unitTypeId);
  unitTypeIdRef.current = unitTypeId;
  /* The acquire effect stores a hold even when its run was superseded,
     because the hold is real. But if the component has already gone, no
     later render updates holdRef and the unmount cleanup has been and gone
     — so that one would leak. This lets the run hand it straight back. */
  const unmountedRef = useRef(false);
  /* space_mix_id from the resolved unit row, kept for the case where /offers
     cannot supply a selection. API 9 requires the field, so the fallback
     selection needs a source that does not depend on the offers call. */
  const resolvedSpaceMixRef = useRef<string | undefined>(undefined);
  /*
   * The unit's display number, from the unit row.
   *
   * Needed as its own source since the hold moved to arrival: the hold used to
   * be handed quote.unitNumber, but on arrival there is no quote yet, so the
   * hold carried no number and "#111" disappeared from the rail — and would
   * have been missing from the confirmation too. The ref feeds the hold call
   * without putting this in the effect's dependencies; the state feeds render.
   */
  const [resolvedUnitNumber, setResolvedUnitNumber] = useState<string | undefined>(undefined);
  const resolvedUnitNumberRef = useRef<string | undefined>(undefined);
  const holdContextRef = useRef<{ key: string; ctx: RentalCtx } | undefined>(undefined);

  useEffect(() => {
    /*
     * `rental` is in this guard because the success path calls
     * setHold(undefined) — correct, the hold is spent once the unit is leased
     * and the countdown must stop — but that clears the `hold` term above and
     * re-opens this effect while step is still 2. It then tried to hold the
     * unit it had just leased, took a 409 "This unit is currently leased", and
     * went off hunting for a replacement (findUnitForSelection +
     * fetchMoveInQuote) behind the confirmation. That search was the delay
     * after Pay Now, and on a slow list it could re-point the rail at some
     * other unit after the money had already been taken.
     */
    /*
     * ON ARRIVAL, not at step 2.
     *
     * The unit is known from the handoff the moment the page loads, so it is
     * secured before the shopper types anything rather than after they have
     * filled step 1 and picked a move-in date. It also does not wait for the
     * quote: the quote for a held unit has to be hold-aware anyway (the plain
     * GET 409s once anyone holds it, us included), so holding first REMOVES a
     * round-trip rather than adding one.
     *
     * The cost, and it is a real one: the 15-minute clock now covers reading
     * the page, the date modal, the form and the card. Expiry mid-flow is
     * likelier, which is what holdExpired and the re-acquire path are for.
     */
    const targetUnitId = quote?.unitId ?? unitIdProp;
    if (!targetUnitId || hold || holdExpired || rental) return;
    /*
     * Never hold against a half-resolved context. The company id arrives from
     * the Company collection a beat after mount, and holding before it lands
     * produced DELETE .../companies//units/... on release.
     */
    if (!effectiveCompanyId || !ctx.companyId) return;
    if (inEditor) {
      console.log(`${logTag} editor mode — real unit hold suppressed`);
      return;
    }
    // Re-entry guard. This effect writes selection and quote below, so without
    // it a re-pick starts a second acquisition while the first is still in
    // flight and both take holds.
    if (acquiringRef.current) return;
    acquiringRef.current = true;
    let cancelled = false;
    (async () => {
      try {
      setPayError(undefined);
      /*
       * Read the unit's own row BEFORE holding it.
       *
       * A held unit DISAPPEARS from units/available, and that list is the only
       * source for its display number, space_mix_id and space type. Holding on
       * arrival therefore hid the very row the rest of the flow needs: the rail
       * lost "#111", and documents/finalize was rejected with
       * '"space_mix_id" is required'.
       *
       * Skipped when the offers response has already supplied them.
       */
      if (!resolvedUnitNumberRef.current || !resolvedSpaceMixRef.current) {
        const info = await fetchUnitInfo(ctx, targetUnitId);
        if (info.number) {
          resolvedUnitNumberRef.current = info.number;
          if (!cancelled) setResolvedUnitNumber(info.number);
        }
        if (info.spaceMixId) resolvedSpaceMixRef.current = info.spaceMixId;
        if (info.unitTypeId) {
          unitTypeIdRef.current = info.unitTypeId;
          if (!cancelled) setUnitTypeId(info.unitTypeId);
        }
      }
      let result = await holdUnit(ctx, { id: targetUnitId, number: quote?.unitNumber ?? resolvedUnitNumberRef.current });
      if (result.ok === false && result.reason === 'conflict' && !cancelled) {
        console.warn(`${logTag} unit already held — re-picking:`, result.detail);
        // fresh list — the cached one still contains the 409'd unit. The type is
        // passed so the replacement is the same kind of space, not merely the
        // same size.
        const sel = selectionRef.current;
        const other = await findUnitForSelection(ctx, sel?.size, sel?.price ?? quote?.rent, true, unitTypeIdRef.current);
        if (other && other.id !== targetUnitId && !cancelled) {
          const q = await fetchMoveInQuote(ctx, other);
          if (q && !cancelled) {
            // The replacement is the same selected size/rate, but correlation
            // must follow the actual unit or the rail will mix identities.
            // space_mix_id must follow the unit. It is REQUIRED by API 9, and
            // keeping the original one described a unit we could not have —
            // silently filing the rental against the wrong space mix.
            setSelection((prev) => prev
              ? { ...prev, unitId: other.id, unitNumber: other.number, spaceMixId: other.spaceMixId ?? prev.spaceMixId }
              : prev);
            setQuote(q);
          }
          /*
           * Into the refs as well, not only the selection.
           *
           * setSelection above is a NO-OP when /offers has not resolved yet
           * (it returns prev), and a held unit cannot be looked up afterwards
           * — it leaves units/available the moment it is held, and
           * lease-set-up does not return space_mix_id (checked). So if these
           * are not captured here they are gone, and Pay Now fails with
           * '"space_mix_id" is required'.
           */
          if (other.spaceMixId) resolvedSpaceMixRef.current = other.spaceMixId;
          if (other.unitTypeId) {
            unitTypeIdRef.current = other.unitTypeId;
            if (!cancelled) setUnitTypeId(other.unitTypeId);
          }
          if (other.number) {
            resolvedUnitNumberRef.current = other.number;
            if (!cancelled) setResolvedUnitNumber(other.number);
          }
          result = await holdUnit(ctx, other);
        }
      }
      // NOT guarded on `cancelled`. A hold that was acquired EXISTS on the
      // server whether or not this run is still the current one, so dropping
      // it here is what stranded units for the full 15 minutes. Storing it is
      // also what lets the release-on-unmount effect give it back.
      if (result.ok && unmountedRef.current) {
        // Nothing left to hold it for.
        void releaseHold(ctx, result.hold);
      } else if (result.ok) {
        setHold(result.hold);
        setHoldFailed(false);
        // The held unit is now authoritative. Drop any quote that isn't its
        // own (e.g. the pre-hold unit after a conflict re-pick) and re-quote
        // hold-aware — the plain GET 409s once held, so POST { hold_token } is
        // the only source. Fail CLOSED: never show another unit's money.
        const held = result.hold;
        // Drop any quote that is not the held unit's — the effect below then
        // re-quotes hold-aware. Fail CLOSED: never show another unit's money.
        setQuote((prev) => (prev && prev.unitId === held.unitId ? prev : undefined));
      } else if (!cancelled) {
        if (result.reason === 'writes-disabled') {
          /*
           * No hold will ever be taken in this environment (harness, or a
           * build with writes off), and the initial plain quote was skipped
           * on the assumption one would be. Price it the ordinary way so the
           * rail still shows money instead of the technical-difficulty note.
           */
          const q = await fetchMoveInQuote(ctx, { id: targetUnitId, number: quote?.unitNumber });
          if (!cancelled && q) { setQuote(q); setQuoteFailed(false); }
          else if (!cancelled && !q) setQuoteFailed(true);
        } else {
          console.warn(`${logTag} hold not acquired:`, result.reason, result.detail);
          setPayError('We couldn’t secure this space. Please return and choose another available space.');
          // Step 1 shows its existing "unavailable" state rather than letting
          // the shopper fill a whole form against a space we cannot secure.
          setHoldFailed(true);
        }
      }
      } finally {
        acquiringRef.current = false;
      }
    })();
    return () => { cancelled = true; };
    // selection and unitTypeId are deliberately ABSENT. Both are only read on
    // the re-pick, through refs. selection in particular is WRITTEN by this
    // effect, so depending on it made the effect restart itself mid-flight —
    // which is how holds were being leaked. insuranceId/moveIn stay: they
    // change the money, not the unit, and the guards above stop a re-run once
    // a hold exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, unitIdProp, hold, holdExpired, rental, inEditor, logTag, ctx, effectiveCompanyId]);

  /**
   * Quote the HELD unit.
   *
   * This has to be its own effect because the hold can arrive two ways: taken
   * above, or handed over by the value-tiers popup in the URL. When it is
   * handed over, the acquire effect returns early — so anything that quoted
   * inside it would simply never run, and the flow would reach payment with no
   * money block at all. That is exactly what produced a 400 from
   * documents/finalize: total_payment_amount, bill_day and web_rate all come
   * from this quote.
   *
   * It is also the ONLY way to price a held unit: the plain GET 409s once
   * anyone holds it — including us.
   */
  useEffect(() => {
    if (!hold || inEditor) return undefined;
    if (quote && quote.unitId === hold.unitId) return undefined;
    let cancelled = false;
    fetchMoveInQuote(ctx, { id: hold.unitId, number: hold.unitNumber }, {
      holdToken: hold.holdToken,
      insuranceId,
      promotionIds: selection?.promotionIds,
      startDate: ymd(moveIn),
      offerToken: selection?.offerToken,
    })
      .then((q) => {
        if (cancelled) return;
        if (q) { setQuote(q); setQuoteFailed(false); }
        else { setQuote(undefined); setQuoteFailed(true); }
      })
      .catch((err) => {
        console.warn(`${logTag} hold-aware quote failed — failing closed:`, err);
        if (!cancelled) { setQuote(undefined); setQuoteFailed(true); }
      });
    return () => { cancelled = true; };
  }, [hold, quote, ctx, inEditor, insuranceId, selection, moveIn, logTag]);

  // Re-quote when a choice that changes the money changes — coverage or the
  // move-in date. Only while holding: lease-set-up will not price either of them
  // without a hold token, and the plain GET 409s on a held unit anyway.
  //
  // The first run is skipped: the hold effect above has just quoted with these
  // exact values, and re-firing would double every request for no new number.
  const choiceKey = `${insuranceId ?? ''}|${ymd(moveIn)}`;
  const quotedChoice = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!hold || step !== 2) return undefined;
    if (quotedChoice.current === undefined || quotedChoice.current === choiceKey) {
      quotedChoice.current = choiceKey;
      return undefined;
    }
    quotedChoice.current = choiceKey;
    let cancelled = false;
    fetchMoveInQuote(ctx, { id: hold.unitId, number: hold.unitNumber }, {
      holdToken: hold.holdToken,
      insuranceId,
      promotionIds: selection?.promotionIds,
      startDate: ymd(moveIn),
      offerToken: selection?.offerToken,
    })
      .then((q) => { if (!cancelled && q) setQuote(q); })
      // Keep the previous quote on failure rather than blanking the rail: the
      // shopper changed a plan, not the unit, and the old total is still the
      // last figure the API actually stood behind.
      .catch((err) => console.warn(`${logTag} re-quote after a choice change failed — keeping the previous total:`, err));
    return () => { cancelled = true; };
  }, [hold, step, choiceKey, insuranceId, moveIn, selection, ctx, logTag]);

  // Countdown driven by the acquisition timestamp, not a decrementing
  // counter — survives re-renders and background-tab throttling.
  useEffect(() => {
    if (!hold) { setHoldRemaining(undefined); return undefined; }
    const tick = () => {
      const left = HOLD_TTL_SECONDS - Math.floor((Date.now() - hold.heldAt) / 1000);
      setHoldRemaining(Math.max(0, left));
      if (left <= 0) {
        console.warn(`${logTag} hold expired`);
        setHold(undefined);
        setHoldExpired(true); // stop auto-renew — require an explicit reacquire
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [hold, logTag]);

  // Release on unmount.
  useEffect(() => () => {
    unmountedRef.current = true;
    const releaseContext = holdContextRef.current?.ctx;
    if (releaseContext?.companyId && holdRef.current) {
      void releaseHold(releaseContext, holdRef.current);
    }
  }, []);

  /*
   * Release when the PAGE goes away — refresh, tab close, navigating off.
   *
   * React's unmount cleanup does not run for any of those, so before this the
   * unit stayed held for the full 15 minutes every time someone reloaded the
   * rent page. Over a round of testing that quietly ate the available list and
   * made every later attempt meet "currently being held by another customer".
   *
   * "pagehide" rather than "beforeunload": it fires on mobile Safari and on
   * bfcache navigations, where beforeunload does not. The cost is that going
   * BACK to a bfcached page finds its hold released — the acquire effect just
   * takes a new one, exactly as it does after an expiry.
   *
   * A completed rental has already cleared the hold, so nothing is handed back
   * after the money has been taken.
   */
  useEffect(() => {
    const onHide = () => {
      const releaseContext = holdContextRef.current?.ctx;
      if (releaseContext?.companyId && holdRef.current) {
        releaseHoldOnUnload(releaseContext, holdRef.current);
      }
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let settled = 0;
    // On the confirmation page the unit is already reserved — a live re-fetch
    // would drop it or re-price it. The rail renders from the success snapshot
    // instead, so skip all data loading here.
    try {
      const confType = new URLSearchParams(window.location.search).get('type');
      if (confType === 'rental' || confType === 'reservation') { setLoading(false); return () => { cancelled = true; }; }
    } catch { /* ignore */ }
    // The initial context intentionally has companyId='' while collection/config
    // resolution is pending. Do not reset or release a hold with that incomplete
    // context — it produced DELETE .../companies//units/... requests.
    if (!effectiveCompanyId || !ctx.companyId) return () => { cancelled = true; };

    const contextKey = [ctx.companyId, ctx.propertyId, unitGroupIdProp ?? '', unitIdProp ?? ''].join('|');
    const priorHoldContext = holdContextRef.current;
    const contextChanged = !!priorHoldContext && priorHoldContext.key !== contextKey;
    if (contextChanged && holdRef.current) {
      void releaseHold(priorHoldContext.ctx, holdRef.current);
      setHold(undefined);
    }
    holdContextRef.current = { key: contextKey, ctx };

    // Duda re-renders the same root when panel props change — reset all
    // derived state so a stale selection/quote can't survive a context switch.
    setLoading(true);
    setBrandName('');
    setPropertyInfo(undefined);
    setSelection(undefined);
    setSelectionStatus('loading');
    setQuote(undefined);
    setQuoteFailed(false);
    setUnitTypeId(undefined);
    setInsuranceId(undefined);
    const settle = () => { if (!cancelled && ++settled >= 2) setLoading(false); };
    fetchProperty(ctx)
      .then((p) => {
        if (cancelled || !p) return;
        if (p.name) setBrandName(p.name);
        setPropertyInfo(p);
      })
      .catch((err) => console.error(`${logTag} fetchProperty error:`, err))
      .finally(settle);
    // Protection plans are their own endpoint (space-types → property
    // insurances) — deliberately NOT chained to space-groups: they are unrelated
    // reads, and the plan card should not wait on (or be lost with) the tier
    // lookup. Outside the settle() gate for the same reason: the rail renders
    // without plans, so they must not hold up the first paint.
    fetchProtectionPlans(ctx)
      .then((list) => { if (!cancelled) setPlans(list); })
      .catch((err) => console.error(`${logTag} fetchProtectionPlans error:`, err));
    // Selection + unit + quote. On a fully authoritative handoff (property,
    // company, group and unit all known) these reads need only those ids — never
    // the broad space-groups lookup — so skip it: it otherwise sits as a serial
    // round-trip in front of the price. Legacy/incomplete handoffs resolve the
    // selection and unit via space-groups as before.
    const authoritative = !!(unitIdProp && unitGroupIdProp && effectivePropertyId && effectiveCompanyId);

    // Quote pipeline: resolve the unit (its type narrows the plans), then price it.
    // Read through the ref, not the state: a hold arriving must not re-run this
    // whole load, and the one that matters was adopted from the URL before the
    // first render anyway.
    const adoptedHold = !!holdRef.current;
    /*
     * This page will hold the unit on arrival, so the plain quote below would
     * ask the one endpoint that cannot answer: GET lease-set-up 409s on a held
     * unit, INCLUDING our own hold. Skip it and let the hold-aware effect own
     * the price — exactly as an adopted hold already does.
     *
     * Previously this skip covered only a hold adopted from the URL, which is
     * why the arrival hold produced a 409 on every load the last time it was
     * tried.
     */
    const willHoldOnArrival = !inEditor && !!unitIdProp;
    const skipPlainQuote = adoptedHold || willHoldOnArrival;

    /**
     * Quote the unit with the PLAIN GET.
     *
     * Skipped entirely when a hold was handed over by the value-tiers popup:
     * lease-set-up 409s on a held unit, including one we hold ourselves, so
     * this could only ever fail there. Worse than useless — a late-landing 409
     * would set quoteFailed AFTER the hold-aware effect had cleared it, and the
     * readiness gate below requires !quoteFailed, leaving Rent disabled with a
     * correct quote on screen.
     *
     * The hold-aware effect owns the price in that case.
     */
    const runQuote = (
      resolveUnit: Promise<{ id: string; number?: string; unitTypeId?: string; spaceMixId?: string } | undefined>,
    ): Promise<void> => (skipPlainQuote
      ? // Still resolve the unit: it carries the space type the protection
        // plans narrow by, which the quote does not.
        resolveUnit.then((unit) => {
          if (!cancelled && unit?.unitTypeId) setUnitTypeId(unit.unitTypeId);
          if (unit?.spaceMixId) resolvedSpaceMixRef.current = unit.spaceMixId;
          if (unit?.number) { resolvedUnitNumberRef.current = unit.number; if (!cancelled) setResolvedUnitNumber(unit.number); }
        }).catch(() => {})
      : resolveUnit
      .then((unit) => {
        if (!cancelled && unit?.unitTypeId) setUnitTypeId(unit.unitTypeId);
        if (unit?.spaceMixId) resolvedSpaceMixRef.current = unit.spaceMixId;
        if (unit?.number) { resolvedUnitNumberRef.current = unit.number; if (!cancelled) setResolvedUnitNumber(unit.number); }
        return unit ? fetchMoveInQuote(ctx, unit) : undefined;
      })
      .then((q) => {
        if (cancelled) return;
        if (q) setQuote(q);
        else setQuoteFailed(true);
      })
      .catch((err) => {
        console.warn(`${logTag} move-in quote unavailable — rail shows the technical-difficulty note:`, err);
        if (!cancelled) setQuoteFailed(true);
      }));

    // Selection from /offers enriches the rail but does NOT decide availability.
    // If it cannot correlate the exact unit, retain only the authoritative
    // handoff identity + size. Never borrow another offer's amenities, promo,
    // token or price; the exact-unit quote and Step-2 hold remain authoritative.
    const runOffers = (fallback?: SelectionContext): Promise<void> => fetchSelectionFromOffers(
      ctx,
      unitGroupIdProp as string,
      { tier: tierProp, unitId: unitIdProp, size: sizeProp },
      { fresh: loadAttempt > 0 },
    )
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'matched') {
          setSelection(result.selection);
          setSelectionStatus('matched');
        } else {
          // spaceMixId from the resolved unit row: API 9 REQUIRES it, and
          // this fallback runs exactly when /offers could not supply one.
          setSelection(unitIdProp
            ? { unitId: unitIdProp, size: sizeProp ?? '', spaceMixId: resolvedSpaceMixRef.current }
            : fallback);
          setSelectionStatus(result.status);
        }
      })
      .catch((err) => {
        console.warn(`${logTag} offers selection unavailable:`, err);
        if (cancelled) return;
        // Same reason as above: without spaceMixId, API 9 rejects the rental.
        setSelection(unitIdProp
          ? { unitId: unitIdProp, size: sizeProp ?? '', spaceMixId: resolvedSpaceMixRef.current }
          : fallback);
        setSelectionStatus('network-error');
      });

    if (authoritative) {
      // FAST PATH — offers + unit-info + quote start immediately; no space-groups
      // round-trip in front of the price. If offer enrichment fails, the rail
      // falls back to the handed-off unit/size while the exact-unit quote and
      // Step-2 hold continue to govern readiness and availability.
      // Seed that minimal identity before /offers settles, so a slow enrichment
      // request cannot delay readiness after the exact-unit quote succeeds.
      setSelection({ unitId: unitIdProp, size: sizeProp ?? '' });
      const selectionDone = runOffers();
      const quoteDone = runQuote(
        fetchUnitInfo(ctx, unitIdProp).then((info) => ({ id: unitIdProp, ...info })),
      );
      Promise.all([selectionDone, quoteDone]).finally(settle);
    } else {
      // LEGACY / INCOMPLETE HANDOFF — space-groups resolves the selection and unit.
      fetchSpaceGroups(ctx)
        .then((raw) => {
          if (cancelled) return;
          if (unitIdProp || unitGroupIdProp || sizeProp) {
            const sel = extractSelectionContext(raw, unitGroupIdProp, sizeProp);
            let selectionDone: Promise<unknown> = Promise.resolve();
            if (unitGroupIdProp) {
              selectionDone = runOffers(sel);
            } else if (sel) {
              setSelection(sel);
              setSelectionStatus('legacy-display');
            } else {
              setSelectionStatus('unit-unavailable');
            }
            const resolveUnit: Promise<{ id: string; number?: string; unitTypeId?: string } | undefined> = unitIdProp
              ? fetchUnitInfo(ctx, unitIdProp).then((info) => ({ id: unitIdProp, ...info }))
              : sel
                ? findUnitForSelection(ctx, sel.size, sel.price)
                : stored?.size
                  ? findUnitForSelection(ctx, stored.size, stored.price)
                  : Promise.resolve(undefined);
            const quoteDone = runQuote(resolveUnit);
            if (!sel && !unitIdProp) console.warn(`${logTag} handoff selection not found in live data`, { tierProp, sizeProp, unitGroupIdProp });
            return Promise.all([selectionDone, quoteDone]);
          }
        })
        .catch((err) => console.error(`${logTag} fetchSpaceGroups error:`, err))
        .finally(settle);
    }
    fetchLeaseDocument(ctx)
      .then((doc) => { if (!cancelled) setLeaseDoc(doc); })
      .catch((err) => console.error(`${logTag} fetchLeaseDocument error:`, err));
    return () => { cancelled = true; };
    // inEditor is read via skipPlainQuote. It is fixed for the lifetime of the
    // widget — Duda does not toggle a page between editor and published — so
    // adding it would only risk re-running this whole load for no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeProp, tierProp, unitIdProp, unitGroupIdProp, logTag, ctx, effectiveCompanyId, effectivePropertyId, loadAttempt, stored?.size, stored?.price]);

  const goToStep = useCallback((next: 1 | 2) => {
    setPhase('out');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setStep(next);
      setPhase('in');
    }, FADE_MS);
  }, []);

  // Read the one-time confirmation payload exactly once (it self-deletes), then
  // reuse it across re-renders via the ref.
  const confirmationRef = useRef<ConfirmationData | undefined | 'unread'>('unread');
  if (confirmationRef.current === 'unread') confirmationRef.current = readConfirmationPayload(inEditor);
  const confirmation = confirmationRef.current;

  // Fill missing office/gate hours on the confirmation page (snapshot may predate
  // the property load). Read-only, fail-soft; runs only when hours are absent.
  useEffect(() => {
    const conf = confirmationRef.current;
    if (!conf || conf === 'unread') return;
    const p = conf.rail?.property;
    if ((p?.officeHours?.length ?? 0) > 0 || (p?.gateHours?.length ?? 0) > 0) return;
    if (!effectiveCompanyId) return;
    let cancelled = false;
    fetchProperty(ctx)
      .then((info) => { if (!cancelled && info) setConfHours({ officeHours: info.officeHours, gateHours: info.gateHours }); })
      .catch(() => { /* fail-soft: hours just stay hidden */ });
    return () => { cancelled = true; };
  }, [ctx, effectiveCompanyId]);
  /*
   * Sticky-header plumbing.
   *
   * `shrunk` comes from an IntersectionObserver on a zero-height sentinel above
   * the header, not a scroll listener — the browser reports the crossing itself
   * rather than us sampling scrollY on every frame.
   *
   * The measured height is published as --rf-hdr-h so the order rail can sit
   * BELOW the header rather than behind it. Measured rather than hardcoded
   * because the header changes height when it shrinks: two constants would
   * leave the rail either overlapping (if it used the tall value) or floating
   * in a gap (if it used the short one), and scrolling back up re-grows the
   * header while the rail is still pinned.
   */
  const hdrRef = useRef<HTMLElement>(null);
  const hdrSentinelRef = useRef<HTMLDivElement>(null);
  const [hdrShrunk, setHdrShrunk] = useState(false);

  useEffect(() => {
    const el = hdrSentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setHdrShrunk(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = hdrRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const write = () => wrap.style.setProperty('--rf-hdr-h', `${el.offsetHeight}px`);
    write();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hdrShrunk]);

  /*
   * The header is hoisted above every branch and rendered on FIRST paint.
   *
   * This widget replaces the site's own header on this page, so until it
   * appears the page has no header at all — a blank strip where the brand
   * should be. It depends on nothing that is fetched: the logo is a bundled
   * data URI and the countdown only appears once a hold exists.
   *
   * Nor behind `!isMobile`: that is set by a ResizeObserver AFTER mount, so
   * gating on it would cost the header a frame. CSS hides .rf-hdr under the
   * same 640px container width instead, which costs nothing at paint.
   */
  /* Same precedence as #02: the content-menu image wins, then a plain URL, then
     the bundled logo. imageUrl() returns '' for anything it cannot read, so a
     half-set field falls through instead of rendering a broken image. */
  const headerLogo = imageUrl(logoImage) || (logoUrl ?? '').trim() || storelocalLogo;

  const makeHeader = (withCountdown: boolean) => (
    <>
      {/* Zero-height marker: once it scrolls out of view the header is pinned. */}
      <div ref={hdrSentinelRef} className="rf-hdr-sentinel" aria-hidden="true" />
      <RentalHeader
        shrunk={hdrShrunk}
        innerRef={hdrRef}
        logoSrc={headerLogo}
        holdRemaining={withCountdown
          ? (holdRemaining ?? (previewContent ? HOLD_TTL_SECONDS : undefined))
          : undefined}
        /* Site root. The logo is the only way back out of checkout, so it must
           not inherit termsHref or any editor-set '#'. */
        homeHref="/"
      />
    </>
  );
  /** Steps 1-2: the hold is live, so the strip carries the countdown. */
  const header = makeHeader(true);
  /**
   * Steps 3-4: white strip and logo, no countdown.
   *
   * The space is paid for and the hold is spent — there is nothing left to
   * count down, and a timer still running next to "Your Space is ready!" reads
   * as a deadline the customer has already met. Only one branch renders at a
   * time, so the two share the sentinel and header refs without colliding.
   */
  const headerDone = makeHeader(false);

  /**
   * Every step change starts at the top of the new step.
   *
   * Advancing only swaps what is rendered — the scroll position is the
   * document's and does not care — so paying from the bottom of a long step 2
   * dropped you into the MIDDLE of step 3, which reads as the page not having
   * changed at all.
   *
   * One effect over a derived screen key rather than a scroll at each of the
   * three call sites: those live in different branches and one more would be
   * easy to add without remembering this.
   *
   * INSTANT, not smooth. This stands in for a page load, and a smooth glide up
   * several thousand pixels is slow enough to read as a delay — the same reason
   * the old fastScrollTo existed. The widget's own top, not the document's,
   * because the widget need not be the only thing on the Duda page.
   */
  const screen = accessGranted ? 'access' : staticPaid ? 'idv' : `step${step}`;
  const lastScreen = useRef(screen);
  useEffect(() => {
    if (lastScreen.current === screen) return;
    lastScreen.current = screen;
    const top = wrapRef.current?.getBoundingClientRect().top;
    if (top == null) return;
    window.scrollTo({ top: Math.max(0, window.scrollY + top), behavior: 'auto' });

    /*
     * Step 2 then travels down to the name row, after a short pause.
     *
     * Two moves on purpose, not one: the jump above puts the widget's top on
     * screen so the shopper sees WHERE they are, and the glide gives them the
     * sense of having moved past work already done. Landing straight there
     * would look like the page had simply opened halfway down.
     *
     * The sticky header overlaps whatever it is scrolled to, so the anchor is
     * offset by its measured height (--rf-hdr-h) plus a margin.
     */
    if (screen !== 'step2') return;

    let raf = 0;
    /* Half a second on the jumped-to top before anything moves. Without it the
       glide starts under the shopper's hand as the screen is still settling
       and reads as the page lurching rather than travelling. */
    const timer = window.setTimeout(() => {
      const rest = wrapRef.current?.querySelector('[data-rf2-rest]');
      if (!rest) return;
      const hdr = parseFloat(
        getComputedStyle(wrapRef.current!).getPropertyValue('--rf-hdr-h'),
      ) || 0;
      const to = Math.max(0, window.scrollY + rest.getBoundingClientRect().top - hdr - 16);
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        window.scrollTo({ top: to, behavior: 'auto' });
        return;
      }
      const from = window.scrollY;
      const dist = to - from;
      if (!dist) return;

      /* Animated here rather than with `behavior: 'smooth'`, because the
         native one takes no duration — the browser picks it (Chrome lands
         around half a second for a trip this size) and there is no way to ask
         for slower. 1.8ms per pixel is roughly twice that, clamped so a short
         hop is still unhurried and a long one on a phone does not crawl. */
      const duration = Math.min(1500, Math.max(700, Math.abs(dist) * 1.8));
      const start = performance.now();
      // easeInOutCubic — starts and ends still, so the halved speed reads as
      // deliberate rather than as the page being slow to respond.
      const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

      /* A scroll this long is easy to overtake, and fighting the shopper for
         the scrollbar is worse than not animating at all. Any real input hands
         the page straight back. */
      let cancelled = false;
      const stop = () => { cancelled = true; };
      const opts = { passive: true, once: true } as const;
      window.addEventListener('wheel', stop, opts);
      window.addEventListener('touchstart', stop, opts);
      window.addEventListener('keydown', stop, opts);

      const step = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo(0, from + dist * ease(t));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, 500);

    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [screen]);

  if (confirmation) {
    // Reservations are REAL (hold + reserve POSTs exist), so they show real
    // response data and NO demo banner. The prototype banner stays only for
    // the RENTAL flow, whose payment step is still the GP bridge prototype.
    //
    // The rail renders from the IMMUTABLE success snapshot — never live state —
    // because the unit is now reserved and would re-price/vanish. Editor
    // preview has no snapshot and falls back to whatever live state exists.
    const snap = confirmation.rail;
    const snapProp = snap?.property ?? propertyInfo;
    const fmtPhone = formatUsPhone(snapProp?.phone);
    // Drop the confirmation params so "Rent Online Now"/"Try again" re-enter the
    // flow (checkout) for the SAME unit instead of replaying the confirmation.
    const checkoutUrl = (() => {
      try {
        const u = new URL(window.location.href);
        ['type', 'c', 'errorMessage'].forEach((k) => u.searchParams.delete(k));
        return u.toString();
      } catch { return undefined; }
    })();
    const goToCheckout = () => { if (checkoutUrl) window.location.assign(checkoutUrl); };
    // Same rail the flow used, rebuilt from the immutable success snapshot —
    // one element, placed in the desktop grid OR the mobile sheet, never both.
    /* TWO of them, for the reason `rail`/`sheetRail` below are two: this rail is
       rendered in the desktop column AND in the mobile sheet, and only the sheet
       takes the logo header. One flagged copy would put the sheet's logo on the
       desktop rail as well — which is the mistake that pair already documents.
       `paid` is on BOTH, so the total reads "Total Paid to Move-In:" either way. */
    const makeConfirmationRail = (sheet: boolean) => (
      <OrderRail
        sheetLogo={sheet ? headerLogo : undefined}
        property={snapProp}
        selection={snap?.selection}
        quote={snap?.quote}
        estimate={confirmation.kind === 'reservation'}
        paid
      />
    );
    const confirmationRail = makeConfirmationRail(false);
    const confirmationSheetRail = makeConfirmationRail(true);
    return (
      <div className={`rf-wrapper${isMobile ? ' rf-wrapper--mobile' : ''}`} ref={wrapRef}>
        {headerDone}
        {/* The step-2 sticky bar and its overlay sheet, reused wholesale: the
            confirmation page needs the same "summary always reachable" affordance
            and rebuilding it would be a second thing to keep in step. */}
        {isMobile && (
          <div className="rfm-top" ref={railBarRef}>
            <div
              ref={scrimRef}
              className={`rfm-scrim${railOpen ? ' rfm-scrim--open' : ''}`}
              onClick={() => setRailOpen(false)}
              aria-hidden="true"
            />
            {/* Bar BELOW the sheet, per the frame: the panel opens downward and
                pushes the bar to its bottom edge. Absolutely positioned so the
                page behind still does not move — .rfm-top keeps the bar's own
                80px in flow, and everything inside this grows over the content
                instead of displacing it. */}
            <div className="rfm-panel">
              <div className={`rfm-sheet-wrap${railOpen ? ' rfm-sheet-wrap--open' : ''}`}>
                <div className="rfm-sheet">{confirmationSheetRail}</div>
              </div>
              <MobileLeaseBar
                total={snap?.quote?.totalDue}
                expanded={railOpen}
                onToggle={onRailToggle}
              />
            </div>
          </div>
        )}
        {confirmation.kind === 'rental' && (
          <div className="rf-demo-banner rf-demo-banner--page" role="note">
            Demo preview — no payment or lease was created.
          </div>
        )}
        <div className="rfc-layout">
          <Confirmation
            {...confirmation}
            confirmedHeading={confirmation.kind === 'reservation' ? reservationHeading : rentalHeading}
            facilityPhone={fmtPhone}
            spaceName={snap?.selection?.size}
            propertyName={snapProp?.name}
            propertyAddress={snapProp?.address}
            officeHours={snapProp?.officeHours?.length ? snapProp.officeHours : confHours?.officeHours}
            gateHours={snapProp?.gateHours?.length ? snapProp.gateHours : confHours?.gateHours}
            rentUrl={confirmation.kind === 'reservation' ? checkoutUrl : undefined}
            onRetry={goToCheckout}
            reviewUrl={reviewUrl}
          />
          {/* Desktop only — on mobile this same element is inside the sheet. */}
          {!isMobile && confirmationRail}
        </div>
      </div>
    );
  }

  // Static payment finished — the post-purchase form (Figma 8507-25408) takes
  // over the whole screen, the same slot the confirmation page would occupy.
  // "Get Access" then hands to the access screen (Figma 8507-24349), which is
  // the same <Confirmation> the real flow lands on: sent-code bar, access code,
  // wallet badges, move-in date, office/gate hours, review card, What's Next.
  // Composing that screen a second time would be a near-duplicate that drifts.
  // Live data ALWAYS wins; the preview only fills gaps, and only in the harness.
  // Per-field rather than all-or-nothing so a real property still shows its own
  // name and address while the selection is still resolving.
  const railProperty = propertyInfo ?? (previewContent ? PREVIEW_PROPERTY : undefined);
  const railSelection = selection ?? (previewContent ? PREVIEW_SELECTION : undefined);
  const verifiedQuote = selection?.unitId && quote?.unitId === selection.unitId ? quote : undefined;
  const railQuote = verifiedQuote ?? (previewContent ? PREVIEW_QUOTE : undefined);

  const correlatedSelection = !!(
    selection?.unitId
    && quote?.unitId
    && selection.unitId === quote.unitId
    && (!unitIdProp || quote.unitId === unitIdProp)
  );
  // Preview content may make the harness interactive, but must never weaken
  // transaction readiness on a published page.
  const previewEnabled = previewContent && inEditor;
  const transactionReady = previewEnabled || !!(
    correlatedSelection
    && propertyInfo
    && effectiveCompanyId
    && effectivePropertyId
    && unitGroupIdProp
    && !quoteFailed
  );
  const transactionState: 'loading' | 'ready' | 'unavailable' | 'error' = transactionReady
    ? 'ready'
    : holdFailed || (!unitIdProp && selectionStatus === 'unit-unavailable')
      ? 'unavailable'
      : quoteFailed
        ? 'error'
        : loading || !quote || selectionStatus === 'loading'
          ? 'loading'
          : 'error';

  const realUnitNumber = rental?.unitNumber ?? hold?.unitNumber
    ?? railQuote?.unitNumber ?? railSelection?.unitNumber ?? resolvedUnitNumber;
  const unitNumberLabel = realUnitNumber ? `#${realUnitNumber}` : undefined;

  // ONE aside for the whole flow. Steps 1, 2 and 3 show the same order — the
  // same property, space and money — so they render the same element rather
  // than three OrderRails that can drift apart. The post-purchase variant only
  // drops "Change Space", which is meaningless once the unit is rented.
  /* `sheet` is the mobile dropdown's copy. Only it swaps the photo hero for
     the logo row — the desktop column keeps the image, and the two are never
     rendered at once, so one flag on this builder is enough. */
  const railFor = (rented: boolean, sheet = false) => (
    <OrderRail
      sheetLogo={sheet ? headerLogo : undefined}
      property={railProperty}
      selection={railSelection}
      quote={railQuote}
      // The frame shows "#111 | 5’ x 7’" — the unit number leads, then the size.
      // SummaryRail composes that as `size | tierName`, so the unit goes in the
      // `size` slot and the dimensions move to the trailing one.
      //
      // The REAL number, in the order it becomes known: the leased unit, the
      // held one, the quoted one, then the offer's own `costs.Unit.number`,
      // which is available as soon as the tier resolves — before any hold. The
      // "#111" placeholder is the harness only, and only until a selection
      // loads, so a live page never shows a made-up unit.
      unitLabel={unitNumberLabel ?? (previewContent && !selection ? '#111' : undefined)}
      changeSpaceUrl={rented ? undefined : (changeSpaceUrl ?? backToSpacesUrl)}
      /* `rented` IS "the money has been taken" — it is only ever true on the
         success screens, and the rail's total there is what was paid, not what
         is still owed. It had been driving nothing but changeSpaceUrl, so the
         right-hand rail still read "Total Cost to Move-In:" after payment while
         MobileLeaseBar beside it already said "Total Paid:".
         No `estimate` here: a reservation never reaches this builder — it exits
         through the confirmation early-return above, which passes its own. */
      paid={rented}
      quoteFailed={quoteFailed}
      // Only an UNHELD quote assumes today: the pre-hold GET carries no
      // start_date, while the hold-aware POST sends the chosen one and the
      // engine honours it (verified against a held unit 2026-08-20). Warning
      // about a date the quote already reflects would be its own small lie.
    />
  );
  /* TWO of them. `rail` is rendered in both places — the desktop column at
     `{!isMobile && rail}` and the mobile sheet — so a single flagged copy put
     the sheet's logo header on the desktop rail as well. The desktop one keeps
     the photo hero; only the sheet's is flagged. */
  const rail = loading ? <RailSkeleton /> : railFor(false);
  const sheetRail = loading ? <RailSkeleton sheet /> : railFor(false, true);

  if (staticPaid) {
    // The held unit is real even on the static path — the hold and quote both
    // come from the live API.
    //
    // The access code is REAL after a rental: the lease response carries the
    // tenant's gate PIN at `lease.tenants[].pin` (verified 2026-08-20 — no
    // other endpoint returns one, and it does not exist before the lease).
    // Without a lease there is nothing to show, so the placeholder stands in
    // for the preview path only; a real rental that somehow returned no pin
    // falls back to the no-code variant rather than inventing one.
    const heldUnit = rental?.unitNumber ?? hold?.unitNumber ?? quote?.unitNumber;
    const staticUnitNumber = heldUnit ? `#${heldUnit}` : undefined;

    return (
      <div className={`rf-wrapper${isMobile ? ' rf-wrapper--mobile' : ''}`} ref={wrapRef}>
        {headerDone}
        {/* Both steps now, since both have a rail to open. Same bar and sheet as
            the nonce-backed confirmation above — the two routes render the same
            screen and should not behave differently. */}
        {isMobile && (
          <div className="rfm-top" ref={railBarRef}>
            <div
              ref={scrimRef}
              className={`rfm-scrim${railOpen ? ' rfm-scrim--open' : ''}`}
              onClick={() => setRailOpen(false)}
              aria-hidden="true"
            />
            {/* Bar BELOW the sheet, per the frame: the panel opens downward and
                pushes the bar to its bottom edge. Absolutely positioned so the
                page behind still does not move — .rfm-top keeps the bar's own
                80px in flow, and everything inside this grows over the content
                instead of displacing it. */}
            <div className="rfm-panel">
              <div className={`rfm-sheet-wrap${railOpen ? ' rfm-sheet-wrap--open' : ''}`}>
                <div className="rfm-sheet">
                  {/* `true, true` — rented AND sheet. The second flag was
                      missing, so this sheet fell back to the photo hero while
                      the identical sheet before payment showed the logo. */}
                  {railFor(true, true)}
                </div>
              </div>
              <MobileLeaseBar
                total={railQuote?.totalDue}
                expanded={railOpen}
                onToggle={onRailToggle}
              />
            </div>
          </div>
        )}
        {/* One rail for both steps, placed in the desktop grid or the mobile
            sheet. Step 3 was a bare left column with nothing beside it. */}
        {accessGranted ? (
          <div className="rfc-layout">
            <Confirmation
              kind="rental"
              name={finalizing?.firstName}
              phone={rentedContact?.phone ?? contact?.phone}
              // Only after a real lease: there is nothing to reference otherwise.
              reference={rental?.leaseId}
              unitNumber={staticUnitNumber}
              code={rental ? rental.accessCode : STATIC_ACCESS_CODE}
              entry="gate"
              moveInDate={fmtDisplayDate(moveIn)}
              confirmedHeading={rentalHeading}
              facilityPhone={formatUsPhone(propertyInfo?.phone)}
              spaceName={selection?.size}
              idUnverified={!idVerified}
              propertyName={propertyInfo?.name}
              propertyAddress={propertyInfo?.address}
              // Same fallback the real confirmation page uses: the property may
              // carry no hours, in which case they're fetched separately.
              officeHours={propertyInfo?.officeHours?.length ? propertyInfo.officeHours : confHours?.officeHours}
              gateHours={propertyInfo?.gateHours?.length ? propertyInfo.gateHours : confHours?.gateHours}
              reviewUrl={reviewUrl}
            />
            {!isMobile && railFor(true)}
          </div>
        ) : (
          <div className="rfc-layout">
            <SuccessStep
              chosen={chosenSections}
              onGetAccess={(details) => {
                // File what this screen collects against the tenant's contact.
                // Deliberately NOT awaited: the rental is already complete, the
                // shopper is owed their access screen immediately, and a failure
                // here is logged rather than shown — it cannot undo a lease.
                if (rental?.contactId && details) {
                  void updateContactDetails(ctx, rental.contactId, {
                    driverLicense: details.driverLicense,
                    driverLicenseExp: details.driverLicenseExp
                      ? dobToIso(details.driverLicenseExp)
                      : undefined,
                    driverLicenseState: details.driverLicenseState,
                    mailingAddress: details.mailingAddress,
                  });
                }
                setIdVerified(details?.idVerified ?? true);
                setAccessGranted(true);
              }}
            />
            {!isMobile && railFor(true)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`rf-wrapper${isMobile ? ' rf-wrapper--mobile' : ''}`} ref={wrapRef}>
      {header}
      {isMobile && (
        <div className="rfm-top" ref={railBarRef}>
          {/* A hold only exists after a unit is actually held, so on step 1
              there is genuinely nothing to count down — which is why the row
              was invisible. The sample value is harness-only, on the same gate
              as the rail's preview content: a live page must never claim to be
              holding a space it has not held. */}
          {/* Click-outside target, and the thing that keeps the page behind
              from scrolling. Before the panel in the DOM so the panel paints
              over it. */}
          <div
            ref={scrimRef}
            className={`rfm-scrim${railOpen ? ' rfm-scrim--open' : ''}`}
            onClick={() => setRailOpen(false)}
            aria-hidden="true"
          />
          {/* INSIDE .rfm-top and absolutely positioned, so the whole thing —
              sheet and the bar under it — hangs from wherever the bar happens
              to be, pinned to the top of the screen or still down in the flow,
              and overlays the content rather than pushing it down. .rf-wrapper
              is a container (container-type: inline-size ⇒ contain: layout),
              which would make a `fixed` sheet resolve against the widget
              instead of the viewport; anchoring here sidesteps that entirely.

              The bar comes LAST: the panel opens downward and carries it to the
              bottom edge. .rfm-top still reserves the bar's 80px in flow, so
              the page behind is unmoved either way.

              Always mounted, visibility driven by the class — a conditionally
              rendered element cannot transition, it can only appear. */}
          <div className="rfm-panel">
            <div className={`rfm-sheet-wrap${railOpen ? ' rfm-sheet-wrap--open' : ''}`}>
              <div className="rfm-sheet">{sheetRail}</div>
            </div>
            <MobileRailBar
              total={quote?.totalDue}
              holdRemaining={holdRemaining ?? (previewContent ? HOLD_TTL_SECONDS : undefined)}
              expanded={railOpen}
              onToggle={onRailToggle}
            />
          </div>
        </div>
      )}
      <div className="rf-layout">
        <div className="rf-main">
          {step === 2 && holdExpired && (
            <div className="rf-hold-expired" role="alert">
              <span>Your hold expired — your space wasn’t reserved. Reacquire it to continue.</span>
              <Button tone="cta" onClick={() => setHoldExpired(false)}>Reacquire space</Button>
            </div>
          )}
          <div className={`rf-step rf-step--${phase}`}>
        {step === 1 ? (
          <Step1Form
            eyebrow={eyebrow}
            heading={heading}
            termsHref={termsHref}
            brandName={brandName || undefined}
            transactionState={transactionState}
            onRetry={() => setLoadAttempt((n) => n + 1)}
            changeSpaceUrl={changeSpaceUrl ?? backToSpacesUrl}
            reserveError={reserveError}
            onRent={(c) => { setContact(c); setIntent('rent'); setDateModalOpen(true); }}
            onReserve={(c) => { setContact(c); setIntent('reserve'); setReserveError(undefined); setDateModalOpen(true); }}
          />
        ) : (
          <Step2
            autopayMode={autopayMode}
            moveIn={moveIn}
            // Everything step 1 already asked for, so step 2 opens filled in.
            contact={contact}
            // The whole list, not plans[0]: the card is a dropdown now, so it
            // needs every option. Live plans win; the sample only fills an empty
            // list, and only in the harness.
            plans={shownPlans.length ? shownPlans : (previewContent ? PREVIEW_PLANS : [])}
            leaseDocName={leaseDoc?.name}
            brochureUrl={brochureUrl}
            onPlanChange={setInsuranceId}
            onEditDate={() => setDateModalOpen(true)}
            payNowTotal={railQuote?.totalDue}
            paying={paying}
            payError={payError}
            gpPublicKey={gpKey}
            onPaymentComplete={(info) => {
              // REAL RENTAL. A card plus a live hold and quote means we have
              // everything the documented flow needs (guide APIs 9→10→11), so
              // run it instead of the prototype bridge below. Nothing is
              // cleared or advanced until the lease actually comes back: this
              // charges the card, and a failure has to leave the shopper on the
              // form with their details intact.
              if (info.card && hold && quote) {
                if (paying) return; // in flight — never double-charge
                /*
                 * The lightbox opens on the CLICK, not on the response.
                 *
                 * APIs 9/10/11 take several seconds, and all the shopper used
                 * to get for them was a disabled button reading "Processing…",
                 * followed by a modal that then ran its own timer — so the wait
                 * was the request PLUS the animation. Now the modal covers the
                 * request: its bar creeps while `paying` is true and completes
                 * once the rental returns.
                 */
                setFinalizing(info);
                /*
                 * space_mix_id is REQUIRED by documents/finalize and there is
                 * no way to recover it once the unit is held — it leaves
                 * units/available, and lease-set-up does not return it. If it
                 * is missing here, say so by name rather than letting the API
                 * answer with a bare 400 that reads like a payload bug.
                 */
                if (!(selection?.spaceMixId ?? resolvedSpaceMixRef.current)) {
                  console.error(`${logTag} space_mix_id missing at Pay Now — it must be captured BEFORE the unit is held (offers, the pre-hold unit read, or the re-pick). documents/finalize will reject this.`);
                }
                setPaying(true);
                setPayError(undefined);
                const start = ymd(moveIn);
                const c = info.contact;
                // Captured before the async hop: inside the callback below
                // TypeScript can no longer see that info.card is defined.
                const card = info.card;
                // Hosted fields already minted a real token inside GP's iframe,
                // and there is no PAN on this side to tokenize a second time.
                // Only the plain-input fallback has to ask for one — and that
                // ask is fail-soft, because the lease succeeds on the number
                // alone today and a gateway outage must not stop a rental.
                const withToken = card.token
                  ? Promise.resolve({ token: card.token, masked: card.maskedCardNumber ?? '' })
                  : tokenizeCard(gpKey, {
                    number: card.cardNumber,
                    cvv: card.cvv,
                    expMonth: card.expMonth,
                    expYear: card.expYear,
                  });
                void withToken.then((tok) => rentSpace(ctx, {
                  unit: { id: hold.unitId, number: hold.unitNumber },
                  holdToken: hold.holdToken,
                  contact: {
                    first: c?.first ?? '',
                    last: c?.last ?? '',
                    email: c?.email ?? '',
                    phone: c?.phone ?? '',
                    businessName: c?.businessName,
                    // The tenant's address is the billing address they just
                    // typed — the form asks for one address, not two.
                    address: card.address,
                    city: card.city,
                    state: card.state,
                    zip: card.zip,
                  },
                  card: {
                    ...card,
                    autoCharge: info.autopay,
                    token: tok?.token,
                    // Held, not sent: the API rejects a masked_credit_card_number
                    // key outright, so it waits here for the field to exist.
                    maskedCardNumber: tok?.masked,
                    // card_type is derived by cardPaymentMethod() from the
                    // number it actually sends — in hosted mode there is no
                    // PAN here to read a brand from.
                  },
                  startDate: start,
                  // Falls back to the unit row captured before the hold —
                  // API 9 REQUIRES this, and /offers cannot always supply it.
                  spaceMixId: selection?.spaceMixId ?? resolvedSpaceMixRef.current,
                  billDay: quote.billDay,
                  // Non-prorated monthly rate. The quote's own rent is the
                  // authority; the tier price is the fallback.
                  webRate: quote.rent ?? selection?.price,
                  totalPaymentAmount: quote.totalDue,
                  costs: quoteToCosts(quote, start),
                  promotionIds: selection?.promotionIds,
                  platform: 'website',
                  extras: info.extras,
                })
                  .then((res) => {
                    setPaying(false);
                    if (!res.ok) {
                      console.error(`${logTag} rental failed at the ${res.stage} step:`, res.error);
                      // Take the lightbox down: it is now open from the click,
                      // and leaving it up would hide the error behind a bar
                      // that can never finish.
                      setFinalizing(undefined);
                      setPayError(res.error);
                      return;
                    }
                    console.log(`${logTag} rental complete — lease ${res.leaseId}`);
                    setRental(res);
                    if (info.contact) setRentedContact(info.contact);
                    if (info.extras) setChosenSections(info.extras);
                    // The unit is LEASED now, so the hold is spent: forget it so
                    // the countdown stops and unmount does not try to release a
                    // hold that no longer exists. Ref cleared by hand too —
                    // setHold only reaches holdRef on the next render, and a
                    // pagehide before that would release a leased unit's hold.
                    holdRef.current = undefined;
                    setHold(undefined);
                    clearUnitSelection();
                    setFinalizing(info);
                  })
                  .catch((err) => {
                    // rentSpace never throws, so reaching here is a bug rather
                    // than a payment failure — say something honest either way.
                    setPaying(false);
                    setFinalizing(undefined);
                    console.error(`${logTag} rental threw unexpectedly:`, err);
                    setPayError('Something went wrong completing your rental. Please try again.');
                  }));
                return;
              }
              // Published checkout must never fall through to the harness
              // completion when the authoritative hold failed or is pending.
              if (!previewEnabled) {
                setPayError('We couldn’t secure this space. Please return and choose another available space.');
                return;
              }
              // No card, or no hold/quote to rent against — nothing to
              // charge, so this is the harness/preview path: show the
              // finalizing beat and hand to the post-purchase screen.
              setFinalizing(info);
              if (info.extras) setChosenSections(info.extras);
              // The pick has been acted on — drop it so returning to /rental
              // later starts clean instead of silently re-selecting it.
              clearUnitSelection();
            }}
          />
        )}
          </div>
        </div>
        {!isMobile && rail}
      </div>

      {/* Finalizing beat (Figma 8509-35122): the lightbox hands to the
          post-purchase form (8507-25408) in place — no navigation. */}
      {finalizing && (
        <ProcessingModal
          open
          firstName={finalizing.firstName}
          facilityName={brandName}
          /* The same logo the header shows — content-panel image, then logoUrl,
             then the bundled fallback. Resolved once, at line ~1635. */
          logoSrc={headerLogo}
          /* The rental is still in flight, so hold the bar short of the end.
             On the preview path there is no request and this is false from the
             start, which is the original fixed-duration behaviour. */
          waiting={paying}
          onDone={() => setStaticPaid(true)}
        />
      )}

      <DateModal
        open={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        selected={moveIn}
        onSelect={setMoveIn}
        title={intent === 'reserve' ? 'Select your Move-In Date' : undefined}
        // Rent: the button names the chosen day once it is not today, so the
        // commitment is explicit before it is made ("Rent Sep 28, 2026").
        // Today keeps the shorter "Rent Today" — a date there would just restate
        // the default. Reserve stays label-only per its frame.
        ctaLabel={
          intent === 'reserve'
            ? 'Reserve'
            : moveIn.getTime() > startOfToday().getTime()
              ? `Rent ${fmtDisplayDate(moveIn)}`
              : undefined
        }
        // Outline for reserve: the softer commitment gets the softer control.
        ctaFill={intent === 'reserve' ? 'outline' : 'solid'}
        footer={intent === 'reserve' ? (
          <>
            Save Time and Money!{' '}
            {/* Switches the OPEN modal to the rent flow — title, button fill and
                label all key off `intent`, so the chosen date survives the
                switch and the shopper does not restart. */}
            <button type="button" onClick={() => setIntent('rent')}>Rent Now</button>
          </>
        ) : undefined}
        busy={reserving}
        onConfirm={async () => {
          if (intent === 'reserve') {
            if (!contact) { setDateModalOpen(false); return; }
            // Whole reserve handler is guarded: any await (find/hold/reserve)
            // can reject, and an unhandled rejection would freeze the modal in
            // its busy state with no message. finally always clears `reserving`.
            setReserving(true);
            try {
              // Documented reserve flow: hold the chosen unit, then reserve it
              // (reserveSpace re-prices via lease-setup). Reuse an existing hold
              // if one is already live for this unit.
              const picked = quote?.unitId
                ? { id: quote.unitId, number: quote.unitNumber }
                : await findUnitForSelection(ctx, selection?.size, selection?.price);
              if (!picked?.id || !unitGroupIdProp) {
                setDateModalOpen(false);
                setReserveError('This space is no longer available to reserve. Please pick another.');
                return;
              }
              let heldToken = hold && hold.unitId === picked.id ? hold.holdToken : undefined;
              if (!heldToken) {
                const h = await holdUnit(ctx, picked);
                if (!h.ok) {
                  setDateModalOpen(false);
                  setReserveError(h.reason === 'conflict'
                    ? 'That space was just taken. Please pick another.'
                    : 'This space is no longer available to reserve. Please pick another.');
                  return;
                }
                setHold(h.hold);
                heldToken = h.hold.holdToken;
              }
              const result = await reserveSpace(ctx, {
                unit: picked,
                holdToken: heldToken,
                startDate: ymd(moveIn),
                platform: brandName ? `${brandName} Website` : 'website',
                contact: { first: contact.first, last: contact.last, email: contact.email, phone: contact.phone },
              });
              setDateModalOpen(false);
              if (result.ok) {
                // The reservation has consumed the hold, exactly as a lease
                // does. Forget it so the navigation below cannot fire the
                // pagehide release against a unit that is now reserved.
                // The ref is cleared by hand as well: setHold only reaches
                // holdRef on the next render, and the navigation below happens
                // in this same tick.
                holdRef.current = undefined;
                setHold(undefined);
                // Bind the confirmation to a one-time nonce: the payload (incl.
                // PII + code) lives in sessionStorage; only the nonce is in the URL.
                const nonce = stashConfirmation({
                  kind: 'reservation',
                  name: contact.first,
                  phone: contact.phone,
                  unitNumber: result.unitNumber ? `#${result.unitNumber}` : undefined,
                  code: result.reservationId,
                  moveInDate: fmtDisplayDate(moveIn),
                  reservationDate: fmtDisplayDate(new Date()),
                  // Immutable snapshot of the AUTHORITATIVE reserve-time cost
                  // (what we submitted), falling back to the step-2 quote.
                  rail: { property: propertyInfo, selection, quote: result.quote ?? quote },
                });
                const url = new URL(window.location.href);
                ['unit_number', 'code', 'move_in_date', 'reservation_date'].forEach((k) => url.searchParams.delete(k));
                url.searchParams.set('type', 'reservation');
                url.searchParams.set('c', nonce);
                window.location.assign(url.toString());
              } else {
                // Keep the raw API detail (status codes, backend text) in the
                // console for debugging, but never show it to the shopper — the
                // UI gets a calm, professional message instead.
                console.error(`${logTag} reserve failed:`, result.error);
                setReserveError(reserveFailedMessage);
              }
            } catch (err) {
              console.error(`${logTag} reserve error:`, err);
              setDateModalOpen(false);
              setReserveError('Something went wrong completing your reservation. Please try again.');
            } finally {
              setReserving(false);
            }
            return;
          }
          setDateModalOpen(false);
          if (step === 1) goToStep(2);
        }}
      />
    </div>
  );
}
