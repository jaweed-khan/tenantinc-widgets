// ===========================================================================
// "You've got your space! Finish up below for access" — the post-purchase screen.
// Figma: Mariposa — Duda, node 8507-25408.
//
// Two parts: an ID Verification card, then Additional Information whose field
// groups are each revealed by their own checkbox. In the Figma frame every
// checkbox is ticked so all groups show at once; here they start UNTICKED and
// reveal on demand, because that is what the checkbox is for — showing 20 fields
// to someone storing nothing but boxes would be a worse screen than the design.
//
// Fields are `@shared/ui` FormField — the frame is built from the same
// "Mariposa Form 2.0" component the kit was traced from.
//
// STATIC, as briefed: nothing is submitted, and "Get Access" / "Verify ID Now"
// are inert. The ID illustration's line art is bundled; see the note on
// `IdIllustration` for the one asset that isn't.
// ===========================================================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Checkbox, FormField, isPossiblePhone } from '@shared/ui';
import { AddressAutocomplete } from '@shared/AddressAutocomplete';
import { CUSTOMER_ADDRESS_COUNTRIES } from '@shared/placesApi';
import {
  ChevronBig, TickSingleIcon, AlertTriangleIcon, ClockGlyph, PhoneGlyph,
} from './planIcons';
import { IdIllustration } from './IdIllustration';
import { IdVerifyModal } from './IdVerifyModal';


function Select({
  label, value, onChange, options, required, error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  /** Rendered by the FormField face below, so a select's message sits in the
   *  same place and style as every other field's. */
  error?: string;
}) {
  return (
    <div className="rf-select">
      <label className="rf-select-native">
        <span className="rf-sr-only">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
          <option value="">{`Select ${label}`}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <div className="rf-select-face" aria-hidden="true">
        <FormField label={label} required={required} value={value} onChange={() => {}} error={error} />
        <ChevronBig size={24} className="rf-select-chev" />
      </div>
    </div>
  );
}

/** What this screen can actually file against the contact after the lease. */
/**
 * DUMMY — what the ID verification app hands back once a scan succeeds. Values
 * from Figma 8754-49724. It carries more than the widget's own fields do (a
 * full state name, a written-out date), which is why the read-only summaries
 * render THIS rather than re-deriving from the inputs: those hold the two-letter
 * code and MM/DD/YYYY the record actually stores.
 *
 * Replace with the app's real response; nothing else here has to change.
 */
/**
 * ID verification is switched OFF.
 *
 * Nothing behind it is wired to a real service yet, so it must not appear on a
 * demo or a live page. One flag rather than a hundred commented-out lines: the
 * whole flow — the card, the in-store branch, the three results, the modal and
 * the read-only summaries — stays compiled and type-checked, so it cannot rot
 * while it waits.
 *
 * Off, step 3 is exactly what it was before any of it existed: mailing address,
 * licence and additional information all on the page, and Get Access grants
 * access. Flip to `true` to bring it back; nothing else has to change.
 */
const IDV_ENABLED = false;

const IDV_SOURCE = {
  mailing: {
    line: '4920 Campus Drive Suite B, Newport Beach, CA 92660',
    address: '4920 Campus Drive Suite B',
    city: 'Newport Beach',
    state: 'CA',
    zip: '92660',
  },
  licence: {
    number: 'DL7833839393',
    state: 'CA',
    stateLabel: 'California',
    exp: '09/20/2035',
    expLabel: 'Sep 20, 2035',
  },
};

export interface SuccessDetails {
  driverLicense?: string;
  /** As typed, MM/DD/YYYY — the parent converts. */
  driverLicenseExp?: string;
  driverLicenseState?: string;
  mailingAddress?: { address: string; city?: string; state?: string; zip?: string };
  /** Did the shopper actually get through ID verification? Only a `complete`
   *  result counts — ignoring the card, choosing the counter, failing, or
   *  deferring all leave them without a verified ID, and so without a code. */
  idVerified: boolean;
}

