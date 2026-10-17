"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// #5054 (17 Oct). The phone's status strip takes the colour of the screen
// under it: the app's light background at home, the chat header's green in
// a conversation. theme-color is what Safari and Chrome read for that strip.
// The values are the stylesheet's own --bg and --accent, read at run time
// so this file never repeats them.
export default function ThemeColor() {
  const pathname = usePathname();
  useEffect(() => {
    const inChat = /^\/chat\/[^/]+/.test(pathname ?? "");
    const css = getComputedStyle(document.documentElement);
    const colour = css.getPropertyValue(inChat ? "--accent" : "--bg").trim();
    if (!colour) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = colour;
  }, [pathname]);
  return null;
}
