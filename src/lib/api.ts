import { getToken } from "./session";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (!(body instanceof FormData) && body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`; // the cookie may not survive in a WebView
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(data.error ?? "Request failed", res.status);
  return data;
}

/** crypto.randomUUID() is unavailable in insecure contexts (e.g. http://LAN-IP in a WebView). */
export function randomHex(bytes = 8): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
