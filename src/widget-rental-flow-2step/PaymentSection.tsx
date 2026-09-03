// ===========================================================================
// Payment method selection — Figma nodes 10080-28749 (Pay by Bank) and
// 10080-30277 (Credit / Debit).
//
// Both frames are the same layout with one panel expanded: the chosen method
// becomes a bordered panel (2px --hb-cta) containing its form and its own
// "Pay Now $X" button, and the other collapses to a 2px dark outline button.
// So this is ONE component with `selected` state, not two screens.
//
// The fields are Figma's "Mariposa Form 2.0" — the same component the shared UI
// kit was built from (node 8215-19040/19107) — so they come from `@shared/ui`
// rather than being restyled here. That is why the borders, 56px height, floating
// label, red asterisk and green validated state all match without new CSS.
//
// The card-number row is the one exception: the design packs Card Number, MM/YY
// and CVV into a single bordered box, which no single FormField models, so it is
// composed by hand from the same tokens.
// ===========================================================================

import React, { useEffect, useId, useRef, useState } from 'react';
import { FormField, CheckIcon, AlertIcon } from '@shared/ui';
import { Shimmer } from '@shared/Shimmer';
import { AddressAutocomplete } from '@shared/AddressAutocomplete';
import { BankIcon, CreditCardIcon, CheckTick, InfoIcon } from './icons';
import { ChevronBig } from './planIcons';
import { mountHostedCard, type HostedCardHandle } from './gpHostedFields';

export type PayMethod = 'googlepay' | 'applepay' | 'card' | 'bank' | null;

/** Money as the design writes it: "Pay Now $120.00". */
const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * A select rendered as a FormField plus the chevron affordance. The design uses
 * the same box for selects and text inputs, distinguished only by the chevron,
 * so this keeps them visually identical by construction.
 */
/* ---------------------------------------------------------------------------
 * Validation (Figma 10080-28126: 1px #028a0c border + a check tick at 24px).
 *
 * Two success treatments, deliberately:
 *   ok()      — green border AND the tick. Plain text fields.
 *   okQuiet() — green border ONLY. For fields whose icon slot is already
 *               occupied: the location selects (chevron), and anything with an
 *               info or search affordance. Two icons in one slot is what put
 *               the "2 chevrons" on Billing Country.
 * ------------------------------------------------------------------------ */
const ok = (valid: boolean) => (valid ? 'success' as const : 'default' as const);
const okQuiet = (valid: boolean) => (valid ? 'rf-valid' : undefined);

const digits = (v: string) => v.replace(/\D/g, '');

/* Field lengths. Every onChange strips non-digits before it reaches state, so
   letters can never be typed into the row in the first place — there is no
   "invalid character" state to render because the character never lands. */
const CARD_DIGITS = 16;
const EXPIRY_DIGITS = 4;
const CVV_DIGITS = 3;
/** 13–19 digits covers every brand we accept; the row does not brand-detect. */
const validCard = (v: string) => digits(v).length === CARD_DIGITS;
const validCvv = (v: string) => digits(v).length === CVV_DIGITS;
const validRouting = (v: string) => digits(v).length === 9;
const filled = (v: string) => v.trim().length > 0;

/**
 * Why an expiry is unusable, or undefined when it is fine — a reason rather
 * than a bare boolean, so the row can say WHAT is wrong instead of only
 * turning red.
 *
 * Silent until all four digits are in: complaining that "08" is expired while
 * someone is still typing the year would be wrong on nearly every card.
 *
 * A card is valid THROUGH its printed month, so the current month passes and
 * only an earlier one fails. Two-digit years are read as 20xx, which is the
 * industry assumption — no card carries a 70-year expiry.
 */
function expiryError(v: string): string | undefined {
  const d = digits(v);
  if (d.length < EXPIRY_DIGITS) return undefined;
  const mm = Number(d.slice(0, 2));
  const yy = Number(d.slice(2));
  if (mm < 1 || mm > 12) return 'Enter a valid expiry month (01\u201312).';
  const now = new Date();
  const curYY = now.getFullYear() % 100;
  const curMM = now.getMonth() + 1;
  if (yy < curYY || (yy === curYY && mm < curMM)) {
    return 'Please check the expiry date on this card.';
  }
  return undefined;
}
const validExpiry = (v: string) => digits(v).length === EXPIRY_DIGITS && !expiryError(v);

