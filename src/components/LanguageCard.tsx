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

  return (
    <div className="card flex flex-col gap-3">
      <div>
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.title}</h2>
        <p className="mt-0.5" style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{s.sub}</p>
      </div>
      <div className="flex gap-2">
        {(["ka", "en"] as const).map((loc) => (
          <button
            key={loc}
            type="button"
            onClick={() => pick(loc)}
            aria-pressed={current === loc}
            className="rounded-xl px-4 py-2"
            style={{
              fontSize: "13px",
              fontWeight: 600,
              border: "1px solid var(--sidebar-border)",
              background: current === loc ? "var(--ink)" : "transparent",
              color: current === loc ? "var(--bg)" : "var(--ink)",
            }}
          >
            {s[loc]}
          </button>
        ))}
      </div>
    </div>
  );
}
