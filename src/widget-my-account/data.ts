// ===========================================================================
// Static demo content for #19, lifted from four Figma frames:
//   • 8815-115354  "Account Info - Display"        → the DEFAULT left panel
//   • 9030-31458   "Screen after Login (1 Space)"  → the Make a Payment panel
//   • 8815-117093  one property card, TWO units    → the sidebar
//   • 8884-131918  "Payment Activity" expanded     → the accordion's table
//   • 8815-115876  the Edit panel                  → the form behind "Edit"
//
// SHAPE: a tenant rents UNITS; units sit at a PROPERTY. The sidebar draws one
// card per property — its photo once at the top, then every unit it holds
// stacked beneath, each with its own balance strip. Selecting a unit rings it
// and opens its details on the left. One unit at one property collapses back
// to the single-unit card the first two frames draw, with no special case.
//
// NO-DEMO-MONEY note: every figure here is a DESIGN SAMPLE and is meant to be.
// There is no account API behind this widget yet, so nothing claims to be a
// real balance. When the endpoints land, this module is the only one to change.
//
// TWO KINDS OF CONTENT, kept apart deliberately:
//
//   #41 is VERBATIM from the frames, inconsistencies and all, because they are
//   in the design and silently "fixing" them would hide them from whoever
//   signs it off:
//     • the unit is #41 in the sidebar and the Account Info heading, but the
//       payment screen heads it #310 and bills "Monthly Rent #301".
//     • the payment screen totals $123.00 while its balance box reads $350.00.
//     • The frame's "1rst of each month" is a typo and is CORRECTED to "1st"
//       here — the one place the design is not followed literally, because a
//       misspelling is a defect rather than a decision.
//     • the primary contact is sneha@storelocal.com in the panel but
//       sneha.jose@storelocal.com in the signed-in line above it.
//     • Payment Activity's first row bills a space "#305" that is not in the
//       design's own data.
//
//   #42 is INVENTED — the frame draws its second unit as another copy of #41,
//   and Macauley asked for it to differ. It is internally CONSISTENT on
//   purpose: same number everywhere, a total that matches its balance. It also
//   deliberately exercises the branches #41 leaves untested — not enrolled in
//   autopay, no alternate contact, nothing past due, a different document set.
// ===========================================================================

export interface MoneyLine {
  /** Bold lead text — "Monthly Rent #301". */
  label: string;
  /** Regular text after the label, e.g. the billing period in brackets. */
  note?: string;
  /** Pre-formatted, so "$ 100.00" and "$123.00" can differ exactly as designed. */
  amount: string;
}

export interface AutopayInfo {
  enrolled: boolean;
  cardLast4: string;
  /** Free text — "Charged on the 1st of each month". */
  schedule: string;
}

export interface BalanceDue {
  amount: string;
  payThrough: string;
  pastDue: boolean;
}

export interface Contact {
  name: string;
  email?: string;
  phone?: string;
  /** Rendered one line per entry, as the frame wraps it. */
  address?: string[];
  /** Primary contact only — "Drivers License: xxxx 8476". */
  licence?: string;
}

export interface AccountDocument {
  label: string;
  /** Pill to the right. Absent → no pill, as on the frame's last two rows. */
  status?: string;
}

export interface SpaceProperty {
  id: string;
  name: string;
  address: string;
  phone: string;
}

/** The sidebar card's unit block. */
export interface SpaceUnit {
  /** "5’ x 7’ I Climate Controlled" — the pipe is the designer's separator. */
  size: string;
  features: string[];
  balanceAmount: string;
  balanceDate: string;
}

export interface AccountSpace {
  id: string;
  /** Which property's card this unit stacks into. */
  propertyId: string;
  /** "#41" — as printed, hash included. Heads the unit block. */
  number: string;
  /** "Space #41" — the Account Info panel's heading. */
  title: string;

  unit: SpaceUnit;

  /* ── Account Info view (8815-115354) ────────────────────────────────── */
  primaryContact: Contact;
  alternateContact?: Contact;
  documents: AccountDocument[];
  /** "Balance Due (Due Jun 5,2026)" — the due date is baked into the label. */
  dueLabel: string;
  dueAmount: string;

  /* ── Make a Payment view (9030-31458) ───────────────────────────────── */
  /** #41's payment screen heads the space #310 rather than #41. Verbatim. */
  paymentNumber: string;
  paymentAddress: string;
  autopay: AutopayInfo;
  lines: MoneyLine[];
  /** Carries a "Change Coverage" action; nothing else in the list does. */
  coverage: MoneyLine;
  taxes: MoneyLine;
  total: string;
  balance: BalanceDue;
}

/** One row of the Payment Activity table (8884-131918). */
export interface ActivityRow {
  date: string;
  /** "xxxxx 7468" or "Cash". */
  method: string;
  /** A payment can cover more than one space — the frame's first row does. */
  spaces: string[];
  /** …and therefore more than one invoice. Rendered as links. */
  invoices: string[];
  amount: string;
  balance: string;
}

