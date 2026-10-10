"use client";

import { useState } from "react";
import Link from "next/link";
import SheetPage from "@/components/SheetPage";
import { apiFetch } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { ensurePushSubscription, isStandalone } from "@/lib/push";
import { STEPS, parseSetup, setupDeviceId, useGadget, useSetupState, type Gadget, type Step, type StepStatus } from "@/lib/setup";

// Task 1882, the setup list (onboarding vision §4). Five steps, each card
// with: what it is for, the taps for THIS gadget, and Done / It didn't
// work / Later. A step the server sees done shows its own tick whatever
// anyone tapped ("a step is ticked by evidence"). Wording is the design's
// (strings CSV), with its em dashes made commas.
//
// What is NOT here yet, said plainly:
//  - the pictures of each gadget's real screen with the tap marked. They
//    come from Lika's recordings (D701) and do not exist yet; the card has
//    the taps in words until they do.
//  - the test push. The backend's route answers 403 until Misho approves
//    its text; the step offers the real permission prompt instead.

type Copy = { title: string; why: string; taps: Partial<Record<Gadget, string[]>>; fix?: Partial<Record<Gadget, string>> };

const KA = {
  title: "დაყენება",
  back: "ჩატში დაბრუნება",
  intro: "ხუთი მოკლე ნაბიჯი. თითოზე ერთი შეხება. შეგიძლია შეჩერდე და მერე დაუბრუნდე.",
  progress: (n: number, t: number) => `${n} / ${t} გაკეთდა`,
  done: "გავაკეთე",
  failed: "არ გამოვიდა",
  later: "მოგვიანებით",
  ticked: "მზადაა",
  laterNote: "არაუშავს, ამ ნაბიჯს მოგვიანებითაც დაუბრუნდები.",
  failedNote: "არაუშავს, აი, ზუსტი გზა ამ მოწყობილობისთვის.",
  ask: "ჰკითხე Netai-ს",
  enablePush: "შეტყობინებების ჩართვა",
  openContacts: ".vcf ფაილის არჩევა",
  openConnector: "კონექტორის ნახვა",
  saveFailed: "ვერ შეინახა. სცადე თავიდან.",
  ready: "შენი ასისტენტი მზადაა.",
  steps: {
    install: {
      title: "Netai შენს ტელეფონზე / კომპიუტერზე",
      why: "ხატულიდან გახსნილი Netai შეტყობინებებს იღებს და უფრო სწრაფად იხსნება.",
      taps: {
        iphone: ["გახსენი Netai Safari-ში", "გაზიარება → მთავარ ეკრანზე დამატება → დამატება", "გახსენი Netai ახალი ხატულიდან. კოდს კიდევ ერთხელ მოგთხოვენ, ასეა ნორმალური."],
        android: ["Chrome-ში დააჭირე „აპის დაყენება“, ან ⋮ → მთავარ ეკრანზე დამატება", "გახსენი Netai ახალი ხატულიდან"],
        mac: ["Chrome: მისამართის ზოლში დაყენების ხატულა → დაყენება. Safari: ფაილი → დოკზე დამატება"],
        windows: ["Chrome / Edge: მისამართის ზოლში დაყენების ხატულა → დაყენება."],
      },
      fix: {
        iphone: "Chrome-ში ვერ დააყენებ, გახსენი Netai Safari-ში. გაზიარება → მთავარ ეკრანზე დამატება.",
        android: "Chrome-ში ⋮ → მთავარ ეკრანზე დამატება → დაყენება.",
        windows: "Chrome / Edge-ში მისამართის ზოლის ბოლოს დაყენების ხატულაა.",
        mac: "Chrome-ში მისამართის ზოლის ბოლოს დაყენების ხატულაა. Safari-ში: ფაილი → დოკზე დამატება.",
      },
    },
    notifications: {
      title: "შეტყობინებები",
      why: "ასე გაიგებ, როცა ვინმე გიპასუხებს ან შენი პასუხი დამჭირდება.",
      taps: {},
      fix: {
        iphone: "პარამეტრები → შეტყობინებები → Netai → დაშვება. Netai მთავარი ეკრანის ხატულიდან უნდა იყოს გახსნილი.",
        android: "მისამართის ზოლში ბოქლომი → ნებართვები → შეტყობინებები → დაშვება.",
        windows: "Windows პარამეტრები → სისტემა → შეტყობინებები → Chrome / Edge ჩართული; „არ შემაწუხო“ გამორთული.",
        mac: "სისტემის პარამეტრები → შეტყობინებები → Google Chrome (ან Netai) → დაშვება; Focus გამორთული.",
      },
    },
    contacts: {
      title: "შენი კონტაქტები",
      why: "Netai შენს კონტაქტებში ეძებს, ვინ დაგეხმარება.",
      taps: {
        iphone: ["კონტაქტები → სიები → ხანგრძლივად დააჭირე „ყველა კონტაქტი“", "ექსპორტი → ფაილებში შენახვა (ჩემს iPhone-ზე)", "აქ: .vcf ფაილის არჩევა → ფაილები → ის ფაილი"],
        android: ["კონტაქტები → გასწორება და მართვა → ფაილში ექსპორტი → შენახვა (ფაილი Downloads-ში ხვდება)", "აქ: .vcf ფაილის არჩევა → Downloads → ის ფაილი"],
        windows: ["თუ კონტაქტები Google-ში ან iCloud-ში გაქვს: contacts.google.com → ექსპორტი → vCard / icloud.com → კონტაქტები → ექსპორტი vCard"],
        mac: ["თუ კონტაქტები Google-ში ან iCloud-ში გაქვს: contacts.google.com → ექსპორტი → vCard / icloud.com → კონტაქტები → ექსპორტი vCard"],
      },
      fix: {
        android: "Samsung: ☰ → კონტაქტების მართვა → იმპორტი ან ექსპორტი → ექსპორტი → ტელეფონი",
      },
    },
    freshness: {
      title: "კონტაქტები ახალი იყოს",
      why: "ახალი ადამიანების შენახვის შემდეგ ისევ ატვირთე, რომ Netai-მ მათზეც იცოდეს.",
      taps: {},
    },
    connector: {
      title: "Netai Claude-ში / ChatGPT-ში",
      why: "სურვილისამებრ, შეგიძლია გამოტოვო და მოგვიანებით პროფილიდან დაუბრუნდე.",
      taps: {
        other: ["გახსენი კონექტორების პარამეტრები Claude-ში ან ChatGPT-ში.", "სახელი: Netai · ჩასვი მისამართი · Add", "Connect → შედი ტელეფონის ნომრით და კოდით", "ჩატში: „+“ → Connectors → Netai ჩართვა"],
      },
    },
  } as Record<Step, Copy>,
};

