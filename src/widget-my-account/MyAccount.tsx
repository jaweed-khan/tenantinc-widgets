// ===========================================================================
// Widget #19 — My Account
//
// The signed-in account screen. THREE panels over the same data, sharing one
// slot; the greeting, promo and sidebar stay put and only the middle panel
// swaps. The Payment Activity accordion belongs to the BILL PAY panel and
// appears only there:
//
//   'account'  Figma 8815-115354 "Account Info - Display"  — THE DEFAULT.
//              Promo sells autopay; the panel shows contacts and documents.
//              "Pay Now" → 'payment'.  "Edit" → 'edit'.
//   'payment'  Figma 9030-31458  "Screen after Login (1 Space)".
//              Promo sells supplies; the panel takes the payment.
//   'edit'     Figma 8815-115876. The account/mailing/alternate form.
//              Cancel and Save both return to 'account'.
//
// Every route back to 'account' goes through one place — a unit's "Account
// Info" button, Cancel, Save, or picking a different unit — so there is no
// screen you can reach and not get out of.
//
// SELECTION: whichever sidebar unit is picked rings itself in the frame's
// Primary/Notifications orange and opens its details on the left. The frames
// draw one property; the code carries a list of properties, each holding a
// list of units, so more of either works.
//
// SCOPE: both frames also contain the site nav and footer. Those are #02 and
// #13 and are deliberately NOT reproduced — a Duda page composes them around
// this widget, as it does for every other page-level widget.
//
// EVERYTHING IS STATIC. `data.ts` holds both frames' sample content; there is
// no account API behind this yet. That is why the numbers do not reconcile —
// they are the designer's placeholders, reproduced as drawn rather than
// quietly rationalised. See the note at the top of data.ts.
//
// Every class is `ma-`. Each widget is its own AMD bundle and cannot reach
// another's stylesheet, but they DO share the page, where a class name is
// global — #18's header comment records what happened when two widgets shared
// a prefix.
// ===========================================================================

import { useState } from 'react';
import './MyAccount.css';
import { Button } from '@shared/ui';
import { AccountInfoPanel } from './AccountInfoPanel';
import { EditPanel } from './EditPanel';
import { MakePaymentPanel } from './MakePaymentPanel';
import { PaymentActivity } from './PaymentActivity';
import { PropertyCard } from './PropertyCard';
import { PAYMENT_ACTIVITY, PROMO_AUTOPAY, PROMO_SUPPLIES, PROPERTIES, SPACES, USER } from './data';

/** The three panels that share the middle slot. */
export type View = 'account' | 'payment' | 'edit';

export interface MyAccountProps {
  /**
   * First name for the greeting — "Hi {name},". Defaults to the frames' own
   * sample so the widget renders as designed with no props at all.
   */
  userName?: string;
  /** Shown opposite the greeting: "You're logged in as {email}". */
  userEmail?: string;
  /** Content-panel overrides for the promo card. Blank falls back. */
  promoTitle?: string;
  promoBody?: string;
  promoCta?: string;
  /** Where the promo's button goes. Omitted → a button that does nothing yet. */
  promoUrl?: string;
  /**
   * Opens on the payment screen instead of Account Info. For the harness and
   * for a "Pay Bill" link that should land straight on it; the DEFAULT is the
   * account view. 'edit' is reachable from the panel, not normally a landing.
   */
  initialView?: View;
}

/** A Duda text field arrives as '' until the editor types, which a default
 *  parameter will not catch — so fall back on the trimmed value, not on
 *  `undefined`. Same helper shape as #05's junk-fee copy. */
const orElse = (v: string | undefined, fallback: string) => (v?.trim() ? v.trim() : fallback);

