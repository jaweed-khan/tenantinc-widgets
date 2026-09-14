// ===========================================================================
// Payment method selection — Figma nodes 10080-28749 (Pay by Bank) and
// 10080-30277 (Credit / Debit).
//
// Both frames are the same layout with one panel expanded: the chosen method
// becomes a bordered panel (2px --hb-cta) containing its form and its own
// "Pay Now $X" button, and the other collapses to a 2px dark outline button.
// So this is ONE component with `selected` state, not two screens.
//
// The forms themselves now live in `@shared/paymentForms` — #19's My Account
// takes a payment against the same design, so they are shared rather than
// copied. What stays here is only this widget's chrome around them.
// ===========================================================================

import React, { useState } from 'react';
import { CardForm, BankForm } from '@shared/paymentForms';
import { BankIcon, CreditCardIcon, CheckTick, InfoIcon } from './icons';

export type PayMethod = 'googlepay' | 'applepay' | 'card' | 'bank' | null;

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
