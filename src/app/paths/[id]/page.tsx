"use client";

import { useParams } from "next/navigation";
import SheetPage from "@/components/SheetPage";
import PathMap from "@/components/PathMap";
import { getLocale } from "@/lib/i18n";

// #1849 (28 Oct): the drawn path to one person, opened from the reply of the
// search that found it. The same map the contact's page shows, on its own.

const L = {
  en: { title: "Path to a person", back: "Back" },
  ka: { title: "გზა ადამიანამდე", back: "უკან" },
};

export default function PathPage() {
  const s = L[getLocale()];
  const { id } = useParams<{ id: string }>();
  return (
    // Back returns to the chat the link was in; opened on its own, to /chat.
    <SheetPage
      title={s.title}
      backHref="/chat"
      onBack={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/chat"); }}
      backLabel={s.back}
    >
      <PathMap contactId={id} />
    </SheetPage>
  );
}
