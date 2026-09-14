// ===========================================================================
// The Make a Payment panel — Figma 8905-133037 (multi-space) and its
// single-space sibling 9030-31458.
//
// Reached from ANY unit's "Pay Now"; the sidebar card's "Account Info" button
// goes back. Every space with something outstanding is listed and SELECTED, so
// the default action pays the account off in full — which is what the balance
// bar then totals. Unticking a space drops it from that total.
//
// WHY EVERYTHING IS SELECTED even though only one unit's button was clicked:
// the frame draws it that way, and it is the kinder default — a tenant with
// three units who pays one and leaves two in arrears has not solved their
// problem. The per-space checkbox is there for the case where they genuinely
// mean to pay only some.
//
// Each space block is: checkbox + "#310 | address", the autopay strip, then
// its charges and total.
//
// THE AUTOPAY STRIP HAS FOUR STATES (Figma 12239-45881), and they are one
// card in two shapes rather than four separate designs:
//
//   not enrolled  an empty "Autopay Enrollment" checkbox, nothing else.
//   enrolled      the card it is charged to and when, plus Update Payment
//                 Method and Cancel Autopay.
//   updating      enrolled with Update Payment Method ticked — the same card
//                 with the charged-to lines replaced by what will change.
//   cancelled     enrolled, then Cancel Autopay — back to the empty checkbox,
//                 with a Guidance-blue notice under it. Ticking the box again
//                 re-enrols, which is the undo the notice's wording implies.
//
// STATE IS PER SPACE, held as sets of space ids. A tenant can be enrolled on
// one space and not another (the sample data is exactly that), so a single
// flag would tie every strip to whichever space was last clicked.
//
// EVERY SPACE REACHES EVERY STATE, whichever one it starts in. `autopay.enrolled`
// is only the OPENING position: ticking Autopay Enrollment on a space that
// arrived unenrolled moves it to the enrolled card, exactly as Cancel Autopay
// moves an enrolled one back. A space that starts unenrolled has no card on
// file, so its enrolled card reads "Autopay will be updated to the payment
// method used in this transaction" — which is what enrolling during a payment
// actually means — and it has no Update Payment Method tick, because there is
// no stored method to replace.
//
// None of it persists — there is no account API yet, so cancelling and
// re-enrolling live only in this component, like every other control here.
//
// CREDIT / DEBIT AND PAY BY BANK OPEN #99's OWN FORMS. They are imported, not
// reproduced: a tenant paying a bill and a shopper renting a space are filling
// in the same card and the same bank account, and a second copy here would be
// a second place for those fields, their validation and their error messages
// to drift. #18 already reaches into #05's api.ts the same way.
//
// The card form falls back to plain inputs when it is handed no Global
// Payments key, which is what happens here — #19 has no config.json and makes
// no API calls. That is the form's own documented behaviour, not a special
// case added for this panel.
// ===========================================================================

import { useMemo, useState } from 'react';
import { Checkbox, InfoIcon, ApplePayMark } from '@shared/ui';
import { BankForm, CardForm, PaymentFormSkeleton } from '@shared/paymentForms';
import {
  BankIcon, ChevronBigRight24Icon, CreditCardIcon, CreditCardRemoveIcon,
  CreditCardRepeatIcon, GooglePayLockup, InfoFilledIcon, InfoNoticeIcon,
  MinusIcon, PlusIcon, ShieldSettingsIcon,
} from './icons';
import { AUTOPAY_CANCELLED_NOTE, AUTOPAY_UPDATE_NOTE } from './data';
import type { AccountSpace } from './data';

/** Skeleton beat before a payment form appears (Figma 8507-24610). Same 700ms
 *  as #99's step 2, so the two screens feel like one product. */
const FORM_SKELETON_MS = 700;

/**
 * "$123.00", "$ 1,234.50" → 123 / 1234.5. Returns 0 for anything unparseable
 * rather than NaN, which would poison the whole sum into "$NaN".
 */
