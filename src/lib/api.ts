import { authHeaders, parseRetryAfter } from "./deviceId";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type RequestOptions = {
  method?: string;
  body?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // Bearer + X-Device-Id from the single source.
  const headers = authHeaders({ "Content-Type": "application/json" });

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Network error. Please check your connection.");
  }

  if (response.status === 401) {
    if (typeof window !== "undefined" && token) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new ApiError("Invalid email or password.", 401);
  }

  if (response.status === 429) {
    const data = await response
      .json()
      .catch(() => ({})) as { message?: string; error?: string };
    throw new ApiError(
      data.error ?? data.message ?? "Too many requests. Please try again later.",
      429,
      parseRetryAfter(response),
    );
  }

  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({})) as { message?: string; error?: string; success?: boolean };

    if (data.error === "subscription_required") {
      if (typeof window !== "undefined") {
        window.location.href = "/pricing";
      }
      throw new ApiError("subscription_required", response.status);
    }

    throw new ApiError(
      data.error ?? data.message ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }

  const json = await response.json() as { success?: boolean; error?: string };

  if (json.success === false && json.error === "subscription_required") {
    if (typeof window !== "undefined") {
      window.location.href = "/pricing";
    }
    throw new ApiError("subscription_required", 402);
  }

  return json as T;
}
