// Shared Paddle.js loader. Paddle.Initialize may only run once per page, but
// several screens (pricing, profile top-up, chat 402 screen) need checkout —
// so the script is loaded and initialized here exactly once, and
// checkout.completed is fanned out to any number of subscribers.

type PaddleGlobal = {
  Environment: { set: (env: string) => void };
  Initialize: (opts: {
    token: string;
    eventCallback: (data: { name: string }) => void;
  }) => void;
  Checkout: {
    open: (opts: {
      items: { priceId: string; quantity: number }[];
      customData: Record<string, string>;
    }) => void;
  };
};

const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;

function paddle(): PaddleGlobal | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Paddle as PaddleGlobal | undefined;
}

export function ensurePaddle(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const init = () => {
      paddle()?.Environment.set("production");
      paddle()?.Initialize({
        token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
        eventCallback(data) {
          if (data.name === "checkout.completed") {
            listeners.forEach((cb) => cb());
          }
        },
      });
      resolve();
    };
    const existing = document.querySelector('script[src*="cdn.paddle.com"]');
    if (existing) {
      // Script already on the page (e.g. fast re-mount). If Paddle is ready,
      // initialize; otherwise wait for its load event.
      if (paddle()) {
        init();
      } else {
        existing.addEventListener("load", init, { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = init;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Paddle failed to load"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

// Subscribe to checkout.completed. Returns an unsubscribe function.
export function onCheckoutCompleted(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function openCheckout(priceId: string) {
  paddle()?.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: { user_id: getUserId() },
  });
}

export function getUserId(): string {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return "";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return String(payload.userId ?? "");
  } catch {
    return "";
  }
}