export const USER = {
  firstName: 'Sneha',
  email: 'sneha.jose@storelocal.com',
};

/** The promo card swaps with the view. Both frames carry the same body copy. */
const PROMO_BODY = 'Qorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc vulputate '
  + 'libero et velit interdum, ac aliquet odio mattis. Class aptent';

/** Default view — the tenant is not on autopay yet, so the card sells it. */
export const PROMO_AUTOPAY = {
  title: 'Enroll in Autopay',
  body: PROMO_BODY,
  cta: 'Enroll',
};

/** Payment view — by then the autopay panel reads "Enrolled", so this sells supplies. */
export const PROMO_SUPPLIES = {
  title: 'Stock up on Storage Supplies',
  body: PROMO_BODY,
  cta: 'Shop Now',
};

export const PROPERTIES: SpaceProperty[] = [
  {
    id: 'prop-3rd-street',
    name: '3rd Street Storage',
    address: '1301 E. Mission Ave, Fullerton, CA 02027',
    phone: '(877) 657-7465',
  },
];

/** The tenant's primary contact — the same person on every unit they rent. */
const SNEHA: Contact = {
  name: 'Sneha Jose',
  email: 'sneha@storelocal.com',
  phone: '(877) 657-7465',
  address: ['1301 E. Mission Ave,', 'Fullerton, CA 02027'],
  licence: 'Drivers License: xxxx 8476',
};

export const SPACES: AccountSpace[] = [
  /* ── #41 — VERBATIM from the frames ──────────────────────────────────── */
  {
    id: 'space-41',
    propertyId: 'prop-3rd-street',
    number: '#41',
    title: 'Space #41',

    unit: {
      size: '5’ x 7’ I Climate Controlled',
      features: ['24 Hour Access', 'Drive Up', 'Near Entrances', 'No Late Fees'],
      balanceAmount: '$123.00',
      balanceDate: 'Apr 20, 2026',
    },

    primaryContact: SNEHA,
    alternateContact: {
      name: 'Jerry Boo',
      address: ['635 Water Way', 'Los Angeles, CA 90210'],
      email: 'Jerry@storelocal.com',
      phone: '(988) 873-9387',
    },
    documents: [
      { label: 'Lease Agreement', status: 'Signed' },
      { label: 'Tenant Protection', status: 'Signed' },
      { label: 'Autopay Enrollment', status: 'Signed' },
      { label: 'Rules & Regulations' },
      { label: 'Insurance Brochure' },
    ],
    dueLabel: 'Balance Due (Due Jun 5,2026)',
    dueAmount: '$123.00',

    paymentNumber: '#310',
    paymentAddress: '1301 E. Mission Ave, Fullerton, CA 02027',
    autopay: {
      enrolled: true,
      cardLast4: '8746',
      schedule: 'Charged on the 1st of each month',
    },
    lines: [
      { label: 'Monthly Rent #301', note: '(06/01/2026 to 06/30/2026)', amount: '$ 100.00' },
    ],
    coverage: { label: 'Coverage', amount: '$ 13.00' },
    taxes: { label: 'Taxes', amount: '$ 10.00' },
    total: '$123.00',
    balance: {
      amount: '$350.00',
      payThrough: 'Pay through 06/30/2026',
      pastDue: true,
    },
  },

  /* ── #42 — INVENTED, and deliberately unlike #41 ─────────────────────── */
  {
    id: 'space-42',
    propertyId: 'prop-3rd-street',
    number: '#42',
    title: 'Space #42',

    unit: {
      size: '10’ x 10’ I Drive Up Access',
      features: ['24 Hour Access', 'Ground Floor', 'Vehicle Parking', 'Wide Aisle'],
      balanceAmount: '$248.00',
      balanceDate: 'May 03, 2026',
    },

    primaryContact: SNEHA,
    // No alternate contact on this one — the panel's optional block, exercised.
    documents: [
      { label: 'Lease Agreement', status: 'Signed' },
      { label: 'Rules & Regulations' },
    ],
    dueLabel: 'Balance Due (Due Jul 1,2026)',
    dueAmount: '$248.00',

    paymentNumber: '#42',
    paymentAddress: '1301 E. Mission Ave, Fullerton, CA 02027',
    autopay: {
      enrolled: false,
      /* A card IS on file — autopay is simply switched off. That is an
         ordinary situation, and it is what lets this space show the same
         "Charged to" line as #41 once the tenant enrols it. */
      cardLast4: '4021',
      /* Shown once the tenant enrols this space during a payment, so it is
         a schedule and not the sell line it used to be. */
      schedule: 'Charged on the 1st of each month',
    },
    lines: [
      { label: 'Monthly Rent #42', note: '(07/01/2026 to 07/31/2026)', amount: '$ 215.00' },
    ],
    coverage: { label: 'Coverage', amount: '$ 23.00' },
    taxes: { label: 'Taxes', amount: '$ 10.00' },
    total: '$248.00',
    balance: {
      amount: '$248.00',
      payThrough: 'Pay through 07/31/2026',
      pastDue: false,
    },
  },
];