const EN: typeof KA = {
  title: "Setup",
  back: "Back to chat",
  intro: "Five short steps, one tap each. You can stop and come back later.",
  progress: (n, t) => `${n} of ${t} done`,
  done: "Done",
  failed: "It didn’t work",
  later: "Later",
  ticked: "Ready",
  laterNote: "That’s okay, you can return to this step later.",
  failedNote: "That’s okay, here is the exact fix for this gadget.",
  ask: "Ask Netai",
  enablePush: "Turn on notifications",
  openContacts: "Choose a .vcf file",
  openConnector: "View connector",
  saveFailed: "Could not save. Try again.",
  ready: "Your assistant is ready.",
  steps: {
    install: {
      title: "Netai on your phone / computer",
      why: "Opened from its icon, Netai gets notifications and opens faster.",
      taps: {
        iphone: ["Open Netai in Safari", "Share → Add to Home Screen → Add", "Open Netai from the new icon. You’ll be asked for the code once more, that’s normal."],
        android: ["In Chrome tap “Install app”, or ⋮ → Add to Home screen", "Open Netai from the new icon"],
        mac: ["Chrome: the install icon in the address bar → Install. Safari: File → Add to Dock"],
        windows: ["Chrome / Edge: the install icon in the address bar → Install."],
      },
      fix: {
        iphone: "It can’t be installed from Chrome, open Netai in Safari. Share → Add to Home Screen.",
        android: "In Chrome ⋮ → Add to Home screen → Install.",
        windows: "The install icon is at the end of the address bar in Chrome / Edge.",
        mac: "The install icon is at the end of the address bar in Chrome. In Safari: File → Add to Dock.",
      },
    },
    notifications: {
      title: "Notifications",
      why: "So you hear when someone answers, or when I need your answer.",
      taps: {},
      fix: {
        iphone: "Settings → Notifications → Netai → Allow. Netai must be opened from the Home Screen icon.",
        android: "Lock icon in the address bar → Permissions → Notifications → Allow.",
        windows: "Windows Settings → System → Notifications → Chrome / Edge on; Do not disturb off.",
        mac: "System Settings → Notifications → Google Chrome (or Netai) → Allow; Focus off.",
      },
    },
    contacts: {
      title: "Your contacts",
      why: "Netai looks through your contacts for who can help.",
      taps: {
        iphone: ["Contacts → Lists → press and hold “All Contacts”", "Export → Save to Files (On My iPhone)", "Here: Choose .vcf → Files → the file"],
        android: ["Contacts → Fix & manage → Export to file → Save (the file lands in Downloads)", "Here: Choose .vcf → Downloads → the file"],
        windows: ["If your contacts sync to Google or iCloud: contacts.google.com → Export → vCard / icloud.com → Contacts → Export vCard"],
        mac: ["If your contacts sync to Google or iCloud: contacts.google.com → Export → vCard / icloud.com → Contacts → Export vCard"],
      },
      fix: { android: "Samsung: ☰ → Manage contacts → Import or export → Export → Phone" },
    },
    freshness: {
      title: "Keep contacts fresh",
      why: "After saving new people, upload again so Netai knows about them too.",
      taps: {},
    },
    connector: {
      title: "Netai in Claude / ChatGPT",
      why: "Optional, you can skip this and return later from the profile.",
      taps: {
        other: ["Open connector settings in Claude or ChatGPT.", "Name: Netai · paste the address · Add", "Connect → log in with your phone number and the code", "In a chat: “+” → Connectors → switch Netai on"],
      },
    },
  },
};