function SelectField({
  label, value, onChange, options, required, state,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  state?: 'default' | 'success';
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
      {/* Presentational twin: shows the floating label + value in the exact form
          styling, while the real <select> above sits transparently over it so the
          native picker (and mobile wheel) still does the work. */}
      <div className="rf-select-face" aria-hidden="true">
        {/* state is NOT forwarded: the kit draws a check tick for 'success',
            which would land on top of the chevron below — that pair is what
            read as "two chevrons" on Billing Country. The valid look here is
            the green border alone, exactly as the frame has it (its Icons slot
            is empty). */}
        <FormField
          label={label}
          required={required}
          value={value}
          onChange={() => {}}
          className={state === 'success' ? 'rf-valid' : undefined}
        />
        <ChevronBig size={24} className="rf-select-chev" />
      </div>
    </div>
  );
}

/**
 * Skeleton stood in for a payment form while it "loads" — Figma 8507-24610.
 * The frame is grey blocks at `rgba(0,0,0,.08)` / 4px radius: a 24px heading
 * pair, then 50px field blocks two-up with 20px gaps. Built from the shared
 * `Shimmer` primitive so the sweep matches every other skeleton on the site
 * rather than shipping a second animation.
 */
export function PaymentFormSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rf-pay-skeleton" aria-hidden="true">
      <Shimmer w={318} h={24} mb={12} r={4} />
      <Shimmer w="100%" h={24} mb={20} r={4} />
      {Array.from({ length: rows }, (_, i) => (
        <div className="rf-pay-skeleton-row" key={i}>
          <Shimmer w="100%" h={50} r={4} />
          <Shimmer w="100%" h={50} r={4} />
        </div>
      ))}
      <Shimmer w="100%" h={50} r={4} />
    </div>
  );
}

export function BankForm({ total, onPay, payLabel }: { total: number; onPay: () => void; payLabel?: string }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [accountType, setAccountType] = useState('');
  const [routing, setRouting] = useState('');
  const [account, setAccount] = useState('');
  const [confirm, setConfirm] = useState('');
  // Pre-filled and validated in the design — the common case for a US site.
  const [country, setCountry] = useState('United States');
  const [address, setAddress] = useState('');

  /* ── Account number / confirm ────────────────────────────────────────────
     The PAIR validates, never either field alone. The left one used to turn
     green at four digits, which claimed "correct" about a number nothing had
     checked yet — the whole point of asking twice is that one copy proves
     nothing. So both go green on the match and neither before it. */
  const accountsMatch = filled(account) && confirm === account;
  /* A mismatch is only worth saying once the confirm field has caught up in
     length. Shorter than the original it is simply unfinished, not wrong, and
     "do not match" under a field mid-typing is noise that clears itself. */
  const confirmMismatch = filled(account)
    && confirm.length >= account.length
    && confirm !== account;

  return (
    <>
      <div className="rf-pay-grid">
        <FormField label="First Name" required value={first} onChange={setFirst} autoComplete="given-name" state={ok(filled(first))} />
        <FormField label="Last Name" required value={last} onChange={setLast} autoComplete="family-name" state={ok(filled(last))} />

        <SelectField
          label="Account Type" required value={accountType} onChange={setAccountType}
          options={['Checking', 'Savings']}
          state={ok(filled(accountType))}
        />
        <FormField
          label="Routing Number" required value={routing} onChange={setRouting}
          infoTitle="The 9-digit number on the bottom left of your cheque"
          className={okQuiet(validRouting(routing))}
        />

        {/* Masked by default with an eye toggle (Figma 10080-28132 / -28133).
            type="password" is the shared field's own reveal: it starts hidden,
            swaps the input to text on click, and already ships the frame's exact
            eye-on / eye-off artwork — the paths are byte-identical to the
            exports, so there was nothing to re-trace. */}
        <FormField
          label="Account Number" required type="password"
          value={account} onChange={setAccount}
          // Green only once the pair matches — see accountsMatch.
          state={ok(accountsMatch)}
        />
        <FormField
          label="Confirm Account Number" required type="password"
          value={confirm} onChange={setConfirm}
          error={confirmMismatch ? 'Account numbers do not match' : undefined}
          infoTitle="Re-enter to confirm"
          /* `state`, not okQuiet: okQuiet only paints the green BORDER, so this
             field could never draw the tick its partner draws. The tick and the
             info icon share one slot and the field already picks between them
             (state icon when not default, info icon when it is), so there is no
             double-icon to avoid here. */
          state={ok(accountsMatch)}
        />

        <SelectField
          label="Billing Country" required value={country} onChange={setCountry}
          options={['United States', 'Canada']}
          state={country ? 'success' : 'default'}
        />
        {/* Search affordance owns the icon slot — border only. */}
        <AddressAutocomplete value={address} onChange={setAddress}>
          <FormField label="Billing Address" required type="search" value={address} onChange={setAddress} autoComplete="street-address" className={okQuiet(filled(address))} />
        </AddressAutocomplete>
      </div>

      <button type="button" className="rf-paynow" onClick={onPay}>
        {payLabel ?? `Pay Now ${money(total)}`}
      </button>
    </>
  );
}

