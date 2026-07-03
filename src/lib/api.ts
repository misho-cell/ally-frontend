import { authHeaders, adminAuthHeaders, handleAdminTokenMisuse } from "./deviceId";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type RequestOptions = {
  method?: string;
  body?: unknown;
  // Use the admin session (adminToken) instead of the user session. 401 then
  // redirects to /admin/login instead of /login.
  admin?: boolean;
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
  const headers = options.admin
    ? adminAuthHeaders({ "Content-Type": "application/json" })
    : authHeaders({ "Content-Type": "application/json" });

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
    if (typeof window !== "undefined") {
      if (options.admin) {
        localStorage.removeItem("adminToken");
        document.cookie = "adminToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
        window.location.href = "/admin/login";
      } else if (localStorage.getItem("token")) {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }
    throw new ApiError("Unauthorized.", 401);
  }

  if (response.status === 429) {
    const data = await response
      .json()
      .catch(() => ({})) as { message?: string; error?: string };
    const raw = response.headers.get("Retry-After");
    const secs = raw ? parseInt(raw, 10) : NaN;
    throw new ApiError(
      data.error ?? data.message ?? "Too many requests. Please try again later.",
      429,
      Number.isFinite(secs) && secs > 0 ? secs : 30,
    );
  }

  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({})) as { message?: string; error?: string; success?: boolean; reason?: string };

    // Leftover admin JWT hitting a user endpoint — reset to phone login.
    if (!options.admin && handleAdminTokenMisuse(response.status, data)) {
      throw new ApiError(data.error ?? "admin_token_on_user_endpoint", 403);
    }

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
