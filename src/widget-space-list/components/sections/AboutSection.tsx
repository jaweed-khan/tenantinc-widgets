import React from 'react';
import { RichText } from '@shared/richText';

// About — free-text copy about the location, editable from the Duda content
// menu (`aboutContent`). Renders nothing when there's no copy, so an
// unconfigured instance shows an empty body rather than placeholder text
// pretending to be real.
//
// Bare text, matching Notes. It used to sit in the grey .sl-notes-card, on the
// grounds of reusing "the Notes card treatment so the two read as a pair" —
// but Notes had already dropped that card, so the reasoning had outlived
// itself and the pair read as two different things. The card was left with one
// user and is gone with it.

export function AboutSection({ content }: { content?: string }) {
  const text = (content ?? '').trim();
  if (!text) return null;

  return (
    <section className="sl-section sl-section--about">
      {/* HTML is parsed; plain text still becomes blank-line paragraphs. */}
      <RichText value={text} className="sl-notes-text" />
    </section>
  );
}