/** What the rental APIs need from this form. `expiry` is split for them. */
export interface CardFormValue {
  /** Empty in hosted-fields mode — GP's iframe never gives us the digits.
   *  cardPaymentMethod() substitutes the static test PAN in that case. */
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  /** Real single-use gateway token, when hosted fields produced one. */
  token?: string;
  /** The gateway's mask. Carried, deliberately not sent — see CardPayment. */
  maskedCardNumber?: string;
  nameOnCard: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export function CardForm({ total, onPay, busy, gpPublicKey, payLabel }: {
  total: number;
  /** Overrides "Pay Now $X" — the always-on autopay frame reads
   *  "Agree & Pay $X", because that button is where the recurring
   *  authorisation is accepted. */
  payLabel?: string;
  /** Receives the entered card when the form is complete. Callers that only
   *  need the click (the demo/preview path) can ignore the argument. */
  onPay: (card: CardFormValue) => void;
  /** Payment in flight — the button locks so a double-tap cannot double-charge. */
  busy?: boolean;
  /** Global Payments PUBLIC key. Present ⇒ try hosted fields for the number
   *  and expiry. Absent, or the library will not load, ⇒ plain inputs. */
  gpPublicKey?: string;
}) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('United States');
  const [zip, setZip] = useState('');
  // Billing address. Not in the Figma frame, but the rental APIs require a
  // street/city/state on both the payment method and the tenant contact, and a
  // card that cannot be billed is worse than one more row of inputs.
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');

  /*
   * Hosted fields. `null` while we find out whether GP's library loads, so the
   * plain inputs are not rendered and then yanked away underneath a shopper who
   * has already started typing. Once it settles it never flips again.
   */
  const [hosted, setHosted] = useState<boolean | null>(gpPublicKey ? null : false);
  const [gpReady, setGpReady] = useState(false);
  const [gpError, setGpError] = useState('');
  const uid = useId().replace(/:/g, '');
  const numId = `gp-num-${uid}`, expId = `gp-exp-${uid}`, subId = `gp-sub-${uid}`;

  /**
   * What GP tells us about its two frames, and all it tells us: a `valid`
   * boolean per keystroke. No length, no emptiness, no focus.
   *
   * There is no label state here any more. A hosted cell's label is the
   * frame's own placeholder now (see FIELD_STYLES in gpHostedFields), which is
   * the only thing that can see whether the field is empty. The window
   * blur/focus tracking that used to place a label from out here went with it:
   * inferring "is it empty" from focus and validity was wrong in one direction
   * or the other every way it was tried, and a focus whose end never reported
   * left the label stuck.
   */
  /** Live: does it hold a valid value RIGHT NOW. Gates the row's valid state. */
  const [gpValid, setGpValid] = useState({ number: false, expiry: false });
  /**
   * Has each cell been LEFT. A message only appears once the shopper has moved
   * on from a cell, never while they are still filling it in.
   *
   * The two plain cells report this themselves with onBlur. The two frames
   * cannot — GP publishes no focus or blur — so the parent watches
   * document.activeElement instead: focus inside a cross-origin iframe makes
   * the <iframe> ELEMENT the active one, which is enough to say which cell has
   * the caret without seeing anything in it.
   *
   * Polled rather than driven by window blur/focus, which misses a move
   * straight from one frame to the other (the window is already blurred, so no
   * second event fires). This only ever sets a one-way flag, so the worst a
   * missed tick can do is show a message a fraction late.
   */
  const [touched, setTouched] = useState({ number: false, expiry: false, cvv: false });
  const markTouched = (k: 'number' | 'expiry' | 'cvv') =>
    setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  useEffect(() => {
    if (!hosted) return undefined;
    let prev: 'number' | 'expiry' | null = null;
    const focused = (): 'number' | 'expiry' | null => {
      const el = document.activeElement;
      if (!el || el.tagName !== 'IFRAME') return null;
      if (document.getElementById(numId)?.contains(el)) return 'number';
      if (document.getElementById(expId)?.contains(el)) return 'expiry';
      return null;
    };
    const id = window.setInterval(() => {
      const now = focused();
      const left = prev;
      if (left && left !== now) setTouched((t) => (t[left] ? t : { ...t, [left]: true }));
      prev = now;
    }, 150);
    return () => window.clearInterval(id);
  }, [hosted, numId, expId]);