export default function SetupPage() {
  const s = getLocale() === "ka" ? KA : EN;
  const gadget = useGadget();
  const [state, setState] = useSetupState();
  const [busy, setBusy] = useState<Step | null>(null);
  const [err, setErr] = useState<Step | null>(null);

  async function mark(step: Step, status: StepStatus) {
    if (busy || !gadget) return;
    setBusy(step);
    setErr(null);
    try {
      const id = setupDeviceId();
      const raw = await apiFetch<unknown>(`/setup/devices/${encodeURIComponent(id)}/steps/${step}`, {
        method: "PUT",
        body: { gadget, status },
      });
      // The answer is the whole state again, already updated: draw that,
      // not what we asked for.
      const next = parseSetup(raw, id);
      if (next) setState(next);
    } catch {
      setErr(step);
    } finally {
      setBusy(null);
    }
  }

  async function enablePush() {
    const r = await ensurePushSubscription(true);
    if (r.state === "subscribed") await mark("notifications", "done");
  }

  return (
    <SheetPage
      title={s.title}
      backHref="/chat"
      backLabel={s.back}
      action={state ? <span className="kind-pill shrink-0" style={{ alignSelf: "center" }}>{s.progress(state.doneCount, state.total)}</span> : undefined}
    >
      <p style={{ font: "400 14px/21px var(--font-system)", color: "var(--ink-soft)" }}>{s.intro}</p>
      {state && state.doneCount >= state.total && (
        <p style={{ font: "600 15px/21px var(--font-system)", color: "var(--accent-strong)" }}>{s.ready}</p>
      )}

      {STEPS.map((step, i) => {
        const copy = s.steps[step];
        const serverSees = state?.server[step] === true;
        const mine = state?.mine[step];
        // install: only the gadget can tell, so an installed app says so.
        const installedHere = step === "install" && gadget !== null && isStandalone();
        const ticked = serverSees || mine === "done" || installedHere;
        const taps = gadget ? copy.taps[gadget] ?? copy.taps.other : undefined;
        const fix = gadget ? copy.fix?.[gadget] : undefined;
        return (
          <div key={step} className="card flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span style={{ font: "600 12px/16px var(--font-system)", color: "var(--meta)" }}>{i + 1}</span>
              <span className="flex-1" style={{ font: "600 15.5px/21px var(--font-system)", color: "var(--ink)" }}>{copy.title}</span>
              {ticked && <span className="kind-pill">{s.ticked}</span>}
            </div>
            <p style={{ font: "400 13.5px/20px var(--font-system)", color: "var(--ink-soft)" }}>{copy.why}</p>

            {!ticked && taps && taps.length > 0 && (
              <ol className="flex flex-col gap-1.5 pl-5" style={{ listStyleType: "decimal", font: "400 14px/21px var(--font-system)", color: "var(--ink)" }}>
                {taps.map((tp) => <li key={tp}>{tp}</li>)}
              </ol>
            )}

            {!ticked && (
              <div className="flex flex-wrap gap-2">
                {step === "notifications" && (
                  <button type="button" className="btn-primary" style={{ padding: "8px 16px" }} onClick={enablePush}>{s.enablePush}</button>
                )}
                {(step === "contacts" || step === "freshness") && (
                  <Link href="/onboarding/contacts?from=profile" className="btn-primary" style={{ padding: "8px 16px" }}>{s.openContacts}</Link>
                )}
                {step === "connector" && (
                  <Link href="/profile" className="btn-secondary" style={{ padding: "8px 16px" }}>{s.openConnector}</Link>
                )}
                <button type="button" className="btn-secondary" style={{ padding: "8px 14px" }} disabled={busy === step} onClick={() => mark(step, "done")}>{s.done}</button>
                <button type="button" className="btn-secondary" style={{ padding: "8px 14px" }} disabled={busy === step} onClick={() => mark(step, "failed")}>{s.failed}</button>
                <button type="button" className="btn-secondary" style={{ padding: "8px 14px" }} disabled={busy === step} onClick={() => mark(step, "later")}>{s.later}</button>
              </div>
            )}

            {!ticked && mine === "failed" && (
              <div className="flex flex-col gap-1.5" style={{ background: "var(--terra-tint)", borderRadius: 12, padding: "10px 12px" }}>
                <p style={{ font: "500 13px/19px var(--font-system)", color: "var(--ink)" }}>{s.failedNote}</p>
                {fix && <p style={{ font: "400 13.5px/20px var(--font-system)", color: "var(--ink)" }}>{fix}</p>}
                <Link href="/chat" style={{ font: "600 13px/18px var(--font-system)", color: "var(--accent-strong)" }}>{s.ask} ›</Link>
              </div>
            )}
            {!ticked && mine === "later" && (
              <p style={{ font: "400 12.5px/18px var(--font-system)", color: "var(--meta)" }}>{s.laterNote}</p>
            )}
            {err === step && (
              <p role="status" style={{ font: "500 12.5px/18px var(--font-system)", color: "var(--danger)" }}>{s.saveFailed}</p>
            )}
          </div>
        );
      })}
    </SheetPage>
  );
}
