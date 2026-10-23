"use client";

import { useEffect, useState } from "react";
import SheetPage from "@/components/SheetPage";
import { apiFetch } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isRecord, unwrapData } from "@/lib/payload";
import { MCP_URL } from "@/lib/hosts";

// 13 Oct, FIXED2: the design lists „Netai in Claude" among the account pages,
// so the guide that was a fold-out card on the profile is a page of its own.
// The words and the steps are the same ones the card carried. No API is
// involved beyond the „connected" line, which only a `connected: true` draws.

const L = {
  en: {
    title: "Netai in Claude",
    back: "Profile",
    close: "Close",
    body: "Use your Netai network directly from Claude — search, intro requests and replies, without leaving the chat.",
    badge: "Requires a paid claude.ai plan (Pro/Team)",
    copy: "Copy",
    copied: "Copied",
    connected: "Claude is connected",
    steps: [
      "Open claude.ai → Settings → Connectors",
      "Click “Add custom connector”",
      "Name: Netai, URL: paste the address you copied → Add",
      "Click “Connect” → enter your phone number → WhatsApp code",
    ],
    tip: "Tip: in the connector settings, set “Read-only tools” to “Allowed” so searches don’t ask for confirmation every time",
    note: "Claude will always ask you before sending an intro request — nothing is sent behind your back.",
  },
  ka: {
    title: "Netai Claude-ში",
    back: "პროფილი",
    close: "დახურვა",
    body: "გამოიყენე შენი Netai ქსელი პირდაპირ Claude-დან: ძიება, გაცნობის თხოვნები და პასუხები, ჩეთიდან გაუსვლელად.",
    badge: "საჭიროა claude.ai-ს ფასიანი გეგმა (Pro/Team)",
    copy: "კოპირება",
    copied: "დაკოპირდა",
    connected: "Claude დაკავშირებულია",
    steps: [
      "გახსენი claude.ai → Settings → Connectors",
      "დააჭირე „Add custom connector“",
      "Name: Netai, URL: ჩასვი დაკოპირებული მისამართი → Add",
      "დააჭირე „Connect“ → ჩაწერე შენი ნომერი → WhatsApp კოდი",
    ],
    tip: "რჩევა: კონექტორის პარამეტრებში „Read-only tools“ გადართე „Allowed“-ზე, რომ ძიება ყოველაზე დადასტურებას არ ითხოვდეს",
    note: "Claude ყოველთვის გკითხავს გაცნობის თხოვნის გაგზავნამდე. შენს ზურგს უკან არაფერი იგზავნება.",
  },
};

export default function ConnectorPage() {
  const s = L[getLocale()];
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/connector/state")
      .then((raw) => {
        const d = unwrapData(raw);
        if (alive && isRecord(d) && d.connected === true) setConnected(true);
      })
      .catch(() => { /* nothing drawn */ });
    return () => { alive = false; };
  }, []);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <SheetPage title={s.title} backHref="/profile" backLabel={s.back} closeLabel={s.close}>
      {connected && (
        <p className="nx-row" style={{ font: "500 14px/1.5 var(--font-system)", color: "var(--accent-strong)" }}>
          <span className="rounded-full" style={{ width: 8, height: 8, background: "var(--accent)" }} />
          {s.connected}
        </p>
      )}
      <p className="nx-intro" style={{ color: "var(--nx-ink)" }}>{s.body}</p>
      <span className="nx-pill self-start">{s.badge}</span>
      <div className="nx-row" style={{ flexWrap: "nowrap" }}>
        <code
          className="min-w-0 flex-1 truncate"
          style={{ padding: 12, background: "#f1f6f4", border: "1px dashed var(--nx-line)", borderRadius: 10, font: "13px/1.5 monospace", color: "var(--nx-ink)" }}
        >
          {MCP_URL}
        </code>
        <button type="button" className="nx-btn primary" onClick={copyUrl}>{copied ? s.copied : s.copy}</button>
      </div>
      <ol className="flex flex-col gap-2 pl-5" style={{ listStyleType: "decimal", font: "400 14px/1.65 var(--font-system)", color: "var(--nx-ink)" }}>
        {s.steps.map((step) => <li key={step}>{step}</li>)}
        <li style={{ color: "var(--nx-muted)" }}>{s.tip}</li>
      </ol>
      <p className="nx-card" style={{ font: "400 13px/1.6 var(--font-system)", color: "var(--nx-muted)" }}>{s.note}</p>
    </SheetPage>
  );
}
