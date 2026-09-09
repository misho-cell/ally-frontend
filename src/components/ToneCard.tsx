"use client";

import { useState, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale } from "@/lib/i18n";

// Task 2 (9 Sept, Ticket 11 Task 9): the same "how Netai talks to me" note the
// user can set in chat ("be shorter", "warmer"), now editable on the profile.
// One tone at a time — a new PUT replaces the old; DELETE returns to default.
// Always read fresh via GET on mount (it's the same record chat writes, so a
// cache would go stale); after PUT, show what the server returns, not what was
// typed (the server trims and caps at 200 chars).
const L = {
  en: {
    title: "How Netai talks to me",
    placeholder: "e.g. short and direct",
    hint: "In chat you can also say: “shorter”, “warmer”, “more direct”.",
    save: "Save",
    saved: "Saved",
    reset: "Back to default",
    required: "Please enter a tone, or use “Back to default”.",
    error: "Something went wrong",
  },
  ka: {
    title: "როგორ მელაპარაკება Netai",
    placeholder: "მაგ.: მოკლედ და პირდაპირ",
    hint: "ჩატშიც შეგიძლია უთხრა: „მოკლედ“, „უფრო თბილად“, „უფრო პირდაპირ“.",
    save: "შენახვა",
    saved: "შენახულია",
    reset: "ნაგულისხმევზე დაბრუნება",
    required: "შეიყვანე ტონი, ან გამოიყენე „ნაგულისხმევზე დაბრუნება“.",
    error: "რაღაც შეცდომა მოხდა",
  },
};

export default function ToneCard() {
  const s = L[getLocale()];
  const [tone, setTone] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data?: { tone?: string | null } }>("/profile/tone")
      .then((res) => setTone(res.data?.tone ?? ""))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    const value = tone.trim();
    if (!value) { setError(s.required); return; }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch<{ data?: { tone?: string | null } }>("/profile/tone", {
        method: "PUT",
        body: { tone: value },
      });
      // Show the server's cleaned value, not the raw input.
      setTone(res.data?.tone ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.error);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/profile/tone", { method: "DELETE" });
      setTone("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.title}</h2>

      {!loaded ? (
        <span className="sk-bar" style={{ width: "100%", height: 44, borderRadius: "var(--radius-tile)" }} />
      ) : (
        <>
          <input
            type="text"
            value={tone}
            maxLength={200}
            onChange={(e) => { setTone(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder={s.placeholder}
            className="input-pill"
            style={{ width: "100%" }}
          />
          {!tone.trim() && (
            <p style={{ fontSize: "12.5px", color: "var(--meta)" }}>{s.hint}</p>
          )}
          {error && (
            <p style={{ fontSize: "12.5px", color: "var(--danger)" }}>{error}</p>
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={busy} className="btn-primary disabled:opacity-60" style={{ alignSelf: "flex-start" }}>
              {saved ? s.saved : s.save}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="transition-colors hover:text-[var(--ink)] disabled:opacity-50"
              style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}
            >
              {s.reset}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
