"use client";

import { useState } from "react";
import { getLocale, setChosenLanguage, type Locale } from "@/lib/i18n";

// Row 218. A Georgian speaker whose phone is set to English got an English
// app and had nowhere to say otherwise. Everything deciding the language was
// a guess about the person — the handset's country, the browser's setting —
// or the server's reading of what they write, which is a better guess but
// still a guess.
//
// This is the one place that is not a guess, so it outranks all of them. It
// only ever holds a choice somebody actually made: until the button is
// pressed there is no stored value, and the server's reading keeps winning.

const L: Record<Locale, { title: string; sub: string; ka: string; en: string }> = {
  en: {
    title: "Language",
    sub: "Until you choose, the app follows the language you write in.",
    ka: "ქართული",
    en: "English",
  },
  ka: {
    title: "ენა",
    sub: "სანამ არ აირჩევ, აპი მიჰყვება იმ ენას, რომელზეც წერ.",
    ka: "ქართული",
    en: "English",
  },
};

export default function LanguageCard() {
  const [current, setCurrent] = useState<Locale>(getLocale());
  const s = L[current];

  const pick = (loc: Locale) => {
    if (loc === current) return;
    setChosenLanguage(loc);
    setCurrent(loc);
    // The strings are read at render time across the whole app, so a reload is
    // the honest way to apply it everywhere at once rather than leaving half
    // the screens in the old language until they next happen to re-render.
    window.location.reload();
  };

  // 13 Oct (FIXED2): the drawer's segmented control. Its section heading
  // is drawn by the profile, so this is the control alone.
  return (
    <div className="pd-seg" role="group" aria-label={s.title}>
      {(["ka", "en"] as const).map((loc) => (
        <button key={loc} type="button" onClick={() => pick(loc)} aria-pressed={current === loc}>
          {s[loc]}
        </button>
      ))}
    </div>
  );
}
