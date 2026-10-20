"use client";

import Link from "next/link";
import DzIcon from "@/components/DzIcons";
import { getLocale } from "@/lib/i18n";
import { isStandalone } from "@/lib/push";
import { stepTicked, useGadget, useSetupState, type Step } from "@/lib/setup";

// #6701 (Giorgi, 20 Oct). The first three setup steps that are not done yet
// sit at the very top of the profile: contacts, notifications, the app on the
// home screen. A step leaves this block as soon as it is done and stays only
// in „მოწყობილობის დაყენება", which is still where every tap leads.
//
// Done is the setup page's own rule (stepTicked): what the server saw, or what
// the person marked on this device. While that state has not loaded, or could
// not be read, nothing is drawn: an empty block would claim every step done.

const TOP_STEPS: readonly Step[] = ["contacts", "notifications", "install"];

const L = {
  en: {
    head: "Set up a device",
    steps: { contacts: "Your contacts", notifications: "Notifications", install: "Netai on your phone / computer" } as Record<string, string>,
  },
  ka: {
    head: "მოწყობილობის დაყენება",
    steps: { contacts: "შენი კონტაქტები", notifications: "შეტყობინებები", install: "Netai შენს ტელეფონზე / კომპიუტერზე" } as Record<string, string>,
  },
};

export default function ProfileSetupSteps() {
  const s = L[getLocale()];
  const [state] = useSetupState();
  const gadget = useGadget();
  if (!state) return null;
  // Read only once the device is known, as the setup page does, so the
  // server's render and the first client render agree.
  const installedHere = gadget !== null && isStandalone();
  const open = TOP_STEPS.filter((st) => !stepTicked(state, st, installedHere));
  if (open.length === 0) return null;
  return (
    <>
      <h2 className="pd-group">{s.head}</h2>
      <nav className="pd-nav" aria-label={s.head}>
        {open.map((st) => (
          <Link key={st} href="/setup">
            {s.steps[st]}
            <DzIcon name="right" size={16} />
          </Link>
        ))}
      </nav>
    </>
  );
}