export function SuccessStep({ onGetAccess, chosen }: {
  /** Fires with everything the contact update can file. The parent decides
   *  what to do with it; this screen just collects. */
  onGetAccess?: (details?: SuccessDetails) => void;
  /** What the shopper ticked back in step 2. Those screens ask the QUESTION;
   *  this one asks for the details, so it opens the same sections already
   *  ticked rather than making them answer twice. */
  chosen?: { business?: boolean; military?: boolean; altContact?: boolean; vehicle?: boolean };
}) {
  // Initialisers, not synced props: the boxes stay the shopper's to change here.
  const [business, setBusiness] = useState(chosen?.business ?? false);
  const [military, setMilitary] = useState(chosen?.military ?? false);
  const [altContact, setAltContact] = useState(chosen?.altContact ?? false);
  const [vehicle, setVehicle] = useState(chosen?.vehicle ?? false);

  // Mailing address — where notices go when it is not the space's address.
  // Filed on the contact as an Addresses entry of type "mailing" (verified
  // 2026-08-21: it persists).
  /**
   * ID verification. DUMMY — there is no verification service wired up yet; the
   * states and the transitions between them are here so the real one can be
   * dropped in behind them.
   *
   *   choose    the card with the illustration and the two buttons
   *   instore   "Verify ID In-Store" — hours, address, phone, and a way back
   *   complete / failed / later   the three results the service can return
   *
   * The detail sections below are shown only in `instore`, per the brief. Their
   * VALUES live in this component either way, so switching back and forth keeps
   * everything already typed — unmounting the markup does not touch the state.
   */
  const [idv, setIdv] = useState<'choose' | 'instore' | 'complete' | 'failed' | 'later'>('choose');
  const [idvModal, setIdvModal] = useState(false);
  /* A completed scan arrives pre-filled and collapsed to a summary; "Edit" is
     how the tenant overrides what the scan read off the card. One flag each,
     because the two boxes are independent in the frame. */
  const [mailEditing, setMailEditing] = useState(false);
  const [dlEditing, setDlEditing] = useState(false);
  /* The two detail groups belong to every state that has to collect them:
     in-store (the counter needs them), complete (the scan supplies them, and
     they can be overridden) and failed (nothing was captured, so they are typed
     by hand). Not `choose` or `later` — nothing has been decided yet. */
  // Off, the two groups are simply always on the page — there is no branch
  // left to decide otherwise.
  const detailsShown = !IDV_ENABLED || idv === 'instore' || idv === 'complete' || idv === 'failed';
  const mailReadOnly = idv === 'complete' && !mailEditing;
  const dlReadOnly = idv === 'complete' && !dlEditing;

  const [mailAddress, setMailAddress] = useState('');
  const [mailCity, setMailCity] = useState('');
  const [mailState, setMailState] = useState('');
  const [mailZip, setMailZip] = useState('');

  // Driver's licence. THESE are what "ID verification" means to this API —
  // there is no verification service, only these three fields on the contact,
  // and all three persist.
  const [dlNumber, setDlNumber] = useState('');
  const [dlExp, setDlExp] = useState('');
  const [dlState, setDlState] = useState('');

  /** A picked or typed mailing address — the city/state/ZIP follow it. */
  const [mailPicked, setMailPicked] = useState(false);
  const [attemptedReveal, setAttemptedReveal] = useState(false);
  /* Revealed by the lookup, by content already in them, or by a failed submit.
     That last one matters now they are REQUIRED: an address typed straight into
     the box without choosing a suggestion leaves `mailPicked` false, so without
     it the three fields would be demanded while still hidden. */
  const showMailParts = mailPicked
    || !!(mailCity.trim() || mailState.trim() || mailZip.trim())
    || (attemptedReveal && !!mailAddress.trim());

  // Business
  const [bizAddress, setBizAddress] = useState('');
  const [repFirst, setRepFirst] = useState('');
  const [repLast, setRepLast] = useState('');
  // Military
  const [dob, setDob] = useState('');
  // Alternate contact
  const [altFirst, setAltFirst] = useState('');
  const [altLast, setAltLast] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [altEmail, setAltEmail] = useState('');
  const [altAddress, setAltAddress] = useState('');
  // Vehicle
  const [vType, setVType] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [colour, setColour] = useState('');
  const [plate, setPlate] = useState('');
  const [country, setCountry] = useState('');
  const [stateVal, setStateVal] = useState('');

  /**
   * Required fields, and only for the sections actually switched on — an
   * unticked section is not an incomplete one. Messages appear on the first
   * attempt to continue, not while typing: flagging a field the shopper has not
   * reached yet is noise, and this form can be twenty inputs long.
   */
  const [attempted, setAttempted] = useState(false);
  const filled = (v: string) => v.trim().length > 0;
  const problems: Record<string, string> = {
    // Only while the detail groups are mounted — a required field that is not
    // on screen produces a message nobody can act on.
    ...(detailsShown ? {
      mailAddress: filled(mailAddress) ? '' : 'Enter your mailing address',
      // Keyed off the ADDRESS, not off whether the three are on screen. Keying
      // it off visibility would read the pre-click render, where the reveal has
      // not happened yet, and let the first submit through.
      ...(filled(mailAddress) ? {
        mailCity: filled(mailCity) ? '' : 'Enter the city',
        mailState: mailState.trim().length === 2 ? '' : 'Enter the two-letter state',
        mailZip: mailZip.trim().length >= 5 ? '' : 'Enter a valid ZIP code',
      } : {}),
      /* The three Driver's Licence fields are OPTIONAL and deliberately absent
         from this map. Dropping their asterisks without dropping these would
         have left the submit blocked by fields no longer marked as needed —
         a dead button with nothing on screen explaining it. They are still
         sent when filled; see the payload below. */
    } : {}),
    ...(business ? {
      bizAddress: filled(bizAddress) ? '' : 'Enter the business address',
      repFirst: filled(repFirst) ? '' : 'Enter the business rep’s first name',
      repLast: filled(repLast) ? '' : 'Enter the business rep’s last name',
    } : {}),
    // The mask is MM/DD/YYYY, so a complete date is exactly ten characters —
    // "12/25/" is filled but not a date.
    ...(military ? { dob: dob.length === 10 ? '' : 'Enter a valid date of birth' } : {}),
    ...(altContact ? {
      altFirst: filled(altFirst) ? '' : 'Enter the alternate contact’s first name',
      altLast: filled(altLast) ? '' : 'Enter the alternate contact’s last name',
      altPhone: isPossiblePhone(altPhone, 'US') ? '' : 'Enter a valid phone number',
      altEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(altEmail.trim()) ? '' : 'Enter a valid email address',
      altAddress: filled(altAddress) ? '' : 'Enter the alternate contact’s address',
    } : {}),
    // Vehicle Type alone carries the asterisk in the frame; make, model, year,
    // colour, plate, country and state are all optional.
    ...(vehicle ? { vType: filled(vType) ? '' : 'Select a vehicle type' } : {}),
  };
  const bad = (k: string) => (attempted && problems[k] ? problems[k] : undefined);

  /**
   * Bumped on every FAILED attempt, not just the first, so pressing Get Access
   * again after fixing one field still takes you to the next one. A boolean
   * would only ever fire once.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const [failures, setFailures] = useState(0);

  /* Seed the fields from the scan whenever one completes. It OVERWRITES on
     purpose: the whole point of verification is that the card is the source of
     truth, and "Edit" is the documented way to disagree with it. Keyed on `idv`
     alone, so editing afterwards does not re-run it. */
  useEffect(() => {
    if (idv !== 'complete') return;
    setMailAddress(IDV_SOURCE.mailing.address);
    setMailCity(IDV_SOURCE.mailing.city);
    setMailState(IDV_SOURCE.mailing.state);
    setMailZip(IDV_SOURCE.mailing.zip);
    setMailPicked(true);
    setDlNumber(IDV_SOURCE.licence.number);
    setDlState(IDV_SOURCE.licence.state);
    setDlExp(IDV_SOURCE.licence.exp);
    setMailEditing(false);
    setDlEditing(false);
  }, [idv]);
  const submit = () => {
    setAttempted(true);
    setAttemptedReveal(true);
    if (Object.values(problems).some(Boolean)) { setFailures((n) => n + 1); return; }
    // Only what was filled — the update must not blank a value the tenant may
    // have given at the counter.
    onGetAccess?.({
      // Off, nothing is being verified, so nothing may be withheld for it —
      // the confirmation page must not claim verification is required.
      idVerified: !IDV_ENABLED || idv === 'complete',
      driverLicense: dlNumber.trim() || undefined,
      driverLicenseExp: dlExp.trim() || undefined,
      driverLicenseState: dlState.trim() || undefined,
      mailingAddress: mailAddress.trim()
        ? {
          address: mailAddress.trim(),
          city: mailCity.trim() || undefined,
          state: mailState.trim() || undefined,
          zip: mailZip.trim() || undefined,
        }
        : undefined,
    });
  };

  /**
   * Take the shopper to the topmost error. Without this the button appears dead
   * whenever the first missing field is above the fold — the messages render,
   * just nowhere they can see.
   *
   * A LAYOUT effect: it has to run after React has painted the error state,
   * because the element being looked for does not exist until then.
   * `querySelector` returns the first match in DOM order, which in a single
   * column is the highest on the page. Centred rather than aligned to the top,
   * so the sticky header cannot land on top of the field it just scrolled to.
   */
  useLayoutEffect(() => {
    if (!failures) return;
    const first = rootRef.current?.querySelector('.hb-field--error');
    if (!first) return;
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    first.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }, [failures]);

  return (
    <div className="rf-card rf-sx" ref={rootRef}>
      {/* Step 2's own title elements, not a near-copy: .rf-eyebrow is 36px/600
          in the Duda primary, .rf-heading 36px/600 hardcoded black, both with
          Montserrat and the host-proofing specificity pinned in one place. The
          .rf-sx-* pair this replaces had drifted to 30px and --hb-secondary. */}
      <div className="rf-title">
        <p className="rf-eyebrow">You&rsquo;ve got your space!</p>
        <h2 className="rf-heading">Finish up below for access</h2>
      </div>

      {/* ID VERIFICATION.
          Un-parked from the comment Jaweed left on 2026-08-21, whose reasoning
          still stands: the rental flow API has no verification endpoint, so
          nothing here talks to anything. It is a DUMMY FLOW, built so the real
          service can be wired to `idv` and the modal without redesigning. What
          the contact record actually stores — driver_license / _exp / _state —
          is still collected by the Driver's Licence group below. */}
      {IDV_ENABLED && idv === 'choose' && (
        <section className="rf-sx-idv">
          <h3 className="rf-sx-idv-title">ID Verification</h3>
          <div className="rf-sx-idv-body">
            <IdIllustration />
            <div className="rf-sx-idv-actions">
              <button type="button" className="rf-sx-btn rf-sx-btn--solid" onClick={() => setIdvModal(true)}>
                Verify ID Now
              </button>
              <button type="button" className="rf-sx-btn rf-sx-btn--outline" onClick={() => setIdv('instore')}>
                Verify In-Store
              </button>
            </div>
          </div>
          <p className="rf-sx-idv-note">
            Get ready to take a photo of your ID and a Selfie.{' '}
            <a href="#pop-ups" onClick={(e) => e.preventDefault()}>Click here to see how to enable pop-ups</a>{' '}
            if the link you received did not open the the ID Verification tool.
          </p>
        </section>
      )}

      {/* Figma 10080-26478. Two columns: what to bring and where to bring it on
          the left, the way back on the right.

          The hours and the phone number are the FRAME'S placeholders, not this
          property's — SuccessStep is not passed the property, and the record
          separates access hours from office hours, so picking one here would be
          a guess. Thread the real pair in when the verification work lands. */}
      {IDV_ENABLED && idv === 'instore' && (
        <section className="rf-sx-idv rf-sx-idv--instore">
          <div className="rf-sx-idv-instore-main">
            <h3 className="rf-sx-idv-title rf-sx-idv-title--tick">
              <TickSingleIcon size={24} className="rf-sx-idv-tick" />
              Verify ID In-Store
            </h3>
            <p className="rf-sx-idv-lede">Bring in your ID upon move-in or call the store to get access.</p>
            <div className="rf-sx-idv-row">
              <ClockGlyph size={24} className="rf-sx-idv-ico" />
              <div>
                <p className="rf-sx-idv-strong">Office Hours</p>
                <p className="rf-sx-idv-line">Mon-Sat: 8:00 AM - 5:00 PM</p>
                <p className="rf-sx-idv-line">Sun: 10:00 AM - 3:00 PM</p>
              </div>
            </div>
            <div className="rf-sx-idv-row rf-sx-idv-row--mid">
              <PhoneGlyph size={24} className="rf-sx-idv-ico" />
              <a className="rf-sx-idv-link" href="tel:8776577465">(877) 657-7465</a>
            </div>
          </div>
          <div className="rf-sx-idv-instore-aside">
            <p className="rf-sx-idv-strong">Changed your mind?</p>
            {/* Two-line label (Figma 11940-47763, whose text is the sibling
                11940-47764 drawn over it): a regular lede above the bold
                action. Both lines are the button's own content, not a caption
                beside it — the green CTA is 286x49 and the text box sits
                inside it. */}
            <button
              type="button"
              className="rf-sx-btn rf-sx-btn--solid rf-sx-btn--stack"
              onClick={() => { setIdv('choose'); setIdvModal(true); }}
            >
              <span className="rf-sx-btn-lede">Save time and skip the office!</span>
              <span className="rf-sx-btn-main">Verify ID Now</span>
            </button>
          </div>
        </section>
      )}

      {/* The three results a verification can end in (Figma 8507-24189 /
          8507-24120 / 8507-24130). Reachable from the modal today so the flow
          can be walked through; the real service sets `idv` instead. */}
      {IDV_ENABLED && idv === 'complete' && (
        <section className="rf-sx-idv rf-sx-idv--done">
          <h3 className="rf-sx-idv-title rf-sx-idv-title--tick">
            <TickSingleIcon size={24} className="rf-sx-idv-tick" />
            ID Verification Complete
          </h3>
        </section>
      )}

      {IDV_ENABLED && idv === 'failed' && (
        <section className="rf-sx-idv rf-sx-idv--alert">
          <h3 className="rf-sx-idv-title rf-sx-idv-title--tick">
            <AlertTriangleIcon size={24} className="rf-sx-idv-alert" />
            ID Verification Failed
          </h3>
          <p className="rf-sx-idv-lede">
            Your ID must be verified before getting access. Please reverify your ID or contact us to
            get access (949) 546-7465.{' '}
            <button
              type="button"
              className="rf-sx-idv-inline"
              onClick={() => { setIdv('choose'); setIdvModal(true); }}
            >
              Reverify ID
            </button>
          </p>
        </section>
      )}

      {IDV_ENABLED && idv === 'later' && (
        <section className="rf-sx-idv rf-sx-idv--alert">
          <h3 className="rf-sx-idv-title rf-sx-idv-title--tick">
            <AlertTriangleIcon size={24} className="rf-sx-idv-alert" />
            Verify ID Later
          </h3>
          <p className="rf-sx-idv-lede">
            <b className="rf-sx-idv-danger">ID Verification is required to get access to your space.</b>{' '}
            Please contact us to complete the verification.<br />
            Changed your mind?{' '}
            <button
              type="button"
              className="rf-sx-idv-inline"
              onClick={() => { setIdv('choose'); setIdvModal(true); }}
            >
              Verify ID Now
            </button>
          </p>
        </section>
      )}


      {/* Mailing address and licence, in whichever form the current state calls
          for. Additional Information is NOT in here: Figma 8507-25408 has it on
          the page from the start.

          UNMOUNTED, not hidden — but every value they edit is state on this
          component, so switching back and forth keeps whatever was typed. */}
      {detailsShown && (
        <>
        {IDV_ENABLED && idv === 'complete' && (
          <p className="rf-sx-idv-current">
            For the purpose of important notifications, please make sure the address captured from
            your license is current.
          </p>
        )}

        {/* Mailing address first: it is the one most tenants will fill, and the
            licence group reads as a follow-up rather than a gate. */}
        <section className="rf-sx-extra">
          <h3 className="rf-sx-extra-title">Mailing Address</h3>
          {mailReadOnly ? (
            <div className="rf-sx-readout">
              <p className="rf-sx-readout-val">{IDV_SOURCE.mailing.line}</p>
              <button type="button" className="rf-sx-edit" onClick={() => setMailEditing(true)}>Edit</button>
            </div>
          ) : (
          <div className="rf-sx-fields">
            <AddressAutocomplete
              country={CUSTOMER_ADDRESS_COUNTRIES}
              value={mailAddress}
              onChange={setMailAddress}
              onPick={(place) => {
                if (place.address.city) setMailCity(place.address.city);
                if (place.address.stateCode) setMailState(place.address.stateCode);
                if (place.address.zip) setMailZip(place.address.zip);
                setMailPicked(true);
              }}
            >
              <FormField label="Mailing Address" required type="search" value={mailAddress} onChange={setMailAddress} autoComplete="street-address" state={mailAddress.trim() ? 'success' : 'default'} error={bad('mailAddress')} />
            </AddressAutocomplete>
            {/* City, state and ZIP appear once the lookup has filled them, if
                anything is already in them, or on a failed submit. They are
                required as soon as there IS an address — a street on its own is
                not one the counter can post to. */}
            {showMailParts && (
              <>
                {/* One row of three, sharing .rf-sx-grid3 with the licence
                    row above — ZIP used to sit on a line of its own under a
                    50/50 City/State pair. Collapses to one column at the same
                    widths that row does. */}
                <div className="rf-sx-grid3">
                  <FormField label="City" required value={mailCity} onChange={setMailCity} autoComplete="address-level2" state={mailCity.trim() ? 'success' : 'default'} error={bad('mailCity')} />
                  <FormField label="State" required value={mailState} onChange={(v) => setMailState(v.toUpperCase().slice(0, 2))} autoComplete="address-level1" state={mailState.trim().length === 2 ? 'success' : 'default'} error={bad('mailState')} />
                  <FormField label="ZIP Code" required value={mailZip} onChange={setMailZip} autoComplete="postal-code" state={mailZip.trim().length >= 5 ? 'success' : 'default'} error={bad('mailZip')} />
                </div>
              </>
            )}
          </div>
          )}
        </section>

        {/* Figma 10078-25737 — three equal columns, all three required. */}
        <section className="rf-sx-extra">
          <h3 className="rf-sx-extra-title">Driver&rsquo;s Licence</h3>
          {dlReadOnly ? (
            <div className="rf-sx-readout">
              {/* Three lines, as the frame has them — and the app's own wording:
                  the full state name and a written-out date, neither of which the
                  two inputs behind this hold. */}
              <p className="rf-sx-readout-val">
                {IDV_SOURCE.licence.number}<br />
                {IDV_SOURCE.licence.stateLabel}<br />
                {IDV_SOURCE.licence.expLabel}
              </p>
              <button type="button" className="rf-sx-edit" onClick={() => setDlEditing(true)}>Edit</button>
            </div>
          ) : (
          <div className="rf-sx-fields">
            <div className="rf-sx-grid3">
              <FormField
                label="License Number"
                value={dlNumber}
                onChange={setDlNumber}
                autoComplete="off"
                state={dlNumber.trim() ? 'success' : 'default'}
              />
              {/* A text box, not the frame's dropdown: the record stores a
                  two-letter code, and no canonical state+province list exists
                  in the widget to populate a <Select> with. */}
              <FormField
                label="State/Province"
                value={dlState}
                onChange={(v) => setDlState(v.toUpperCase().slice(0, 2))}
                state={dlState.trim().length === 2 ? 'success' : 'default'}
              />
              {/* Typed, not a picker. An expiry is read straight off the card in
                  the shopper's hand — eight digits is quicker than browsing to a
                  date they can already see, and it is the same control the Date
                  of Birth field above uses. The kit's mask rests as the label
                  and reveals MM/DD/YYYY on focus. */}
              <FormField
                label="Expiration Date"
                mask="date"
                value={dlExp}
                onChange={setDlExp}
                autoComplete="off"
                state={dlExp.length === 10 ? 'success' : 'default'}
              />
            </div>
          </div>
          )}
        </section>
        </>
      )}

      <section className="rf-sx-extra">
        <h3 className="rf-sx-extra-title">Additional Information</h3>

        {/* .rf2-checks is step 2's column — reused rather than matched by eye,
            so the 4px pitch between checkboxes cannot drift apart again. */}
        <div className="rf2-checks">
        {/* Business is the one section that does NOT reappear here unasked.
            `chosen.business` is what step 2 was told, and if the answer was no
            then it has been answered — re-offering it invites a shopper to
            reclassify their rental after the lease is signed, which the other
            three sections cannot do. Ticked in step 2, the row is here so the
            rep's details can be filled in. */}
        {chosen?.business && (
        <div className="rf-sx-group">
          <Checkbox checked={business} onChange={setBusiness}>I am renting as a business</Checkbox>
          {business && (
            <div className="rf-sx-fields">
              <AddressAutocomplete country={CUSTOMER_ADDRESS_COUNTRIES} value={bizAddress} onChange={setBizAddress}>
                <FormField label="Business Address" required type="search" value={bizAddress} onChange={setBizAddress} error={bad('bizAddress')} />
              </AddressAutocomplete>
              <div className="rf-pay-grid">
                <FormField label="Business Rep First Name" required value={repFirst} onChange={setRepFirst} error={bad('repFirst')} />
                <FormField label="Business Rep Last Name" required value={repLast} onChange={setRepLast} error={bad('repLast')} />
              </div>
            </div>
          )}
        </div>
        )}

        <div className="rf-sx-group">
          <Checkbox checked={military} onChange={setMilitary}>I am active military</Checkbox>
          {military && (
            <div className="rf-sx-fields">
              {/* Typed mask, not a picker: scrolling a calendar back decades to a
                  birth year is slower than typing it. */}
              <FormField label="Date of Birth" required mask="date" value={dob} onChange={setDob} error={bad('dob')} />
            </div>
          )}
        </div>

        <div className="rf-sx-group">
          <Checkbox checked={altContact} onChange={setAltContact}>I want to provide an alternate contact</Checkbox>
          {altContact && (
            <div className="rf-sx-fields">
              <div className="rf-pay-grid">
                <FormField label="First Name" required value={altFirst} onChange={setAltFirst} error={bad('altFirst')} />
                <FormField label="Last Name" required value={altLast} onChange={setAltLast} error={bad('altLast')} />
                <FormField label="Phone" required type="tel" value={altPhone} onChange={setAltPhone} error={bad('altPhone')} />
                <FormField label="Email" required type="email" value={altEmail} onChange={setAltEmail} error={bad('altEmail')} />
              </div>
              {/* Same lookup as the Business Address above it — this one was
                  left as a plain field when the others were wired. */}
              <AddressAutocomplete country={CUSTOMER_ADDRESS_COUNTRIES} value={altAddress} onChange={setAltAddress}>
                <FormField label="Address" required type="search" value={altAddress} onChange={setAltAddress} error={bad('altAddress')} />
              </AddressAutocomplete>
            </div>
          )}
        </div>

        <div className="rf-sx-group">
          <Checkbox checked={vehicle} onChange={setVehicle}>I am storing a vehicle</Checkbox>
          {vehicle && (
            <div className="rf-sx-fields">
              <Select
                label="Vehicle Type" required value={vType} onChange={setVType}
                options={['Car', 'Motorcycle', 'RV', 'Boat', 'Trailer']}
                error={bad('vType')}
              />
              <div className="rf-pay-grid">
                {/* Make/Model/Year/Colour/Plate are NOT required in the frame —
                    only Vehicle Type carries the asterisk. */}
                <FormField label="Make" value={make} onChange={setMake} />
                <FormField label="Model" value={model} onChange={setModel} />
                <FormField label="Year" value={year} onChange={setYear} />
                <FormField label="Color" value={colour} onChange={setColour} />
                <FormField label="License Plate Number" value={plate} onChange={setPlate} />
                <Select label="Country" value={country} onChange={setCountry} options={['United States', 'Canada']} />
              </div>
              <Select label="State" value={stateVal} onChange={setStateVal} options={['California', 'Arizona', 'Nevada', 'Texas']} />
            </div>
          )}
        </div>
        </div>
      </section>

      <button type="button" className="rf-sx-access" onClick={submit}>Get Access</button>

      {IDV_ENABLED && (
      <IdVerifyModal
        open={idvModal}
        onClose={() => setIdvModal(false)}
        onResult={setIdv}
      />
      )}
    </div>
  );
}
