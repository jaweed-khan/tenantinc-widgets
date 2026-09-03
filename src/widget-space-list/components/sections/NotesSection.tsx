import React from 'react';
import { RichText } from '@shared/richText';

// Notes — free-text copy authored in the Duda content menu (`notesContent`).
//
// Was a grey card that also carried a hardcoded "Visit our other
// location here: www.propertylandingpage.com" block — demo placeholder with a fake
// URL and href="#". Both removed, so the accordion shows only what the editor
// actually wrote. Demo copy below still covers an unconfigured instance.
const NOTE_TEXT =
  'This facility offers a range of unit sizes to fit your needs, from small ' +
  'lockers to large drive-up units. Our friendly on-site team is happy to help ' +
  'you find the right space and answer any questions before your move-in date. ' +
  'Reservations are held for 7 days and there is no obligation to rent.';

/** `content` comes from the Duda content menu; blank falls back to the demo copy. */
export function NotesSection({ content }: { content?: string } = {}) {
  const text = (content ?? '').trim() || NOTE_TEXT;

  return (
    <section className="sl-section sl-section--notes">
      {/* HTML is parsed; plain text still becomes blank-line paragraphs. */}
      <RichText value={text} className="sl-notes-text" />
    </section>
  );
}
