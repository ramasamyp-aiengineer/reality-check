export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function csrfToken(): string {
  const match = document.cookie.split("; ").find((c) => c.startsWith("rc_csrf="));
  return match ? decodeURIComponent(match.slice(8)) : "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["x-csrf-token"] = csrfToken();
  const resp = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) {
    let message = resp.statusText || "Request failed";
    try {
      const data = await resp.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (typeof data.error === "string") message = data.error;
    } catch {
      /* non-JSON error body */
    }
    if (resp.status === 429 && message === "Too Many Requests") message = "Too many requests. Please slow down.";
    throw new ApiError(resp.status, message);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
};
