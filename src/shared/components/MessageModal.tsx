import React, { useEffect, useState } from 'react';
import { Checkbox } from '@shared/ui/Checkbox';
import { FormField, type FieldType } from '@shared/ui/FormField';
import { isPossiblePhone } from '@shared/ui/phone';
import { CloseCircleIcon } from '@shared/ui/icons';
import type { LeadInput } from '@shared/leadsApi';
import './MessageModal.css';

// ---------------------------------------------------------------------------
// "Send us a Message" lightbox (Figma 10199-60873 / 10199-67707).
//
// SHARED between #03 property-info and #05 space-list. #05 used to carry a
// "faithful clone" of #03's, which is exactly how it ended up two revisions
// behind — bespoke inputs, a hand-rolled checkbox and the old close mark, while
// #03 moved to the kit. One component means that cannot happen a third time.
//
// The lead call is INJECTED. Each widget files against its own company and
// property with its own key, so the creds cannot live here; `submitLead` is
// whatever that widget's createLead already is.
//
// Class names keep the `pi-msg-` prefix. Renaming 69 rules across a widget that
// is live, with no way to check the result in a browser, is a worse trade than
// a prefix that reads as property-info's. The stylesheet moved with the
// component, so it is at least no longer property-info's to own.
// ---------------------------------------------------------------------------

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/* Copied from #03's icons.tsx rather than imported: those three are used by
   PropertyInfo itself as well, so they cannot move, and a shared component
   reaching into a widget's folder is the wrong direction of dependency. */
function MapPinIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M12.0004 13.7105C13.6137 13.7105 14.9215 12.4027 14.9215 10.7895C14.9215 9.17622 13.6137 7.86842 12.0004 7.86842C10.3872 7.86842 9.07936 9.17622 9.07936 10.7895C9.07936 12.4027 10.3872 13.7105 12.0004 13.7105Z" />
      <path d="M12.0004 21.5C13.9478 21.5 19.7899 17.3889 19.7899 11.2222C19.7899 5.05556 14.9215 3 12.0004 3C9.07936 3 4.21094 5.05556 4.21094 11.2222C4.21094 17.3889 10.053 21.5 12.0004 21.5Z" />
    </svg>
  );
}

function EnvelopeIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M21.8032 7.76159L16.295 11.2668C14.7385 12.2573 13.9602 12.7526 13.1238 12.9455C12.3843 13.1161 11.6157 13.1161 10.8762 12.9455C10.0398 12.7526 9.26153 12.2573 7.70499 11.2668L2.19678 7.76159M21.8032 7.76159C22 8.72189 22 10.006 22 12C22 14.8003 22 16.2004 21.455 17.27C20.9757 18.2108 20.2108 18.9757 19.27 19.455C18.2004 20 16.8003 20 14 20H10C7.19974 20 5.79961 20 4.73005 19.455C3.78924 18.9757 3.02433 18.2108 2.54497 17.27C2 16.2004 2 14.8003 2 12C2 10.006 2 8.72189 2.19678 7.76159M21.8032 7.76159C21.7237 7.37332 21.6119 7.03798 21.455 6.73005C20.9757 5.78924 20.2108 5.02433 19.27 4.54497C18.2004 4 16.8003 4 14 4H10C7.19974 4 5.79961 4 4.73005 4.54497C3.78924 5.02433 3.02433 5.78924 2.54497 6.73005C2.38807 7.03798 2.27634 7.37332 2.19678 7.76159" />
    </svg>
  );
}

export interface Facility {
  /** Property id where the list came from the API. Optional because a caller
      with only the page's own property has no id to give — see #03/#05. */
  id?: string;
  name: string;
  address?: string;
}

function ChevronDown({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9c1.577 2.181 3.423 4.137 5.49 5.817a.8.8 0 0 0 1.02 0C14.577 13.137 16.423 11.181 18 9" />
    </svg>
  );
}

/**
 * Text inputs are the SHARED FormField, so they behave exactly as the rental
 * flow's do: floating label driven by :placeholder-shown (so browser autofill
 * lifts it too), a border that follows the caret via :focus-within, and a
 * green border plus tick once the value validates.
 *
 * The bespoke .pi-msg-field this replaces had a JS-driven `--filled` class, a
 * static border that never acknowledged focus, and no validated state at all.
 *
 * Validation is derived from the field's TYPE, matching how Step 2 does it, so
 * the tick and any submit gate cannot disagree about what "valid" means.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({
  label, required, type = 'text', value, onChange, disabled,
}: {
  label: string; required?: boolean; type?: FieldType;
  value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  const valid = type === 'email'
    ? EMAIL_RE.test(value.trim())
    : type === 'tel'
      ? isPossiblePhone(value, 'US')
      : value.trim().length > 0;

  return (
    <FormField
      label={label}
      type={type}
      required={required}
      value={value}
      onChange={onChange}
      disabled={disabled}
      phoneCountry={type === 'tel' ? 'US' : undefined}
      state={valid ? 'success' : 'default'}
    />
  );
}

/**
 * The message box. The kit has no textarea, so this stays bespoke — but it
 * borrows the kit's tokens for its border, focus and valid states so it reads
 * as the same control family rather than a lookalike.
 */