/**
 * The Edit panel's form (8815-115876). Separate from the display data above
 * because the frame edits DIFFERENT values than it displays — a mailing
 * address in Laguna Beach against a contact address in Fullerton, and an
 * alternate contact "Betty Boo" where the display panel reads "Jerry Boo".
 * Reproduced as drawn; see the header note.
 */
/**
 * One person on the account. The Edit panel draws this shape twice — the
 * alternate contact and the emergency contact — with its own "apply to all
 * spaces" tick each, because they are separate people and a tenant may well
 * want one copied across their spaces and not the other.
 */
export interface ContactForm {
  first: string;
  last: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  applyToAll: boolean;
}

export interface EditForm {
  /* Mailing address. */
  country: string;
  address: string;
  city: string;
  state: string;
  zip: string;

  /* Drivers licence. `usePassport` swaps the ID being provided; the frame
     draws it unticked with the licence fields filled. */
  usePassport: boolean;
  licenceNumber: string;
  licenceState: string;
  licenceExpiry: string;

  /* Communication preferences — both ticked in the frame. */
  marketingEmails: boolean;
  textMessages: boolean;

  alternate: ContactForm;
  emergency: ContactForm;
}

/**
 * The countries the address fields offer. Same pair the rental flow (#99)
 * offers, and the same pair `CUSTOMER_ADDRESS_COUNTRIES` scopes address
 * lookups to — one list, so a country you can pick here is a country the
 * lookup can complete.
 */
export const EDIT_COUNTRIES = ['United States', 'Canada'];

/* The frame fills the alternate and emergency contacts with the SAME person.
   Reproduced rather than varied: inventing a second name would be inventing
   content, and the repetition is the designer's, not an oversight here. */
const CONTACT_DEFAULT: ContactForm = {
  first: 'Betty',
  last: 'Boo',
  email: 'Betty@boo.com',
  phone: '+91 938 938 9387',
  country: 'United States',
  address: '435 Woodland Drive',
  city: 'Laguna Beach',
  state: 'CA',
  zip: '92651',
  applyToAll: false,
};

export const EDIT_DEFAULTS: EditForm = {
  /* Laguna Beach, while the display panel's address is Fullerton — the frames
     disagree and both are reproduced as drawn. See the header note. */
  country: 'United States',
  address: '435 Woodland Drive',
  city: 'Laguna Beach',
  state: 'CA',
  zip: '92651',

  usePassport: false,
  licenceNumber: '7736372728',
  /* Spelled out here and abbreviated in the addresses above — the frame does
     both, so both are kept. */
  licenceState: 'California',
  licenceExpiry: '02/02/2031',

  marketingEmails: true,
  textMessages: true,

  alternate: { ...CONTACT_DEFAULT },
  emergency: { ...CONTACT_DEFAULT },
};

export const AUTOPAY_UPDATE_NOTE =
  'Autopay will be updated to the payment method used in this transaction.';
export const AUTOPAY_CANCELLED_NOTE =
  'Autopay cancelled. We recommend to stay enrolled to avoid late fees.';

/**
 * Payment Activity (8884-131918). Account-wide, not per-unit — the frame's
 * rows name different spaces, and its first row is one payment covering two.
 */
export const PAYMENT_ACTIVITY: ActivityRow[] = [
  {
    date: '06/15/2026',
    method: 'xxxxx 7468',
    // "#305" is not a space in the design's own data. Verbatim; see the header.
    spaces: ['#41', '#305'],
    invoices: ['#763537828', '#873636882'],
    amount: '$123.00',
    balance: '$0.00',
  },
  { date: '06/15/2026', method: 'Cash', spaces: ['#41'], invoices: ['#763537828'], amount: '$50.00', balance: '$60.00' },
  { date: '06/15/2026', method: 'xxxxx 9837', spaces: ['#41'], invoices: ['#763537828'], amount: '$123.00', balance: '$0.00' },
  { date: '06/15/2026', method: 'xxxxx 7468', spaces: ['#41'], invoices: ['#763537828'], amount: '$123.00', balance: '$0.00' },
  { date: '06/15/2026', method: 'xxxxx 7468', spaces: ['#41'], invoices: ['#763537828'], amount: '$123.00', balance: '$0.00' },
  { date: '06/15/2026', method: 'xxxxx 7468', spaces: ['#41'], invoices: ['#763537828'], amount: '$123.00', balance: '$0.00' },
];
