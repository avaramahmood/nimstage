/**
  Client-side session fallback. The server sets an httpOnly cookie, but some app WebViews (Nimiq Pay's, it
  seems) don't keep cookies after the app closes. So the sign-in token is also kept here and sent as a bearer
  header; either one signs you in. If localStorage is unavailable it lives in memory for the visit.
*/
const KEY = "ns_token";
let memory: string | null = null;
let media: string | null = null;

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setToken(token: string | null) {
  memory = token;
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode / blocked storage: the in-memory copy still works for this visit */
  }
}

/** A narrow, short-lived token for <audio>, which can't send headers. */
export const setMediaToken = (t: string | null) => {
  media = t;
};

export function streamUrl(trackId: string, showId?: string): string {
  const q = new URLSearchParams();
  if (showId) q.set("show", showId);
  if (media) q.set("st", media);
  const qs = q.toString();
  return `/api/tracks/${trackId}/stream${qs ? `?${qs}` : ""}`;
}