export function MyAccount({
  userName,
  userEmail,
  promoTitle,
  promoBody,
  promoCta,
  promoUrl,
  initialView = 'account',
}: MyAccountProps) {
  const [view, setView] = useState<View>(initialView);
  const [selectedId, setSelectedId] = useState(SPACES[0]?.id);
  const [activityOpen, setActivityOpen] = useState(false);

  const space = SPACES.find((s) => s.id === selectedId) ?? SPACES[0];
  /* Make a Payment lists EVERY space with something outstanding, not just the
     one whose Pay Now was clicked — see the panel's header note. A space with a
     zero balance has nothing to pay and would only be an unticked distraction. */
  const outstanding = SPACES.filter((s) => s.balance.amount.replace(/[^0-9.]/g, '') !== ''
    && Number(s.balance.amount.replace(/[^0-9.-]/g, '')) > 0);

  /* The ONE selection action, shared by a unit block and its "Account Info"
     button — which is what links them. Picking a unit always shows ITS account
     info, never the payment screen of whichever unit happened to be open, so
     from the payment screen this doubles as the way back. */
  const selectUnit = (id: string) => {
    setSelectedId(id);
    // Never lands on the payment or edit screen of whichever unit happened to
    // be open, so from either of those this doubles as the way back.
    setView('account');
  };

  /* The button is on every block when there is more than one unit, because it
     is how you switch between them; on a lone unit it appears only on the
     payment screen, as the way back. That is exactly what the three frames
     draw — 8815-117093 has two buttons, 8815-115354 none, 9030-31458 one. */
  const showAccountInfo = SPACES.length > 1 || view !== 'account';

  const name = orElse(userName, USER.firstName);
  const email = orElse(userEmail, USER.email);

  /* The promo swaps with the view — autopay on the default screen, supplies on
     the payment screen, as the two frames draw them. An editor override wins
     over both, which is why it is applied here and not in data.ts. */
  const promo = view === 'payment' ? PROMO_SUPPLIES : PROMO_AUTOPAY;
  const promoLabel = orElse(promoCta, promo.cta);

  return (
    <div className="ma-wrapper">
      <div className="ma-grid">
        <h1 className="ma-greeting">Hi {name},</h1>
        <p className="ma-logged-in">You’re logged in as {email}</p>

        <div className="ma-main">
          <section className="ma-promo">
            <div className="ma-promo__text">
              <h2 className="ma-promo__title">{orElse(promoTitle, promo.title)}</h2>
              <p className="ma-promo__body">{orElse(promoBody, promo.body)}</p>
            </div>
            {promoUrl
              ? <Button tone="cta" href={promoUrl} className="ma-btn-40">{promoLabel}</Button>
              : <Button tone="cta" className="ma-btn-40">{promoLabel}</Button>}
          </section>

          {view === 'account' && (
            <AccountInfoPanel
              space={space}
              onPayNow={() => setView('payment')}
              onEdit={() => setView('edit')}
            />
          )}
          {view === 'payment' && (
            <MakePaymentPanel
              spaces={outstanding.length ? outstanding : [space]}
              space={space}
            />
          )}
          {view === 'edit' && (
            <EditPanel
              space={space}
              onCancel={() => setView('account')}
              // Nothing to persist while the account API is absent — Save
              // returns to the display panel rather than pretending to write.
              onSave={() => setView('account')}
            />
          )}

          {/* BILL PAY ONLY. It is a record of payments, which belongs beside
              the screen that takes one — on Account Info and Edit it was just
              a second thing competing with the panel's own purpose. */}
          {view === 'payment' && (
            <PaymentActivity
              rows={PAYMENT_ACTIVITY}
              open={activityOpen}
              onToggle={() => setActivityOpen((v) => !v)}
            />
          )}
        </div>

        <aside className="ma-side">
          {/* One card per property, holding every unit rented there. Properties
              with no units are skipped rather than drawn empty. */}
          {PROPERTIES.map((property) => {
            const units = SPACES.filter((s) => s.propertyId === property.id);
            if (units.length === 0) return null;
            return (
              <PropertyCard
                key={property.id}
                property={property}
                units={units}
                selectedId={selectedId}
                onSelect={selectUnit}
                showAccountInfo={showAccountInfo}
              />
            );
          })}
          <Button tone="cta" block className="ma-btn-40 ma-add">+ Add a Space</Button>
        </aside>
      </div>
    </div>
  );
}