  /* The token handler is rebuilt on every keystroke in the billing fields, but
     the frames are mounted ONCE — remounting would wipe the card mid-entry. So
     the live handler is read through a ref. */
  const onTokenRef = useRef<(t: { token: string; masked: string }) => void>(() => {});

  /* The row is one bordered box holding three inputs, so it turns green as a
     unit rather than per-input — there is only one border to turn. */
  const cardRowValid = hosted
    /* All THREE, not the CVV alone. GP reports each frame's validity on every
       keystroke, so the number and the expiry are knowable — reading only the
       CVV turned the row green, and its tick on, beside an empty expiry. */
    ? gpValid.number && gpValid.expiry && validCvv(cvv)
    : validCard(number) && validExpiry(expiry) && validCvv(cvv);
  // GP's frame reports its own expiry problems; ours would be judging a field
  // it cannot see.
  const expError = hosted ? '' : expiryError(expiry);
  const [payAttempted, setPayAttempted] = useState(false);

  /* The row is one box with three inputs, so it cannot ring the offending cell
     on its own — it says which one underneath instead. The banner above only
     reports THAT something is wrong; this is the detail.
     Shown as soon as a cell has content and does not validate, not only on
     submit: four digits of a sixteen-digit number is already wrong, and
     waiting for the pay button to say so wastes the trip. Empty cells stay
     quiet until a pay attempt — nothing has been got wrong yet.
     In hosted mode the contents are GP's, but its per-keystroke validity is
     not — gpValid tracks it, so an empty or half-typed frame can be named here
     too rather than only the CVV. */
  const cardCellError = (() => {
    /* TYPED INTO, THEN LEFT — or a pay attempt. Never while a cell still has
       the caret: a sixteen-digit number is wrong for fifteen keystrokes out of
       sixteen, and saying so on each of them is noise the shopper is already
       fixing. And never for a cell merely passed through, which is why each
       rule needs content as well as a blur. */
    if (hosted) {
      /* PAY ATTEMPT ONLY for the two frames, and it has to be.
         "Typed into, then left" needs to tell an empty cell from a partly
         filled one, and GP cannot: its *-test event is bound inside the frame
         to focus, blur, input, keydown AND keyup (checked in gp-1.0.0), so it
         arrives for a cell that was merely clicked through, carrying the same
         `valid: false` an empty cell and a three-digit one both produce. That
         is what put "Enter a complete card number" under an empty field.
         Pressing Pay is the one signal that cannot lie, and it does reach here
         now — GP's own submit frame takes the click, so onError marks the
         attempt (see the handler below). The plain cells keep the blur rule:
         :placeholder-shown lets us see whether they hold anything. */
      if (payAttempted && !gpValid.number) return 'Enter a complete card number';
      if (payAttempted && !gpValid.expiry) return 'Enter the expiry date as MM / YYYY';
    } else {
      const n = digits(number);
      if ((payAttempted || (touched.number && n.length > 0)) && !validCard(number)) {
        return n.length === 0 ? 'Enter your card number' : `Enter all ${CARD_DIGITS} digits of your card number`;
      }
      // A complete but unusable expiry is wrong the moment it is complete, so
      // this one does not wait to be left.
      if (expError) return expError;
      if ((payAttempted || (touched.expiry && digits(expiry).length > 0)) && !validExpiry(expiry)) {
        return 'Enter the expiry date as MM / YY';
      }
    }
    const c = digits(cvv);
    if ((payAttempted || (touched.cvv && c.length > 0)) && !validCvv(cvv)) {
      return c.length === 0 ? 'Enter the security code' : `Enter all ${CVV_DIGITS} digits of the security code`;
    }
    return '';
  })();
  /** A suggestion has been chosen, so the address parts below are real. */
  const [addressPicked, setAddressPicked] = useState(false);
  /* The four parts complete an address, so they appear once there IS one —
     picked from a suggestion, or typed without picking — and once anything is
     already in them (a browser autofill, or a return to the panel).
     NOT on a bare pay attempt. Pressing Pay with the search empty used to
     unfold all four, which answers a question nobody asked: the address has
     not been started, so there is nothing to complete. The search box carries
     the error on its own instead. */
  const showBillingParts = addressPicked || filled(address)
    || filled(city) || filled(stateCode) || filled(zip);
  const complete = cardRowValid && filled(name) && filled(address) && filled(city)
    && stateCode.trim().length === 2 && zip.trim().length >= 3;