function MessageBox({
  label, required, value, onChange, disabled,
}: {
  label: string; required?: boolean; value: string;
  onChange: (v: string) => void; disabled?: boolean;
}) {
  const filled = value.trim().length > 0;
  return (
    <label className={`pi-msg-area${filled ? ' pi-msg-area--valid' : ''}`}>
      {/* Input before label, and placeholder=" ", so the same
          :placeholder-shown rule the kit uses can float it. */}
      <textarea
        className="pi-msg-area-input"
        value={value}
        placeholder=" "
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="pi-msg-area-label">{label}{required && <span className="pi-req">*</span>}</span>
    </label>
  );
}

export function MessageModal({
  open, onClose, facilities, submitLead, termsHref = '#', defaultFacility = null,
}: {
  open: boolean;
  onClose: () => void;
  facilities: Facility[];
  /** The widget's own createLead — see the note at the top of this file. */
  submitLead: (input: LeadInput) => Promise<unknown>;
  termsHref?: string;
  /**
   * The property whose page this is, preselected on open. Both widgets that use
   * this modal sit ON a property, so asking the shopper to pick the one they
   * are already looking at is a step with one right answer.
   *
   * Explicit rather than "preselect facilities[0] when there is only one":
   * that would be an accident of list length, and would silently stop working
   * the moment a caller passes the full portfolio — which is precisely the
   * change most likely to come next.
   *
   * Clearing it is the shopper's call; Clear was already there and still is.
   */
  defaultFacility?: Facility | null;
}) {
  // Opens on the preselected property when the caller names one, otherwise on
  // the "Select Facility" dropdown (Figma 10199-60873); picking an option swaps
  // to the name + address state (Figma 10199-67707).
  const [selected, setSelected] = useState<Facility | null>(defaultFacility);
  const [listOpen, setListOpen] = useState(false);
  const [consent, setConsent] = useState(false);

  // Form values + submission state.
  const [form, setForm] = useState({ first: '', last: '', email: '', mobile: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const submitting = status === 'submitting';

  /* Reset the form each time the modal is opened — the property included, so a
     shopper who cleared it last time gets the page's own property back rather
     than an empty field they have to fill in again.
     Keyed on the NAME, not the object: the callers build `{name, address}`
     inline on every render, so depending on the object itself would re-run this
     on each one and wipe what the shopper had typed. */
  const defaultName = defaultFacility?.id ?? defaultFacility?.name;
  useEffect(() => {
    if (!open) return;
    setForm({ first: '', last: '', email: '', mobile: '', message: '' });
    setConsent(false);
    setStatus('idle');
    setError('');
    setSelected(defaultFacility ?? null);
    setListOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  async function handleSubmit() {
    setError('');
    const first = form.first.trim();
    const last = form.last.trim();
    const email = form.email.trim();
    const mobile = form.mobile.trim();
    const message = form.message.trim();

    if (!first || !last || !email || !mobile || !message) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (mobile.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid mobile number.');
      return;
    }
    if (!consent) {
      setError('Please agree to receive messages to continue.');
      return;
    }

    setStatus('submitting');
    try {
      await submitLead({ first, last, email, phone: mobile, message });
      setStatus('success');
    } catch (err) {
      console.error('[MessageModal] createLead error:', err);
      setStatus('error');
      setError('Sorry, we couldn’t send your message. Please try again.');
    }
  }

  if (!open) return null;

  const facilityName = selected?.name ?? 'STORAGE FACILITY';

  return (
    <div className="pi-msg-overlay" onMouseDown={onClose}>
      <div className="pi-msg-modal" role="dialog" aria-modal="true" aria-label="Send us a Message" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pi-msg-head">
          <span className="pi-msg-title"><EnvelopeIcon size={24} /><span>Send us a Message</span></span>
          {/* Filled disc: .pi-msg-modal is #fff. 32 desktop AND mobile — the
              box is 32px with no padding and has no mobile override, so one
              size serves both. Pinned in CSS too; see .pi-msg-close svg. */}
          <button type="button" className="pi-msg-close" aria-label="Close" onClick={onClose}><CloseCircleIcon size={32} /></button>
        </div>

        {status === 'success' ? (
          <div className="pi-msg-body">
            <div className="pi-msg-success">
              <span className="pi-msg-success-icon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#028a0c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6.5 9.5 17 4.5 12" /></svg>
              </span>
              <p className="pi-msg-success-title">Message sent!</p>
              <p className="pi-msg-success-text">Thanks for reaching out — a member of our team will be in touch shortly.</p>
              <button type="button" className="pi-msg-submit" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
        <div className="pi-msg-body">
          {/* Facility: dropdown (unselected) or name + address (selected) */}
          <div className="pi-msg-facility-area">
            {selected ? (
              <div className="pi-msg-facility">
                {/* Static, not a button (Figma 10295-76697). Making the whole
                    block clickable is what gave it a hover fill — and that fill
                    was the host's `button:hover`, since this rule never declared
                    one of its own. Clear is the control now. */}
                <div className="pi-msg-facility-info">
                  <span className="pi-msg-facility-name">{selected.name}</span>
                  {selected.address && (
                    <span className="pi-msg-facility-addr"><MapPinIcon size={24} /><span>{selected.address}</span></span>
                  )}
                </div>
                {/* Clear is the only control. Changing property is Clear then
                    pick from the dropdown — one route to a different facility
                    rather than two doing the same job, and it removes a button
                    that could only ever be shown or hidden depending on how many
                    facilities happened to have loaded. */}
                <div className="pi-msg-facility-actions">
                  <button
                    type="button"
                    className="pi-msg-facility-clear"
                    onClick={() => { setSelected(null); setListOpen(false); }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              /* Figma 10295-76823: a single "Select Property" field, no heading above it. */
              <button type="button" className="pi-msg-dd-btn" onClick={() => setListOpen((o) => !o)}>
                <span>Select Property</span>
                <ChevronDown size={24} />
              </button>
            )}
            {listOpen && facilities.length > 0 && (
              <ul className="pi-msg-dd-list">
                {/* Keyed on the id where there is one: two facilities CAN share
                    a name (a company with two "Storage Outlet - Chino" rows),
                    and a duplicate React key silently drops one from the list. */}
                {facilities.map((f) => (
                  <li key={f.id ?? f.name}>
                    <button type="button" onClick={() => { setSelected(f); setListOpen(false); }}>{f.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Gaps follow the design: 16px between the name/contact rows, 24px
              before the message box. */}
          <div className="pi-msg-form">
            <div className="pi-msg-rows">
              <div className="pi-msg-row">
                <Field label="First Name" required value={form.first} onChange={set('first')} disabled={submitting} />
                <Field label="Last Name" required value={form.last} onChange={set('last')} disabled={submitting} />
              </div>
              <div className="pi-msg-row">
                <Field label="Email" required type="email" value={form.email} onChange={set('email')} disabled={submitting} />
                <Field label="Mobile" required type="tel" value={form.mobile} onChange={set('mobile')} disabled={submitting} />
              </div>
            </div>
            <MessageBox label="Leave us a Message" required value={form.message} onChange={set('message')} disabled={submitting} />
          </div>
        </div>
        )}

        {status !== 'success' && (
        <div className="pi-msg-foot">
          {/* The shared kit's checkbox, so this matches every other one on the
              site. Imported from its own module rather than the @shared/ui
              barrel — that would drag in Button, FormField, SummaryRail and
              paymentIcons' ~39KB of data URIs for a single control. */}
          <Checkbox checked={consent} onChange={setConsent} className="pi-msg-consent">
            <span className="pi-msg-consent-text">
              By providing your phone number, you consent to receive informational text messages from {facilityName}.
              Message frequency varies. Message &amp; data rates may apply. Reply HELP for help or STOP to unsubscribe at any time.
            </span>
          </Checkbox>
          <a className="pi-msg-terms" href={termsHref}>Click to see our Terms and Privacy Policy</a>

          {error && <p className="pi-msg-error" role="alert">{error}</p>}

          <div className="pi-msg-actions">
            <div className="pi-msg-captcha" aria-hidden="true">
              <span className="pi-msg-captcha-box" />
              <span className="pi-msg-captcha-label">I&rsquo;m not a robot</span>
              <span className="pi-msg-captcha-brand">reCAPTCHA</span>
            </div>
            <div className="pi-msg-buttons">
              <button type="button" className="pi-msg-cancel" onClick={onClose} disabled={submitting}>Cancel</button>
              <button type="button" className="pi-msg-submit" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
