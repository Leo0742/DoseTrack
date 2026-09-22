export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function formatApiDetail(detail: unknown): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        const message = typeof row.msg === "string" ? row.msg : typeof row.message === "string" ? row.message : "Invalid value";
        const location = Array.isArray(row.loc)
          ? row.loc.filter((value) => value !== "body").map(String).join(" → ")
          : "";
        return location ? `${location}: ${message}` : message;
      }
      return String(item);
    }).filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (detail && typeof detail === "object") {
    const row = detail as Record<string, unknown>;
    if (typeof row.message === "string") return row.message;
    if (typeof row.msg === "string") return row.msg;
    try { return JSON.stringify(detail); } catch { /* fall through */ }
  }
  return "Request failed";
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && typeof window !== "undefined") {
    const csrf = sessionStorage.getItem("dosetrack_csrf");
    if (csrf) headers.set("x-csrf-token", csrf);
  }
  const response = await fetch(path, { ...options, headers, credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new ApiError(response.status, formatApiDetail(body.detail));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