  /* ONE banner, whichever went wrong, shown under the "Credit / Debit" head
     rather than down beside the pay button (Figma 12029-93132). A shopper who
     reaches a dead button looks at the button, not two hundred pixels above
     it — and the fields it is talking about are all below this line.
     A processing failure outranks an incomplete form: gpError means the card
     itself was refused or the tokeniser broke, which is the more specific
     thing and not something filling in a field will fix. */
  const payError = gpError
    || (payAttempted && !complete
      ? 'Complete Billing Information details before processing payment'
      : '');

  /** "1234567812345678" → "1234 5678 1234 5678" as it's typed. */
  const numberRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const cvvRef = useRef<HTMLInputElement>(null);

  /* Backspace at the very start of a cell carries on into the one before it,
     so the row deletes as continuously as it fills. Forward auto-advance
     already existed (see onNumber/onExpiry); this is the other direction.
     Only when the caret is collapsed at 0 — mid-field or with a selection,
     backspace means what it always means. */
  const backspaceInto = (prev: React.RefObject<HTMLInputElement>) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Backspace') return;
      const el = e.currentTarget;
      if (el.selectionStart !== 0 || el.selectionEnd !== 0) return;
      const target = prev.current;
      if (!target) return;
      e.preventDefault();
      target.focus();
      const end = target.value.length;
      target.setSelectionRange(end, end);
    };

  /*
   * Auto-advance: filling a field hands focus to the next one, so the whole row
   * can be typed without reaching for the mouse.
   *
   * It fires on the TRANSITION to complete, not merely on being complete —
   * hence comparing against the previous value. Without that guard, editing a
   * card number that is already full would rip focus away on every keystroke,
   * which is worse than not advancing at all.
   */
  const onNumber = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, CARD_DIGITS);
    setNumber(d.replace(/(.{4})/g, '$1 ').trim());
    if (d.length === CARD_DIGITS && digits(number).length < CARD_DIGITS) {
      expiryRef.current?.focus();
    }
  };

  /** "1226" → "12 / 26", then hand focus to the CVV. */
  const onExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, EXPIRY_DIGITS);
    setExpiry(d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d);
    if (d.length === EXPIRY_DIGITS && digits(expiry).length < EXPIRY_DIGITS) {
      cvvRef.current?.focus();
    }
  };

  /* Build the payload the rental needs. In hosted mode the PAN and expiry are
     left empty on purpose — cardPaymentMethod() fills in the static test card,
     which is the single place that changes when the API takes a token. */
  const valueFrom = (tok?: { token: string; masked: string }): CardFormValue => {
    const [mm, yy] = digits(expiry).match(/.{1,2}/g) ?? ['', ''];
    return {
      cardNumber: hosted ? '' : digits(number),
      expMonth: hosted ? '' : mm,
      // The row takes MM/YY; the API wants a full year.
      expYear: hosted ? '' : (yy.length === 2 ? `20${yy}` : yy),
      cvv,
      token: tok?.token,
      maskedCardNumber: tok?.masked,
      nameOnCard: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: stateCode.trim(),
      zip: zip.trim(),
    };
  };

  /* Latest handler, read by the mount effect through a ref so the frames are
     never rebuilt just because a billing field changed. */
  onTokenRef.current = (tok) => {
    setGpError('');
    // Validated HERE rather than before tokenizing: GP owns the click, so the
    // first moment we can check the rest of the form is once it comes back.
    // A spent token costs nothing — they are single-use and expire anyway.
    if (!complete) { setPayAttempted(true); return; }
    onPay(valueFrom(tok));
  };

  useEffect(() => {
    if (!gpPublicKey) return undefined;
    let handle: HostedCardHandle | null = null;
    let dead = false;
    void mountHostedCard({
      publicKey: gpPublicKey,
      numberTarget: `#${numId}`,
      expiryTarget: `#${expId}`,
      submitTarget: `#${subId}`,
      onReady: () => { if (!dead) setGpReady(true); },
      onToken: (t) => onTokenRef.current(t),
      onError: (m) => {
        if (dead) return;
        setGpError(m);
        /* This IS the pay attempt, as far as the hosted row is concerned.
           GP will only tokenize from a gesture inside its own frame, so its
           invisible submit button takes the click and OUR handler — the one
           that sets payAttempted — never runs. Without this the banner showed
           GP's rejection while the row underneath stayed silent, because every
           per-field message waits on payAttempted.
           Safe to treat as an attempt: both paths that reach onError are
           downstream of a submit (token-error, and a token-success that
           carried no token). A library that never loads does not come through
           here — it resolves to null and the plain inputs take over. */
        setPayAttempted(true);
      },
      onFieldValid: (field, valid) => {
        /* STICKY ONCE VALID, and nothing weaker.
           GP tells us neither length nor emptiness, so "has content" has to be
           inferred. Two weaker readings both fail:
             - `valid` alone drops the label back onto a half-typed number the
               moment the frame blurs;
             - the event's mere ARRIVAL sticks the label up over an empty
               field, because GP posts the expiration test without any input.
           `valid` having been true at least once cannot happen to an empty
           frame, and does not un-happen when a digit is deleted — so the label
           stays up over a value being edited and never strands itself above
           nothing.
           What this still does not catch: a frame typed into but never brought
           to valid, then blurred. That drops. It needs a length GP does not
           expose, and stranding the label over an empty field is the worse of
           the two. */
        if (dead) return;
        /* Whether the frame validates, and nothing more. Its arrival proves
           nothing about content: GP binds this to focus and blur as well as to
           typing. */
        setGpValid((v) => (v[field] === valid ? v : { ...v, [field]: valid }));
      },
    }).then((h) => {
      if (dead) { h?.dispose(); return; }
      handle = h;
      // null ⇒ the library never arrived. Fall back to plain inputs rather
      // than leaving the shopper with no way to pay.
      setHosted(!!h);
    });
    return () => { dead = true; handle?.dispose(); };
    // Mounted once per key. The frames outlive every other bit of state here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpPublicKey]);

  return (
    <>
      {payError && (
        <div className="rf-payerr" role="alert">
          <AlertIcon size={24} className="rf-payerr-ico" />
          <span>{payError}</span>
        </div>
      )}
      {/*
        One bordered box holding three inputs — the design's card row. Not a
        FormField: that models a single labelled input, and forcing three into it
        would mean fighting its internals. Same tokens, so it sits flush with the
        real form fields above and below it.
      */}
      <div className={`rf-cardrow${cardRowValid ? ' rf-cardrow--valid' : ''}${cardCellError ? ' rf-cardrow--error' : ''}${hosted && !gpReady ? ' rf-cardrow--loading' : ''}`}>
        <CreditCardIcon size={24} className="rf-cardrow-ico" />

        {/*
          Each cell floats its own label, the same way the FormFields below do —
          the label rises and STAYS above the value instead of vanishing on the
          first keystroke. Input before label in the DOM so the CSS sibling
          selector can key off :placeholder-shown, and placeholder=" " (a space)
          so that pseudo-class is reliable. Exactly the kit's mechanism; see
          FormField.css.
        */}
        <span className="rf-cardcell rf-cardcell--number">
          {/* Both are always in the DOM: GP resolves its targets by selector,
              so the container must exist before the frames are mounted. Only
              one is ever visible. */}
          <span id={numId} className={`rf-gpfield${hosted === false ? ' rf-gpfield--off' : ''}`} />
          {hosted === false && (
            <input
              className="rf-cardrow-input"
              ref={numberRef}
              value={number}
              onChange={(e) => onNumber(e.target.value)}
              onBlur={() => markTouched('number')}
              placeholder=" "
              inputMode="numeric"
              autoComplete="cc-number"
              aria-label="Card Number (required)"
            />
          )}
          {/* PLAIN cells only. A hosted cell's label is the frame's own
              placeholder, which is the only one that comes back when the field
              is emptied — a second label drawn from here would sit on top of
              it and could not know when to leave. */}
          {hosted === false && <label className="rf-cardcell-label">Card Number<span className="rf-req">*</span></label>}
        </span>

        {/* Expiry and CVV are wrapped together so they move to a second line as
            a PAIR. Left as three loose siblings, flex wraps them one at a time
            and there is a band of widths where CVV sits alone under a row that
            still has expiry on it. */}
        <span className="rf-cardrow-short">
          <span className={`rf-cardcell rf-cardcell--exp${hosted ? ' rf-cardcell--exp-wide' : ''}`}>
            <span id={expId} className={`rf-gpfield${hosted === false ? ' rf-gpfield--off' : ''}`} />
            {hosted === false && (
              <input
                className="rf-cardrow-input"
                ref={expiryRef}
                value={expiry}
                onChange={(e) => onExpiry(e.target.value)}
                onBlur={() => markTouched('expiry')}
                onKeyDown={backspaceInto(numberRef)}
                placeholder=" "
                inputMode="numeric"
                autoComplete="cc-exp"
                aria-label="Card expiry, MM / YY (required)"
              />
            )}
            {hosted === false && <label className="rf-cardcell-label">MM / YY<span className="rf-req">*</span></label>}
          </span>

          <span className="rf-cardcell rf-cardcell--cvv">
            <input
              className="rf-cardrow-input"
              ref={cvvRef}
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, CVV_DIGITS))}
              onBlur={() => markTouched('cvv')}
              /* In hosted mode the expiry lives in GP's frame, which cannot be
                 focused from here, so the chain stops at the CVV. */
              onKeyDown={hosted ? undefined : backspaceInto(expiryRef)}
              placeholder=" "
              inputMode="numeric"
              autoComplete="cc-csc"
              aria-label="Card security code (required)"
            />
            <label className="rf-cardcell-label">CVV<span className="rf-req">*</span></label>
          </span>
        </span>

        {/* One tick for the row, not three: the three inputs share a single
            border, so they succeed as a unit (Figma 10080-28126).
            ALWAYS rendered, only its visibility toggling — mounting it on
            validity made expiry and CVV jump left by the icon's width the
            instant the last digit landed, which reads as the field having
            moved under the cursor. */}
        <CheckIcon
          className={`rf-cardrow-tick${cardRowValid ? '' : ' rf-cardrow-tick--pending'}`}
          aria-hidden="true"
        />
      </div>
      {/* Which of the row's three is wrong. Replaces the expiry-only message
          that used to sit here — an incomplete card number or CVV said nothing
          at all before, so the row went red with no reason given. */}
      {cardCellError && <p className="rf-cardrow-msg" role="alert">{cardCellError}</p>}

      {/* `error` rather than a bare red state: the kit treats a message as
          what PUTS a field in the error state, so a red box always says why.
          Only after a pay attempt — ringing a field the shopper has not
          reached yet would be scolding them for not having got there. */}
      <FormField
        label="Name on Card" required value={name} onChange={setName} autoComplete="cc-name"
        state={ok(filled(name))}
        error={payAttempted && !filled(name) ? 'Enter the name on the card' : undefined}
      />

      {/* type="search" for the magnifier — the kit's affordance for a lookup
          field, ready for address search to be wired to it. The bank form's
          Billing Address and SuccessStep's Business Address already use it, so
          this was the odd one out. The icon stays neutral when the field
          validates (.hb-field__icon--affordance), so it does not compete with
          the success tick. */}
      {/* The magnifier now does something. Picking a suggestion fills the
          three fields below as well — a billing address that only half-matches
          the card is a common cause of a decline, and retyping the city and ZIP
          is where that mismatch creeps in. Typing it all by hand still works if
          the proxy is unreachable. */}
      <AddressAutocomplete
        value={address}
        onChange={setAddress}
        onPick={(place) => {
          if (place.address.city) setCity(place.address.city);
          // The two-letter code, not "California" — the field is capped at 2.
          if (place.address.stateCode) setStateCode(place.address.stateCode);
          if (place.address.zip) setZip(place.address.zip);
          if (place.address.country) setCountry(place.address.country);
          setAddressPicked(true);
        }}
      >
        <FormField
          label="Billing Address" required type="search" value={address} onChange={setAddress}
          autoComplete="billing street-address" state={ok(filled(address))}
          error={payAttempted && !filled(address) ? 'Enter your billing address' : undefined}
        />
      </AddressAutocomplete>

      {/* City, state, country and ZIP stay hidden until the address lookup
          fills them — four empty boxes before an address is chosen are four
          boxes nobody should have to type into.

          They also appear once anything is already in them (a browser autofill,
          or a return to the panel), and on a pay attempt — they are REQUIRED,
          so a shopper who never picks a suggestion must still be able to see
          and complete them rather than meet a dead button. */}
      {showBillingParts && (
        <>
          <div className="rf-pay-grid">
            <FormField
              label="Billing City" required value={city} onChange={setCity} autoComplete="billing address-level2"
              state={ok(filled(city))}
              error={payAttempted && !filled(city) ? 'Enter your billing city' : undefined}
            />
            <FormField
              label="Billing State" required value={stateCode} onChange={(v) => setStateCode(v.toUpperCase().slice(0, 2))}
              autoComplete="billing address-level1" state={ok(stateCode.trim().length === 2)}
              error={payAttempted && stateCode.trim().length !== 2 ? 'Two-letter state code' : undefined}
            />
          </div>

          <div className="rf-pay-grid">
            <SelectField
              label="Billing Country" required value={country} onChange={setCountry}
              options={['United States', 'Canada']}
              state={country ? 'success' : 'default'}
            />
            <FormField
              label="Billing ZIP Code" required value={zip} onChange={setZip} autoComplete="postal-code"
              state={ok(zip.trim().length >= 3)}
              error={payAttempted && zip.trim().length < 3 ? 'Enter your billing ZIP code' : undefined}
            />
          </div>
        </>
      )}

      {/*
        In hosted mode GP's own submit frame sits invisibly on top of this
        button and takes the click, because the library exposes no way to ask
        for a token programmatically — the gesture must happen inside their
        iframe. Ours stays as the thing the shopper sees, so the label keeps
        following the live total; a frame's button text is fixed at mount.
      */}
      <div className={`rf-paynow-wrap${hosted ? ' rf-paynow-wrap--hosted' : ''}`}>
        <button
          type="button"
          className="rf-paynow"
          disabled={busy}
          /* Hosted: the frame above is the real control, so this one is taken
             out of the tab order rather than offering a second, dead one. */
          tabIndex={hosted ? -1 : undefined}
          aria-hidden={hosted ? true : undefined}
          onClick={() => {
            if (hosted) return;
            // Validate HERE rather than disabling the button: a disabled control
            // gives no reason, and the shopper is one field from paying.
            if (!complete) { setPayAttempted(true); return; }
            onPay(valueFrom());
          }}
        >
          {busy ? 'Processing…' : (payLabel ?? `Pay Now ${money(total)}`)}
        </button>
        {/* Hidden while paying so a second click cannot reach the frame. */}
        <span
          id={subId}
          className={`rf-gp-submit${hosted === false || busy ? ' rf-gp-submit--off' : ''}`}
          aria-label={payLabel ?? `Pay Now ${money(total)}`}
        />
      </div>
    </>
  );
}

