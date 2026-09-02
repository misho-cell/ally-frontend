"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getLocale } from "@/lib/i18n";

// FE-C (2 Sept): the server has no reliable signal for locale at render time
// (it lives in localStorage/navigator.language, both client-only), so the
// root <html> ships with lang="ka" by default — correct for the large
// majority of users, and what curl/screen readers see before any JS runs.
// This corrects it client-side for the minority actually on the English
// locale, so Chrome's "translate this page" prompt and screen readers don't
// treat Georgian copy as mislabeled English. Re-runs on every route change
// (not just app mount) so a page that pins its own lang (e.g. /join, always
// Georgian) doesn't leave it stuck after navigating elsewhere.
export default function LocaleHtml() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = getLocale();
  }, [pathname]);
  return null;
}
