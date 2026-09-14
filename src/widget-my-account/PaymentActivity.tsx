// ===========================================================================
// Payment Activity — the collapsed bar (both screen frames) and its expanded
// table (8884-131918).
//
// Account-wide, not per-unit: the frame's rows name different spaces, and its
// first row is a single payment covering two of them, so a row carries arrays
// of spaces and invoices rather than one of each.
//
// ON THE COLUMN POSITIONS: the frame absolutely-positions every cell, and its
// header labels sit up to 11px off the row values beneath them (e.g. "Payment
// Method" at 151 over a value at 162). Copying those offsets would misalign
// the table for any data but the sample's, so header and rows share ONE grid,
// sized from the frame's row positions — which are the authoritative ones.
// ===========================================================================

import { ChevronBigRightIcon } from './icons';
import type { ActivityRow } from './data';

export function PaymentActivity({
  rows,
  open,
  onToggle,
}: {
  rows: ActivityRow[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="ma-activity">
      <button
        type="button"
        className="ma-activity__bar"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="ma-activity__title">Payment Activity</span>
        <span className={`ma-activity__chev${open ? ' ma-activity__chev--open' : ''}`}>
          <ChevronBigRightIcon />
        </span>
      </button>

      {open && (
        <div className="ma-activity__body">
          {rows.length === 0 ? (
            /* No activity endpoint yet. Inventing rows in front of a signed-in
               customer would show them payments that never happened. */
            <p className="ma-activity__empty">No payment activity to show yet.</p>
          ) : (
            /* A real table, not a grid of divs: this IS tabular data, and the
               header association is what a screen reader needs to read a row
               out. `.ma-act` cells carry the frame's column widths. */
            <div className="ma-act__scroll">
              <table className="ma-act">
                <thead>
                  <tr className="ma-act__head">
                    <th scope="col">Payment Date</th>
                    <th scope="col">Payment Method</th>
                    <th scope="col">Space #</th>
                    <th scope="col">Invoice #</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    // The sample repeats the same date and invoice across rows,
                    // so neither is unique enough for a key on its own.
                    <tr key={`${r.date}-${r.method}-${r.amount}-${i}`}>
                      <td>{r.date}</td>
                      <td>{r.method}</td>
                      <td>
                        {r.spaces.map((s) => <span key={s} className="ma-act__line">{s}</span>)}
                      </td>
                      <td>
                        {r.invoices.map((inv) => (
                          // A real <a> once the invoice endpoint exists; a
                          // button today, so it focuses and announces properly
                          // without a dead href.
                          <button type="button" key={inv} className="ma-act__invoice">{inv}</button>
                        ))}
                      </td>
                      <td className="ma-act__amount">{r.amount}</td>
                      <td>{r.balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
