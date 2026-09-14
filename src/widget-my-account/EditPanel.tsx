// ===========================================================================
// The Edit panel — Figma 9038-81963. Opened by "Edit" on the Account Info
// panel, and it replaces that panel in place (same card slot, same width).
//
// Four sections under the space heading:
//   Mailing Address           country + address, then city / state / ZIP
//   Drivers Licence           a "Verify ID" link and a passport alternative,
//                             then number / state / expiry
//   Communication Preferences the two marketing opt-ins
//   Additional Contacts       the alternate contact and the emergency contact,
//                             the same nine fields each
// …then a tinted action bar with Cancel and an orange Save.
//
// WHAT THE EARLIER FRAME (8815-115876) HAD AND THIS ONE DOES NOT: the tinted
// "Account Settings" block (email, mobile, Change Password) is gone, and so is
// the "I am providing an alternate contact" toggle — the alternate contact is
// now always shown, beside a second, emergency one. The standalone address
// LOOKUP fields are gone too; the address line itself carries the search
// affordance now.
//
// EVERY field is the shared kit's <FormField>. The frame's ".Form 2.0"
// component IS the kit's field — same 56px box, same 8px radius, same floating
// label with a red required marker, and its green "filled" state is the kit's
// `state="success"`, which draws --hb-ada-green and the tick. Nothing here
// re-implements an input.
//
// STATE IS A PICKER WHEN THE COUNTRY IS THE UNITED STATES, and a text box
// otherwise. There is no canonical list for "everywhere else" — Canada's
// provinces are not in the shared table — so a country we cannot enumerate
// keeps the free-text field rather than being given a list that is missing
// its own entries.
//
// The address fields render as `type="search"`, matching the frame's magnifier.
// They are NOT wired to @shared/AddressAutocomplete: every figure on this
// screen is static demo content, and a demo panel should not be firing Places
// lookups at a live proxy. Wrapping each in <AddressAutocomplete> is the
// one-component change when the panel gets real data.
// ===========================================================================

import { useState } from 'react';
import { Checkbox, FormField } from '@shared/ui';
import { ChevronBigRight24Icon } from './icons';
import { US_STATES, isKnownState, stateCodeFromName, stateNameFromCode } from '@shared/usStates';
import { EDIT_COUNTRIES, EDIT_DEFAULTS } from './data';
import type { AccountSpace, ContactForm, EditForm } from './data';

interface Option { value: string; label: string }

const COUNTRY_OPTIONS: Option[] = EDIT_COUNTRIES.map((c) => ({ value: c, label: c }));

/* The addresses store the CODE and the frame prints it ("CA"); the licence
   stores the NAME and the frame prints that ("California"). The picker lists
   full names either way — a menu of fifty two-letter codes is unreadable —
   so the two differ only in what a choice puts back in the field. */
const STATE_OPTIONS_BY_CODE: Option[] = US_STATES.map((s) => ({ value: s.code, label: s.name }));
const STATE_OPTIONS_BY_NAME: Option[] = US_STATES.map((s) => ({ value: s.name, label: s.name }));

/** Only the US has a list here — see the header note. */
const isUS = (country: string) => country.trim() === 'United States';

/**
 * The state value to carry across a country change.
 *
 * Switching INTO the US turns the field into a picker, and a value that picker
 * cannot contain would leave the box showing one thing and the menu another —
 * so an unrecognised state is dropped rather than displayed as a choice that
 * was never made. A recognised one is converted to the form this field stores.
 * Leaving the US keeps whatever was there: free text can hold anything.
 */
function stateForCountry(country: string, current: string, form: 'code' | 'name'): string {
  if (!isUS(country)) return current;
  if (!isKnownState(current)) return '';
  return form === 'code' ? stateCodeFromName(stateNameFromCode(current)) : stateNameFromCode(current);
}

/* The frame draws every filled field green. That is the kit's success state,
   which means "this validated" — so it is derived from the value rather than
   hardcoded, and a field the tenant empties drops back to its resting look
   instead of staying green while blank. */
const filled = (v: string) => (v.trim() ? 'success' as const : 'default' as const);

/**
 * A country picker wearing the kit's field.
 *
 * The real <select> sits transparent on top so the native picker — and the
 * mobile wheel — still does the work; the box underneath is a genuine
 * <FormField>, so the height, radius, border and floating label can never
 * drift from the fields beside it. This is the same overlay #99 uses for its
 * billing country, for the same reason.
 *
 * `state` is deliberately NOT forwarded to the face: the kit draws a tick for
 * success, which would land on top of the chevron. The frame shows the valid
 * look as the green border alone, so that is what `valid` does.
 */