export function PaymentSection({
  total, autopay, onAutopay, onPay,
}: {
  total: number;
  autopay: boolean;
  onAutopay: (v: boolean) => void;
  /** Fires when a "Pay Now" is pressed — the caller opens the processing modal. */
  onPay: (method: PayMethod) => void;
}) {
  const [selected, setSelected] = useState<PayMethod>(null);

  /** Collapsed method button — 2px dark outline, per both frames. */
  const methodButton = (method: 'card' | 'bank') => (
    <button type="button" className="rf-method" onClick={() => setSelected(method)}>
      {method === 'card' ? <CreditCardIcon size={24} /> : <BankIcon size={24} />}
      {method === 'card' ? 'Credit / Debit' : 'Pay by Bank'}
    </button>
  );

  /** Expanded panel — 2px CTA border, holding the method's form. */
  const methodPanel = (method: 'card' | 'bank') => (
    <section className="rf-method-panel" aria-label={method === 'card' ? 'Credit / Debit' : 'Pay by Bank'}>
      <header className="rf-method-panel-head">
        {method === 'card' ? <CreditCardIcon size={24} /> : <BankIcon size={24} />}
        <span>{method === 'card' ? 'Credit / Debit' : 'Pay by Bank'}</span>
      </header>
      {method === 'card'
        ? <CardForm total={total} onPay={() => onPay('card')} />
        : <BankForm total={total} onPay={() => onPay('bank')} />}
    </section>
  );

  return (
    <section className="rf-payment">
      <h3 className="rf-payment-title">Payment</h3>

      <div className="rf-autopay-card">
        <label className="rf-autopay-line">
          <input type="checkbox" checked={autopay} onChange={(e) => onAutopay(e.target.checked)} />
          <span className={`rf2-box${autopay ? ' rf2-box--on' : ''}`}>{autopay && <CheckTick size={16} />}</span>
          <span className="rf-autopay-text">Autopay Enrollment</span>
        </label>
        <InfoIcon size={16} className="rf-autopay-i" />
      </div>

      <div className="rf-wallets">
        <button type="button" className="rf-wallet" onClick={() => onPay('googlepay')} aria-label="Pay with Google Pay">
          {/* Wordmarks are the brands' own and must not be re-drawn; these are the
              existing inline marks already used by step 2's payment grid. */}
          <span className="rf-wallet-mark rf-wallet-mark--g" />
          <span className="rf-wallet-label">Pay</span>
        </button>
        <button type="button" className="rf-wallet" onClick={() => onPay('applepay')} aria-label="Pay with Apple Pay">
          <span className="rf-wallet-apple">&#xF8FF;</span>
          <span className="rf-wallet-label">Pay</span>
        </button>
      </div>

      {/* Card first when card is chosen, bank first when bank is — matching the
          two frames, where the expanded panel always sits above the collapsed one. */}
      {selected === 'card' ? (
        <>{methodPanel('card')}{methodButton('bank')}</>
      ) : selected === 'bank' ? (
        <>{methodPanel('bank')}{methodButton('card')}</>
      ) : (
        <>{methodButton('card')}{methodButton('bank')}</>
      )}
    </section>
  );
}
