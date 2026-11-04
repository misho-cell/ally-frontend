"use client";

import { useEffect, useState } from "react";
import { getLocale } from "@/lib/i18n";
import { lastKeyboardTrace, summariseTrace, type KbTrace } from "@/lib/keyboardTrace";

// #8385 (4 Nov). The keyboard counterpart of the push and microphone cards:
// the case header "jumps" on an iPhone and on nothing else, so the phone
// measures it (lib/keyboardTrace) and this card shows the last measurement
// in a form a tester can screenshot. Header travel 0 px means it held still.

const L = {
  en: {
    title: "Keyboard diagnostics",
    hint: "In the home-screen app, open a long case chat, tap the text field, then close the keyboard. Come back here and screenshot this.",
    header: "Header moved",
    offset: "Viewport offset (max)",
    height: "Visible height",
    frames: "Frames recorded",
    installed: "Added to home screen",
    lastTry: "Last attempt",
    never: "nothing recorded yet",
    noHeader: "no header seen",
    yes: "yes",
    no: "no",
  },
  ka: {
    title: "კლავიატურის დიაგნოსტიკა",
    hint: "მთავარ ეკრანზე დამატებულ აპში გახსენი გრძელი ჩატი, დააჭირე ტექსტის ველს, მერე დახურე კლავიატურა. დაბრუნდი აქ და გადაუღე ამას სქრინშოტი.",
    header: "სათაურის მოძრაობა",
    offset: "წანაცვლება (მაქს.)",
    height: "ხილული სიმაღლე",
    frames: "ჩაწერილი კადრები",
    installed: "მთავარ ეკრანზე დამატებული",
    lastTry: "ბოლო ცდა",
    never: "ჯერ არაფერი ჩაწერილა",
    noHeader: "სათაური არ ჩანდა",
    yes: "კი",
    no: "არა",
  },
};

export default function KeyboardDiagnostics() {
  const s = L[getLocale()];
  // Read after mount: localStorage does not exist on the server.
  const [trace, setTrace] = useState<KbTrace | null | undefined>(undefined);
  useEffect(() => {
    const id = requestAnimationFrame(() => setTrace(lastKeyboardTrace()));
    return () => cancelAnimationFrame(id);
  }, []);
  if (trace === undefined) return null;

  const row = (k: string, v: string, warn = false) => (
    <div className="flex items-baseline justify-between gap-4">
      <span style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{k}</span>
      <span className="text-right" style={{ fontSize: "13px", color: warn ? "var(--danger)" : "var(--ink)", overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );

  const sum = trace ? summariseTrace(trace) : null;
  return (
    <div className="card flex flex-col gap-2">
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.title}</h2>
      <p style={{ fontSize: "12px", color: "var(--meta)" }}>{s.hint}</p>
      <div className="flex flex-col gap-1.5" style={{ marginTop: "4px" }}>
        {!trace || !sum ? (
          row(s.lastTry, s.never)
        ) : (
          <>
            {row(s.header, sum.headerTravel === null ? s.noHeader : `${sum.headerTravel} px`, (sum.headerTravel ?? 0) > 2)}
            {row(s.offset, `${sum.maxOffset} px`)}
            {row(s.height, `${sum.heightFrom} → ${sum.heightTo} px`)}
            {row(s.frames, String(sum.frames))}
            {row(s.installed, trace.standalone ? s.yes : s.no)}
            {row(s.lastTry, new Date(trace.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))}
          </>
        )}
      </div>
    </div>
  );
}