function money(v: string): number {
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Back to the way the design writes a total: "$350.00". */
function formatMoney(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * `id` flipped in or out of a set, as a NEW set — mutating and returning the
 * same object would be the same reference and React would not re-render.
 */
function flip(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function MakePaymentPanel({
  spaces, space,
}: {
  /** Every space with something outstanding — all listed, all selected. */
  spaces: AccountSpace[];
  /** The unit whose "Pay Now" was clicked. Only used as a fallback when no
   *  list is passed, so an older caller still renders. */
  space?: AccountSpace;
}) {
  const list = spaces.length ? spaces : space ? [space] : [];

  /* Everything selected on arrival — see the header note. A Set of ids rather
     than a flag per space, so the state does not have to be rebuilt when the
     list changes. */
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(list.map((s) => s.id)),
  );
  const [prepay, setPrepay] = useState(false);
  /* The three autopay sets — see the header note on why each is per space and
     not a flag. All start empty: the strip's opening state comes from the
     space's own `autopay.enrolled`, and these record what the tenant has
     changed since. `cancelled` wins over both, so turning autopay off always
     turns it off no matter which way the space arrived. */
  const [updateMethod, setUpdateMethod] = useState<Set<string>>(() => new Set());
  const [cancelled, setCancelled] = useState<Set<string>>(() => new Set());
  const [enrolledNow, setEnrolledNow] = useState<Set<string>>(() => new Set());

  /** Drop one id from a set — the half of `flip` that is not a toggle. */
  const clearFor = (
    set: (fn: (prev: Set<string>) => Set<string>) => void,
  ) => (id: string) => set((prev) => {
    if (!prev.has(id)) return prev;
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
  const clearUpdateMethod = clearFor(setUpdateMethod);
  /* MOBILE ONLY (Figma 9038-78423 closed, 9038-78569 open). On a phone the
     screen opens as a LIST — one line per space, number, address and amount —
     so the tenant can pick what to pay without scrolling past four money rows
     and an autopay strip each. "Show Billing Details" opens all of that.
     Closed by default because that list is the point of the mobile frame; the
     amount owed is still on every row, so nothing is hidden that decides
     whether to tick a space. Desktop ignores this entirely — the stylesheet
     only honours it under 720px, where the frame has the control. */
  const [billingOpen, setBillingOpen] = useState(false);
  /* The mobile balance box prepays by MONTHS, not just a yes/no. 1 is the
     minimum the stepper can reach: "prepay 0 months" is just not prepaying,
     which the checkbox already says. */
  const [prepayMonths, setPrepayMonths] = useState(1);
  /* Which payment form is expanded, and the skeleton beat before it appears —
     both mirror #99's step 2, because they drive the same two forms. */
  const [payMethod, setPayMethod] = useState<'card' | 'bank' | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const toggle = (id: string) => setSelected((prev) => flip(prev, id));

  /* The bar totals what is TICKED, so the figure always matches what the
     payment buttons would take. Falls back to the space's own printed balance
     when a total will not parse, so a formatting quirk cannot silently
     understate what is owed. */
  const balanceTotal = useMemo(
    () => list.filter((s) => selected.has(s.id))
      .reduce((sum, s) => sum + (money(s.total) || money(s.balance.amount)), 0),
    [list, selected],
  );
  const anyPastDue = list.some((s) => selected.has(s.id) && s.balance.pastDue);

  /** A card/bank panel is open, so its tile is replaced by the panel and the
   *  other method relocates beneath it. Wallets are one-tap and never expand. */
  const methodOpen = payMethod === 'card' || payMethod === 'bank';

  const selectMethod = (m: 'card' | 'bank') => {
    const next = payMethod === m ? null : m;
    setPayMethod(next);
    if (next) {
      setFormLoading(true);
      window.setTimeout(() => setFormLoading(false), FORM_SKELETON_MS);
    }
  };

  /* No account-payment API exists yet — this widget is still entirely static
     (see data.ts), so "Pay Now" collapses the form rather than pretending to
     charge anything. The forms hand back a fully validated CardFormValue, so
     the only thing missing here is the call. */
  const pay = () => setPayMethod(null);
  /* "Pay through" is per space; with several selected they can disagree, so the
     bar shows the FURTHEST date — that is what paying this total covers. */
  const payThrough = list.find((s) => selected.has(s.id))?.balance.payThrough ?? '';

  return (
    <section className="ma-pay">
      <h2 className="ma-pay__title">Make a Payment</h2>

      {list.map((sp) => {
        const on = selected.has(sp.id);
        /* Off beats on: a space is enrolled if it arrived that way OR was
           enrolled here, unless it has since been cancelled. One rule for
           both starting positions, so Cancel Autopay and the enrolment tick
           behave the same on every space. */
        const justCancelled = cancelled.has(sp.id);
        const enrolled = !justCancelled && (sp.autopay.enrolled || enrolledNow.has(sp.id));
        /* The tick ALONE decides which copy shows, on every space. It used to
           also be forced on for a space with no card on file, which meant one
           space could read "will be updated" with no tick beside it while its
           neighbour had one — see the enrol handler for how that case is
           handled now instead. */
        const hasCardOnFile = Boolean(sp.autopay.cardLast4);
        const updating = enrolled && updateMethod.has(sp.id);
        return (
          <div className="ma-pay-space" key={sp.id}>
            {/* A CHECKBOX, not the radio the single-space frame had: several
                spaces can be paid at once, which a radio cannot express. */}
            <div className="ma-space-head">
              <Checkbox
                checked={on}
                onChange={() => toggle(sp.id)}
                className="ma-space-head__check"
              >
                <span className="ma-space-head__label">
                  <span className="ma-space-head__num">{sp.paymentNumber}</span>
                  <span className="ma-space-head__sep"> I </span>
                  <span className="ma-space-head__addr">{sp.paymentAddress}</span>
                </span>
              </Checkbox>
              {/* MOBILE ONLY. With the breakdown closed this is the only figure
                  on the row, and it is what the tick is deciding about — so the
                  list stays useful collapsed. The desktop frame has no such
                  column and the stylesheet hides it there. */}
              <span className="ma-space-head__amount">{sp.total}</span>
            </div>

            {/* ONE disclosure, not two: the frame's closed state shows neither
                the autopay strip nor the money rows, so they open together. */}
            <div className={`ma-detail${billingOpen ? '' : ' ma-detail--hidden'}`}>
            {enrolled ? (
              <div className="ma-autopay">
                <div className="ma-autopay__left">
                  <div className="ma-autopay__head">
                    <CreditCardRepeatIcon />
                    <span className="ma-autopay__title">Enrolled in Autopay</span>
                  </div>
                  {/* The SAME slot, either way — ticking Update Payment Method
                      swaps what is charged today for what is about to change,
                      because once it is ticked the old card is no longer the
                      answer to "what pays this". */}
                  <div className="ma-autopay__detail">
                    {updating ? (
                      <p className="ma-autopay__updating">{AUTOPAY_UPDATE_NOTE}</p>
                    ) : (
                      <>
                        {/* Only when there IS one. A space enrolled during this
                            payment has no stored card, and "Charged to xxxx "
                            with nothing after it is worse than not saying it. */}
                        {hasCardOnFile && <p>Charged to xxxx {sp.autopay.cardLast4}</p>}
                        <p>{sp.autopay.schedule}</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="ma-autopay__actions">
                  {/* On EVERY enrolled space. Two spaces enrolled the same way
                      must offer the same controls, or the one missing a tick
                      looks broken next to the one that has it. */}
                  <Checkbox
                    checked={updateMethod.has(sp.id)}
                    onChange={() => setUpdateMethod((prev) => flip(prev, sp.id))}
                    className="ma-autopay__check"
                  >
                    Update Payment Method
                  </Checkbox>
                  <button
                    type="button"
                    className="ma-link-row"
                    onClick={() => {
                      setCancelled((prev) => flip(prev, sp.id));
                      clearUpdateMethod(sp.id);
                    }}
                  >
                    <CreditCardRemoveIcon />
                    <span className="ma-link">Cancel Autopay</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Not enrolled — whether it never was or was just cancelled, the
                 strip is the same empty checkbox. Cancelling only adds the
                 notice beneath it and turns the card Guidance blue. */
              <div className={`ma-autopay ma-autopay--offer${justCancelled ? ' ma-autopay--cancelled' : ''}`}>
                <div className="ma-autopay__enroll">
                  {/* The box IS the enrolment control, so it never sits ticked
                      here: ticking it moves the space to the enrolled card and
                      this shape stops being rendered. Cancel Autopay is the
                      way back, on every space. */}
                  <Checkbox
                    checked={false}
                    onChange={() => {
                      if (justCancelled) {
                        /* Re-enrol — the notice recommends staying enrolled, so
                           the box beneath it has to be the way back. Whatever
                           the space's starting position, dropping it out of
                           `cancelled` restores that. */
                        setCancelled((prev) => flip(prev, sp.id));
                        clearUpdateMethod(sp.id);
                      } else {
                        /* Enrol a space that arrived without autopay. With no
                           card on file the method can only be this payment's,
                           so the tick starts ON — the frame's "Update Autopay"
                           state exactly. It can still be turned off, and then
                           the space just shows its schedule. */
                        setEnrolledNow((prev) => flip(prev, sp.id));
                        if (!sp.autopay.cardLast4) {
                          setUpdateMethod((prev) => {
                            const next = new Set(prev);
                            next.add(sp.id);
                            return next;
                          });
                        }
                      }
                    }}
                    className="ma-autopay__check"
                  >
                    <span className="ma-autopay__enrollLabel">
                      Autopay Enrollment
                      <InfoFilledIcon className="ma-autopay__info" />
                    </span>
                  </Checkbox>
                </div>
                {justCancelled && (
                  <div className="ma-autopay__notice">
                    <InfoNoticeIcon className="ma-autopay__noticeIcon" />
                    <p>{AUTOPAY_CANCELLED_NOTE}</p>
                  </div>
                )}
              </div>
            )}

            <div className="ma-lines">
              {sp.lines.map((line) => (
                <div className="ma-line" key={line.label}>
                  <p className="ma-line__label">
                    <span className="ma-line__strong">{line.label} </span>
                    {line.note && <span className="ma-line__note">{line.note}</span>}
                  </p>
                  <p className="ma-line__amount ma-line__amount--strong">{line.amount}</p>
                </div>
              ))}

              <div className="ma-line">
                <p className="ma-line__label ma-line__label--plain">{sp.coverage.label}</p>
                <div className="ma-line__right">
                  <button type="button" className="ma-link-row ma-link-row--tight">
                    <ShieldSettingsIcon />
                    <span className="ma-link">
                      <span className="ma-only-desktop">Change Coverage</span>
                      <span className="ma-only-mobile">Change</span>
                    </span>
                  </button>
                  <p className="ma-line__amount">{sp.coverage.amount}</p>
                </div>
              </div>

              <div className="ma-line">
                <p className="ma-line__label ma-line__label--plain">{sp.taxes.label}</p>
                <p className="ma-line__amount">{sp.taxes.amount}</p>
              </div>

              <div className="ma-line ma-line--total">
                <p className="ma-line__label ma-line__label--total">Total:</p>
                <p className="ma-line__amount ma-line__amount--total">{sp.total}</p>
              </div>
            </div>
            </div>
          </div>
        );
      })}

      {/* Mobile only — hidden by the stylesheet on desktop, where the frame has
          no such control and there is room for every row. */}
      <button
        type="button"
        className="ma-billing-toggle"
        aria-expanded={billingOpen}
        onClick={() => setBillingOpen((v) => !v)}
      >
        <span>{billingOpen ? 'Hide Billing Details' : 'Show Billing Details'}</span>
        {/* The 24px export, not the 32px one scaled — both frames draw this
            chevron at 24, and a 32px stroke squeezed down is a thinner line
            than the one Payment Activity shows below it. */}
        <ChevronBigRight24Icon className={`ma-billing-toggle__chev${billingOpen ? ' ma-billing-toggle__chev--up' : ''}`} />
      </button>

      <div className="ma-balance">
        <div className="ma-balance__left">
          <div className="ma-balance__heading">
            <span className="ma-balance__title">Balance Due</span>
            <InfoIcon size={16} className="ma-balance__info" />
          </div>
          <p className="ma-balance__through">{payThrough}</p>
        </div>

        <div className="ma-balance__prepay">
          <Checkbox checked={prepay} onChange={setPrepay} className="ma-balance__check">
            Prepay Additional Month(s)
          </Checkbox>

          {/* Only once prepay is on: a stepper for something you have not opted
              into is a control with nothing to control. */}
          {prepay && (
            <div className="ma-stepper">
              <button
                type="button"
                className="ma-stepper__btn"
                aria-label="One month fewer"
                onClick={() => setPrepayMonths((n) => Math.max(1, n - 1))}
              >
                <MinusIcon />
              </button>
              <button
                type="button"
                className="ma-stepper__btn"
                aria-label="One month more"
                onClick={() => setPrepayMonths((n) => n + 1)}
              >
                <PlusIcon />
              </button>
              <output className="ma-stepper__value">{prepayMonths}</output>
              <span className="ma-stepper__unit">Month(s)</span>
            </div>
          )}
        </div>

        <div className="ma-balance__right">
          <p className="ma-balance__amount">{formatMoney(balanceTotal)}</p>
          {anyPastDue && <p className="ma-balance__past">Past Due</p>}
        </div>
      </div>

      {/* 2×2. Not the kit <Button/>: these are 64px tiles with a 12px radius
          and a 20px label, which is a different control, not a restyled one.

          Wallets always sit at the top. The two method tiles only share that
          grid while NEITHER is open — once one is, the open panel takes their
          place and the other method moves below it, exactly as #99's step 2
          does with the same forms. */}
      <div className="ma-methods">
        <button type="button" className="ma-method ma-method--dark">
          <GooglePayLockup />
        </button>
        <button type="button" className="ma-method ma-method--dark">
          <span className="ma-applepay" role="img" aria-label="Apple Pay">
            <ApplePayMark />
          </span>
        </button>
        {!methodOpen && (
          <>
            <button
              type="button"
              className="ma-method ma-method--outline"
              onClick={() => selectMethod('card')}
            >
              <CreditCardIcon />
              <span>Credit / Debit</span>
            </button>
            <button
              type="button"
              className="ma-method ma-method--outline"
              onClick={() => selectMethod('bank')}
            >
              <BankIcon />
              <span>Pay by Bank</span>
            </button>
          </>
        )}
      </div>

      {/* The forms are #99's, from `@shared/paymentForms` — same fields, same
          validation, same "Pay Now $X". Only the total differs: here it is the
          selected spaces' balance rather than a move-in cost. Preceded by the
          same skeleton beat (8507-24610) so the panel does not snap in. */}
      {methodOpen && (
        <section
          className="rf-method-panel ma-payform"
          aria-label={payMethod === 'card' ? 'Credit / Debit' : 'Pay by Bank'}
        >
          <header className="rf-method-panel-head">
            {payMethod === 'card' ? <CreditCardIcon /> : <BankIcon />}
            <span>{payMethod === 'card' ? 'Credit / Debit' : 'Pay by Bank'}</span>
          </header>

          {formLoading ? (
            <PaymentFormSkeleton rows={payMethod === 'bank' ? 3 : 2} />
          ) : payMethod === 'card' ? (
            <CardForm total={balanceTotal} onPay={pay} />
          ) : (
            <BankForm total={balanceTotal} onPay={pay} />
          )}
        </section>
      )}

      {/* The method NOT open, relocated below the panel — full width, since it
          no longer shares a row. */}
      {methodOpen && (
        <button
          type="button"
          className="ma-method ma-method--outline ma-method--alt"
          onClick={() => selectMethod(payMethod === 'card' ? 'bank' : 'card')}
        >
          {payMethod === 'card' ? <BankIcon /> : <CreditCardIcon />}
          <span>{payMethod === 'card' ? 'Pay by Bank' : 'Credit / Debit'}</span>
        </button>
      )}
    </section>
  );
}
