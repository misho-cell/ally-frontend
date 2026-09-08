// Non-standard browser APIs the app relies on that TypeScript's lib.dom does
// not declare. Ambient so call sites can use them without `any` casts.

// Chromium install prompt (https://wicg.github.io/manifest-incubations/).
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}

// Contact Picker API (Chromium Android): https://w3c.github.io/contact-picker/
type ContactProperty = "name" | "tel" | "email" | "address" | "icon";

interface ContactAddress {
  city?: string;
  country?: string;
  postalCode?: string;
  region?: string;
  addressLine?: string[];
}

interface ContactInfo {
  name?: string[];
  tel?: string[];
  email?: string[];
  address?: ContactAddress[];
}

interface ContactsManager {
  select(
    properties: ContactProperty[],
    options?: { multiple?: boolean },
  ): Promise<ContactInfo[]>;
  getProperties(): Promise<ContactProperty[]>;
}

interface Navigator {
  // iOS Safari: true when launched from the home screen.
  readonly standalone?: boolean;
  readonly contacts?: ContactsManager;
}
