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
    <div className="nx-card">
      <h3>{s.title}</h3>

      {!loaded ? (
        <span className="sk-bar" style={{ width: "100%", height: 44, borderRadius: "var(--radius-tile)" }} />
      ) : (
        <>
          <label className="nx-field" style={{ marginBottom: 0 }}>
          <input
            type="text"
            value={tone}
            maxLength={200}
            onChange={(e) => { setTone(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder={s.placeholder}
          />
          </label>
          {!tone.trim() && (
            <p className="nx-note">{s.hint}</p>
          )}
          {error && (
            <p className="nx-note" style={{ color: "var(--danger)" }}>{error}</p>
          )}
          <div className="nx-row">
            <button type="button" onClick={save} disabled={busy} className="nx-btn primary">
              {saved ? s.saved : s.save}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="nx-link"
            >
              {s.reset}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