function SelectField({
  label, value, onChange, options, required, valid, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  required?: boolean;
  valid?: boolean;
  /** Shown while nothing is chosen. Absent once a choice exists, so it can
   *  never be picked back. */
  placeholder?: string;
}) {
  return (
    <div className="ma-select">
      <label className="ma-select__native">
        <span className="ma-sr-only">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
          {!value && placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <div className="ma-select__face" aria-hidden="true">
        <FormField
          label={label}
          required={required}
          value={value}
          onChange={() => {}}
          className={valid ? 'ma-edit__valid' : undefined}
        />
        <ChevronBigRight24Icon className="ma-select__chev" />
      </div>
    </div>
  );
}

/**
 * State — a picker in the US, a text box everywhere else.
 *
 * Both render the kit's field, so the row keeps its shape whichever is on
 * screen; only the control behind it changes.
 */
function StateField({
  country, value, onChange, form,
}: {
  country: string;
  value: string;
  onChange: (v: string) => void;
  /** Whether a choice stores "CA" or "California" — see the option lists. */
  form: 'code' | 'name';
}) {
  if (isUS(country)) {
    return (
      <SelectField
        label="State"
        required
        placeholder="Select State"
        options={form === 'code' ? STATE_OPTIONS_BY_CODE : STATE_OPTIONS_BY_NAME}
        value={value}
        onChange={onChange}
        valid={Boolean(value)}
      />
    );
  }
  return (
    <FormField
      label="State" required value={value} onChange={onChange}
      state={filled(value)} autoComplete="address-level1"
    />
  );
}

/**
 * One contact's nine fields. The alternate and the emergency contact are the
 * same shape in the frame, so they are the same component — a second copy
 * would only be a place for the two to drift apart.
 */
function ContactFields({
  title, contact, onChange,
}: {
  title: string;
  contact: ContactForm;
  onChange: (next: ContactForm) => void;
}) {
  const set = <K extends keyof ContactForm>(key: K) => (v: ContactForm[K]) =>
    onChange({ ...contact, [key]: v });

  return (
    <div className="ma-edit__contact">
      <h4 className="ma-edit__sub">{title}</h4>

      <div className="ma-edit__row">
        <FormField
          label="First Name" required value={contact.first} onChange={set('first')}
          state={filled(contact.first)} autoComplete="given-name"
        />
        <FormField
          label="Last Name" required value={contact.last} onChange={set('last')}
          state={filled(contact.last)} autoComplete="family-name"
        />
      </div>

      <div className="ma-edit__row">
        <FormField
          label="Email" type="email" required value={contact.email} onChange={set('email')}
          state={filled(contact.email)}
        />
        <FormField
          label="Phone" type="tel" required value={contact.phone} onChange={set('phone')}
          state={filled(contact.phone)}
        />
      </div>

      <div className="ma-edit__row ma-edit__row--wide">
        <SelectField
          label="Country" required options={COUNTRY_OPTIONS}
          value={contact.country}
          /* Country and state move together: changing one can invalidate the
             other, so they are written in a single update. */
          onChange={(c) => onChange({
            ...contact, country: c, state: stateForCountry(c, contact.state, 'code'),
          })}
          valid={Boolean(contact.country)}
        />
        {/* Search, not success: the magnifier IS this field's icon in the
            frame, and a tick would sit where it already is. */}
        <FormField
          label="Address" type="search" required
          value={contact.address} onChange={set('address')}
          className={contact.address.trim() ? 'ma-edit__valid' : undefined}
          autoComplete="street-address"
        />
      </div>

      <div className="ma-edit__row ma-edit__row--thirds">
        <FormField
          label="City" required value={contact.city} onChange={set('city')}
          state={filled(contact.city)} autoComplete="address-level2"
        />
        <StateField
          country={contact.country} value={contact.state} onChange={set('state')} form="code"
        />
        <FormField
          label="ZIP" required value={contact.zip} onChange={set('zip')}
          state={filled(contact.zip)} autoComplete="postal-code"
        />
      </div>

      <Checkbox
        checked={contact.applyToAll}
        onChange={set('applyToAll')}
        className="ma-edit__check"
      >
        Apply change to all spaces
      </Checkbox>
    </div>
  );
}

export function EditPanel({
  space,
  onCancel,
  onSave,
}: {
  space: AccountSpace;
  onCancel: () => void;
  /** Nothing is persisted yet — the parent just returns to the display panel. */
  onSave: (form: EditForm) => void;
}) {
  const [form, setForm] = useState<EditForm>(EDIT_DEFAULTS);
  const set = <K extends keyof EditForm>(key: K) => (v: EditForm[K]) =>
    setForm((f) => ({ ...f, [key]: v }));

  return (
    <section className="ma-edit">
      <div className="ma-edit__body">
        <h2 className="ma-edit__title">{space.title}</h2>

        {/* ── Mailing Address ──────────────────────────────────────────── */}
        <div className="ma-edit__section">
          <h3 className="ma-edit__label">Mailing Address</h3>

          <div className="ma-edit__row ma-edit__row--wide">
            <SelectField
              label="Country" required options={COUNTRY_OPTIONS}
              value={form.country}
              /* The licence state follows this country too — see its row. */
              onChange={(c) => setForm((f) => ({
                ...f,
                country: c,
                state: stateForCountry(c, f.state, 'code'),
                licenceState: stateForCountry(c, f.licenceState, 'name'),
              }))}
              valid={Boolean(form.country)}
            />
            <FormField
              label="Address" type="search" required
              value={form.address} onChange={set('address')}
              className={form.address.trim() ? 'ma-edit__valid' : undefined}
              autoComplete="street-address"
            />
          </div>

          <div className="ma-edit__row ma-edit__row--thirds">
            <FormField
              label="City" required value={form.city} onChange={set('city')}
              state={filled(form.city)} autoComplete="address-level2"
            />
            <StateField
              country={form.country} value={form.state} onChange={set('state')} form="code"
            />
            <FormField
              label="ZIP" required value={form.zip} onChange={set('zip')}
              state={filled(form.zip)} autoComplete="postal-code"
            />
          </div>
        </div>

        {/* ── Drivers Licence ──────────────────────────────────────────── */}
        <div className="ma-edit__section">
          {/* Heading, the verify link and the passport alternative share one
              line in the frame, the checkbox pushed to the far right. */}
          <div className="ma-edit__head">
            <h3 className="ma-edit__label">Drivers Licence</h3>
            {/* No ID flow behind this yet, so it is a button that goes nowhere
                rather than a link to a page that does not exist. */}
            <button type="button" className="ma-edit__verify">Verify ID</button>
            <Checkbox
              checked={form.usePassport}
              onChange={set('usePassport')}
              className="ma-edit__check ma-edit__headCheck"
            >
              Use passport for ID
            </Checkbox>
          </div>

          <div className="ma-edit__row ma-edit__row--thirds">
            <FormField
              label="License Number" required
              value={form.licenceNumber} onChange={set('licenceNumber')}
              state={filled(form.licenceNumber)}
            />
            {/* The licence row has no country of its own, so it follows the
                mailing address's — the only country on the form that could
                describe the holder. A US address therefore gets the picker
                here too, rather than one State field on the screen staying
                free text while the other three became menus. */}
            <StateField
              country={form.country} value={form.licenceState}
              onChange={set('licenceState')} form="name"
            />
            {/* Typed, not picked: scrolling a picker back to a birth year or
                forward to an expiry is slower than typing it, which is why the
                kit carries this mask at all. */}
            <FormField
              label="Expiration Date" required mask="date"
              value={form.licenceExpiry} onChange={set('licenceExpiry')}
              state={filled(form.licenceExpiry)}
              className="ma-edit__nocal"
            />
          </div>
        </div>

        {/* ── Communication Preferences ────────────────────────────────── */}
        <div className="ma-edit__section">
          <h3 className="ma-edit__label">Communication Preferences</h3>

          <div className="ma-edit__prefs">
            {/* "occational" is the frame's spelling, kept verbatim like every
                other string on this screen. */}
            <Checkbox
              checked={form.marketingEmails}
              onChange={set('marketingEmails')}
              className="ma-edit__check"
            >
              I agree to receive occational marketing emails
            </Checkbox>
            <Checkbox
              checked={form.textMessages}
              onChange={set('textMessages')}
              className="ma-edit__check"
            >
              I agree to receive text messages regarding this space
            </Checkbox>
          </div>
        </div>

        {/* ── Additional Contacts ──────────────────────────────────────── */}
        <div className="ma-edit__section">
          <h3 className="ma-edit__label">Additional Contacts</h3>

          <ContactFields
            title="Alternate Contact"
            contact={form.alternate}
            onChange={set('alternate')}
          />
          <ContactFields
            title="Emergency Contact"
            contact={form.emergency}
            onChange={set('emergency')}
          />
        </div>
      </div>

      {/* ── Action bar ───────────────────────────────────────────────────
          Cancel is drawn as plain bold text, not a button box — but it IS a
          button, so it focuses and activates from the keyboard. */}
      <div className="ma-edit__actions">
        <button type="button" className="ma-edit__cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="ma-paynow" onClick={() => onSave(form)}>Save</button>
      </div>
    </section>
  );
}
