import type { Gadget, Step } from "@/lib/setup";

// #6139 / task 1882 (backend 20 Oct 19:10Z, Misho's three cleaned zips). The
// onboarding pictures ship with the app until the server's GET
// /setup/pictures holds them; SetupPictures reads the server first and falls
// back to these. Only the cleaned set is bundled: numbers, codes, invite
// codes, names and case titles are blurred in every picture.
//
// Each picture is cut to the screen (phone_only / screen_only in the zips)
// and lives in public/setup-guides/<set>/<file>.webp. The caption is the line
// from the set's captions_ka.txt, which repeats what the picture already
// says; only its em dashes became commas. 08a / 08b are two taps of one step
// and keep that order.

export type GuideSet = "iphone-install" | "iphone-notifications" | "iphone-contacts" | "iphone-claude" | "iphone-chatgpt" | "mac-contacts" | "desktop-chatgpt";

export type GuideShot = { src: string; caption: string };

const SETS: Record<GuideSet, readonly (readonly [string, string])[]> = {
  "iphone-install": [
    ["01", "გახსენი მოწვევის ლინკი და დააჭირე „შემოუერთდი“"],
    ["02", "შეიყვანე ტელეფონის ნომერი და დააჭირე „კოდის მიღება“"],
    ["03", "შეიყვანე WhatsApp-ით მიღებული კოდი და დააჭირე „დადასტურება“"],
    ["04", "დააჭირე ••• ღილაკს (ეკრანის ქვედა მარჯვენა კუთხეში)"],
    ["05", "აირჩიე Share (მენიუში პირველივე ღილაკი)"],
    ["06", "ჩამოსქროლე და აირჩიე Add to Home Screen (სიის ბოლოში)"],
    ["07", "დააჭირე Add (ზედა მარჯვენა კუთხეში)"],
    ["08", "მზადაა! Netai-ის აიქონი უკვე Home Screen-ზეა"],
  ],
  "iphone-notifications": [
    ["01", "გახსენი პროფილი (ხატულა ზედა მარჯვენა კუთხეში)"],
    ["02", "აირჩიე „მოწყობილობის დაყენება“ (პროფილის გვერდის ბოლოში)"],
    ["03", "დააჭირე „შეტყობინებების ჩართვა“ (მეორე ნაბიჯში, „შეტყობინებები“)"],
    ["04", "დააჭირე Allow (iPhone ნებართვას გკითხავს)"],
    ["05", "გაგზავნე სატესტო შეტყობინება (რამდენიმე წამში ზემოთ გამოჩნდება)"],
    ["06", "მოვიდა? დააჭირე „კი, მოვიდა“"],
    ["07", "მზადაა! შეტყობინებები ჩართულია"],
  ],
  "iphone-contacts": [
    ["01", "გახსენი Contacts აპი (iPhone-ის კონტაქტების აპი)"],
    ["02", "დაბრუნდი Lists-ზე (ზედა მარცხენა „<“ ღილაკით)"],
    ["03", "ხანგრძლივად დააჭირე All Contacts-ს და აირჩიე Export"],
    ["04", "დააჭირე ✓ ღილაკს (ველებს ნუ შეცვლი, ზედა მარჯვენა კუთხე)"],
    ["05", "აირჩიე Save to Files (Share მენიუს ქვედა რიგში)"],
    ["06", "დააჭირე Save (ფაილი „All Contacts“ შეინახება Files-ში)"],
    ["07", "Netai-ში გახსენი პროფილი (ხატულა ზედა მარჯვენა კუთხეში)"],
    ["08", "ჩამოსქროლე და აირჩიე „ჩემი კონტაქტები“ (პროფილის „კონტაქტები“ განყოფილებაში)"],
    ["09", "დააჭირე „კონტაქტების განახლება“ (გაიხსნება კონტაქტების სინქრონი)"],
    ["10", "დააჭირე „ატვირთე .vcf ფაილი“ (გაიხსნება Files)"],
    ["11", "აირჩიე ახლახან შენახული All Contacts (ყველაზე ახალი ფაილი · ატვირთვას რამდენიმე წამი სჭირდება)"],
    ["12", "მზადაა! კონტაქტები აიტვირთა (ახლები დაემატა, არსებულები განახლდა)"],
  ],
  "iphone-claude": [
    ["01", "Netai-ში გახსენი პროფილი (ხატულა ზედა მარჯვენა კუთხეში)"],
    ["02", "აირჩიე „Netai Claude-ში“ (ჩამოსქროლე პროფილის გვერდზე)"],
    ["03", "დააკოპირე სერვერის ბმული: api.netai.guru/mcp, დააჭირე „კოპირება“"],
    ["04", "გახსენი Claude აპი და შედი Settings-ში (მენიუ ზედა მარცხნივ → ავატარი ქვემოთ)"],
    ["05", "აირჩიე Connectors (Settings-ის App განყოფილებაში)"],
    ["06", "დააჭირე + და აირჩიე Add custom connector (+ ღილაკი ზედა მარჯვენა კუთხეშია)"],
    ["07", "ჩაწერე სახელი და ჩასვი ბმული: Name: Netai · MCP server URL: დაკოპირებული ბმული"],
    ["08a", "დააჭირე Continue (სხვა პარამეტრებს ნუ შეცვლი)"],
    ["08b", "შემდეგ დააჭირე Add"],
    ["09", "დაადასტურე შესვლა: Continue (Claude api.netai.guru-ზე შესვლის ნებართვას ითხოვს)"],
    ["10", "შეიყვანე Netai-ის ნომერი და დააჭირე Send code"],
    ["11", "ჩაწერე WhatsApp-ით მიღებული კოდი და დააჭირე Verify"],
    ["12", "მზადაა! Netai დაემატა Claude-ს (Netai ახლა Connectors-ის სიაშია)"],
  ],
  "iphone-chatgpt": [
    ["01", "Netai-ში გახსენი პროფილი (ხატულა ზედა მარჯვენა კუთხეში)"],
    ["02", "აირჩიე „Netai Claude-ში“ (იგივე ბმული ChatGPT-შიც მუშაობს)"],
    ["03", "დააკოპირე სერვერის ბმული: api.netai.guru/mcp, დააჭირე „კოპირება“"],
    ["04", "chatgpt.com-ზე გახსენი მენიუ → პლაგინები (მენიუს ღილაკი ზედა მარცხენა კუთხეშია)"],
    ["05", "დამატება → მორგებული MCP სერვერის დამატება („დამატება“ ზედა მარჯვენა კუთხეშია)"],
    ["06", "ჩაწერე სახელი: Netai (ველში „სახელი“)"],
    ["07", "ჩასვი დაკოპირებული ბმული (ველში „კავშირი“ → Paste)"],
    ["08", "მონიშნე „მესმის და მსურს გაგრძელება“ (სხვა პარამეტრებს ნუ შეცვლი)"],
    ["09", "დააჭირე „პლაგინის სახით შექმნა“ (ფანჯრის ბოლოში)"],
    ["10", "დააჭირე „დაკავშირება: Netai“ (გაიხსნება Netai-ის შესვლის გვერდი)"],
    ["11", "შეიყვანე Netai-ის ნომერი და დააჭირე Send code"],
    ["12", "ჩასვი WhatsApp-ით მიღებული კოდი და დააჭირე Verify. Netai დაკავშირებულია"],
  ],
  "mac-contacts": [
    ["01", "გახსენი Contacts აპლიკაცია (დააჭირე აიქონს Dock-ში)"],
    ["02", "მონიშნე ყველა კონტაქტი (დააჭირე ⌘ Command + A)"],
    ["03", "აირჩიე Export vCard… (მონიშნულ კონტაქტებზე დააჭირე მაუსის მარჯვენა ღილაკს)"],
    ["04", "შეინახე ფაილი (დაარქვი სახელი და დააჭირე Save)"],
    ["05", "გახსენი Netai და გადადი პროფილზე (შენი სახელი ქვედა მარცხენა კუთხეში)"],
    ["06", "აირჩიე „ჩემი კონტაქტები“ (ჩამოსქროლე კონტაქტების განყოფილებამდე)"],
    ["07", "დააჭირე „კონტაქტების განახლება“ (გაიხსნება კონტაქტების სინქრონი)"],
    ["08a", "ატვირთე კონტაქტების ფაილი: დააჭირე „ატვირთე .vcf ფაილი“"],
    ["08b", "აირჩიე შენახული ფაილი → Open"],
    ["09", "მზადაა! (Netai ნახავს, ვინ არის ახალი და ვინ უკვე გყავს)"],
  ],
  "desktop-chatgpt": [
    ["01", "Netai-ში გახსენი პროფილი (დააჭირე შენს სახელს ქვედა მარცხენა კუთხეში)"],
    ["02", "აირჩიე „Netai Claude-ში“ (იგივე ბმული ChatGPT-შიც მუშაობს)"],
    ["03", "დააკოპირე სერვერის ბმული: api.netai.guru/mcp, დააჭირე „კოპირება“"],
    ["04", "გახსენი chatgpt.com → Plugins (მარცხენა მენიუში, ზედა ნაწილში)"],
    ["05a", "დააჭირე Add (ზედა მარჯვენა კუთხეში)"],
    ["05b", "აირჩიე Add custom MCP server"],
    ["06", "ჩაწერე სახელი: NETAI (ველში Name)"],
    ["07", "ჩასვი დაკოპირებული ბმული (ველში Connection, ⌘ + V)"],
    ["08", "მონიშნე „I understand…“ (სხვა პარამეტრებს ნუ შეცვლი)"],
    ["09", "დააჭირე Create as a plugin (ღილაკი ფანჯრის ქვედა მარჯვენა კუთხეში)"],
    ["10", "დააჭირე Connect NETAI (გაიხსნება Netai-ის შესვლის გვერდი)"],
    ["11", "შეიყვანე Netai-ის ნომერი და დააჭირე Send code"],
    ["12", "ჩაწერე WhatsApp-ით მიღებული კოდი და დააჭირე Verify"],
    ["13", "მზადაა! Netai დაემატა ChatGPT-ს (Netai ჩანს Installed სიაში)"],
  ],
};

export function guideShots(set: GuideSet): GuideShot[] {
  return SETS[set].map(([file, caption]) => ({ src: `/setup-guides/${set}/${file}.webp`, caption }));
}

// Which bundled sets a card offers, by the backend's table. More than one
// means the person chooses (the iPhone connector: Claude or ChatGPT). An
// empty list keeps the card's taps in words. Android borrows the iPhone
// notifications set, and Windows the laptop ChatGPT set, as the table says.
export function guideSetsFor(gadget: Gadget, step: Step): GuideSet[] {
  switch (step) {
    case "install":
      return gadget === "iphone" ? ["iphone-install"] : [];
    case "notifications":
      return gadget === "iphone" || gadget === "android" ? ["iphone-notifications"] : [];
    case "contacts":
      return gadget === "iphone" ? ["iphone-contacts"] : gadget === "mac" ? ["mac-contacts"] : [];
    case "connector":
      return gadget === "iphone" ? ["iphone-claude", "iphone-chatgpt"] : gadget === "mac" || gadget === "windows" ? ["desktop-chatgpt"] : [];
    default:
      return [];
  }
}
