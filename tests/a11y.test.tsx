// @vitest-environment jsdom
// Structural accessibility checks on the *rendered* pages, signed out and signed in.
// The app runs as a single-page app, so the real components are mounted in jsdom (with the real
// router) against a running API in demo mode, and the resulting DOM is inspected.
// This is NOT an axe/WCAG audit (no computed styles, focus order or screen reader testing); it
// catches common structural failures. Contrast is covered by scripts/contrast.mjs.
//
//   BASE=http://localhost:3000 npm run test:a11y      (the API server must be running)
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "@/router";

const BASE = process.env.BASE ?? "http://localhost:3000";
const realFetch = globalThis.fetch;
let cookie = "";

// The app uses relative URLs and the browser's cookie jar; in jsdom we provide both.
beforeAll(() => {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" && input.startsWith("/") ? BASE + input : input;
    return realFetch(url as RequestInfo, { ...init, headers: { ...(init?.headers as Record<string, string>), ...(cookie ? { cookie } : {}) } });
  }) as typeof fetch;
  // jsdom lacks these browser APIs; the app feature-detects them.
  window.scrollTo = () => {};
});

afterEach(() => cleanup());

async function login(persona: "fan" | "artist" | "admin" | null) {
  cookie = "";
  if (!persona) return;
  const r = await realFetch(`${BASE}/api/auth/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona }) });
  expect(r.status, "demo login failed: is the API running with NIMSTAGE_DEMO=1?").toBe(200);
  cookie = r.headers.get("set-cookie")!.split(";")[0];
}

const nameOf = (el: Element) =>
  (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.textContent || el.getAttribute("title") || "").replace(/\s+/g, " ").trim() ||
  [...el.querySelectorAll("[aria-label]")].map((x) => x.getAttribute("aria-label")).join("");

/** Returns a list of structural problems found in the current document. */
function audit(root: HTMLElement): string[] {
  const issues: string[] = [];
  const q = (sel: string) => [...root.querySelectorAll(sel)];

  if (q("main").length !== 1) issues.push(`expected 1 <main>, found ${q("main").length}`);
  if (!q("nav[aria-label]").length) issues.push("no labelled <nav>");
  const h1 = q("h1");
  if (h1.length !== 1) issues.push(`expected 1 <h1>, found ${h1.length}`);

  let prev = 0;
  for (const h of q("h1,h2,h3,h4,h5,h6")) {
    if (h.closest("dialog")) continue;
    const lvl = Number(h.tagName[1]);
    if (prev && lvl > prev + 1) issues.push(`heading jumps h${prev} -> h${lvl}: "${h.textContent?.trim().slice(0, 30)}"`);
    prev = lvl;
  }
  for (const el of q("button, a[href]")) if (!nameOf(el)) issues.push(`${el.tagName.toLowerCase()} without an accessible name: ${el.outerHTML.slice(0, 80)}`);
  for (const el of q("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select")) {
    const id = el.id;
    const labelled = el.getAttribute("aria-label") || (id && root.querySelector(`label[for="${id}"]`)) || el.closest("label");
    if (!labelled) issues.push(`form control without a label: ${el.outerHTML.slice(0, 80)}`);
  }
  for (const img of q("img:not([alt])")) issues.push(`<img> without alt: ${img.outerHTML.slice(0, 60)}`);
  for (const d of q("dialog")) if (!d.getAttribute("aria-label")) issues.push("<dialog> without aria-label");
  for (const p of q('[role="progressbar"]')) if (!p.getAttribute("aria-label") && !p.getAttribute("aria-labelledby")) issues.push("progressbar without a name");
  for (const el of q('[role="img"]')) if (!el.getAttribute("aria-label")) issues.push("role=img without a label");
  for (const el of q('input[type="range"]')) if (!el.getAttribute("aria-label")) issues.push("range input without a label");
  const ids = q("[id]").map((e) => e.id);
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dupes.length) issues.push(`duplicate ids: ${[...new Set(dupes)].join(", ")}`);
  return issues;
}

async function renderPage(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // Done loading = a heading exists and the loading skeleton is gone.
  await waitFor(
    () => {
      expect(view.container.querySelector("h1"), `no <h1> yet on ${path}`).not.toBeNull();
      expect(view.container.querySelector('[role="status"][aria-label="Loading"]')).toBeNull();
    },
    { timeout: 15_000, interval: 100 },
  );
  // let the shell's own requests (me, pass) settle so the audit sees the final DOM
  await new Promise((r) => setTimeout(r, 400));
  return view;
}

const matrix: { who: "fan" | "artist" | "admin" | null; pages: string[] }[] = [
  { who: null, pages: ["/", "/discover", "/discover?q=mira", "/show/s-kofi-1", "/track/tr-miravale-2", "/artist/miravale", "/artist/kofistatic", "/library", "/studio", "/me", "/policy", "/about", "/help", "/terms", "/privacy", "/signin", "/settings", "/receipts", "/no-such-page"] },
  { who: "fan", pages: ["/", "/show/s-kofi-1", "/track/tr-miravale-2", "/artist/miravale", "/library", "/studio", "/me", "/settings", "/receipts"] },
  { who: "artist", pages: ["/studio", "/studio/profile", "/studio/track/new", "/studio/show/new", "/studio/post/new", "/studio/poll/new", "/studio/tiers", "/artist/miravale", "/me"] },
  { who: "admin", pages: ["/admin", "/me"] },
];

for (const { who, pages } of matrix) {
  describe(`a11y structure [${who ?? "signed out"}]`, () => {
    for (const path of pages) {
      it(path, async () => {
        await login(who);
        const view = await renderPage(path);
        expect(audit(view.container), `${who ?? "signed out"} ${path}`).toEqual([]);
      }, 30_000);
    }
  });
}

describe("behaviour in the rendered app", () => {
  it("a locked supporter post renders as a placeholder, and its text is nowhere in the DOM", async () => {
    await login("fan");
    const view = await renderPage("/artist/miravale");
    await waitFor(() => expect(view.container.textContent).toContain("Front Row"));
    expect(view.container.textContent).not.toContain("Front Row exclusive: the unreleased voice memo");
    expect(view.container.querySelector('[aria-label="Supporter-only post, locked"]')).not.toBeNull();
  }, 30_000);

  it("the artist sees their own supporter-only post in full", async () => {
    await login("artist");
    const view = await renderPage("/artist/miravale");
    await waitFor(() => expect(view.container.textContent).toContain("Front Row exclusive: the unreleased voice memo"));
  }, 30_000);

  it("a non-admin gets the not-found page at /admin, not a hint that it exists", async () => {
    await login("fan");
    const view = await renderPage("/admin");
    expect(view.container.textContent).toContain("Nothing here");
    expect(view.container.textContent).not.toMatch(/Open reports/);
  }, 30_000);

  it("the show page offers a ticket to a non-holder and a chat only to holders", async () => {
    await login(null);
    const view = await renderPage("/show/s-juno-1");
    await waitFor(() => expect(view.container.textContent).toMatch(/Get ticket/));
    expect(view.container.textContent).toMatch(/Get a ticket to join the chat/);
  }, 30_000);

  it("settings: deleting an account needs the word DELETE, and artists cannot delete here", async () => {
    await login("fan");
    const view = await renderPage("/settings");
    await waitFor(() => expect(view.container.textContent).toContain("Delete account"));
    const open = Array.from(view.container.querySelectorAll("button")).find((b) => /Delete my account/.test(b.textContent ?? ""))!;
    fireEvent.click(open);
    const final = () => Array.from(view.container.querySelectorAll("button")).find((b) => /for good/.test(b.textContent ?? ""))! as HTMLButtonElement;
    expect(final().disabled).toBe(true);
    const input = view.container.querySelector<HTMLInputElement>("input[autocapitalize=characters]")!;
    fireEvent.change(input, { target: { value: "delete" } });
    expect(final().disabled).toBe(true);
    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(final().disabled).toBe(false);
    cleanup();
    await login("artist");
    const artistView = await renderPage("/settings");
    await waitFor(() => expect(artistView.container.textContent).toMatch(/can.t be deleted here/));
  }, 30_000);

  it("receipts: signed out asks you to sign in; a fan with no payments sees an empty state", async () => {
    await login(null);
    const out = await renderPage("/receipts");
    await waitFor(() => expect(out.container.textContent).toMatch(/Sign in/));
    cleanup();
    await login("fan");
    const view = await renderPage("/receipts");
    await waitFor(() => expect(view.container.textContent).toMatch(/No payments yet|Confirmed payments/));
  }, 30_000);

  it("studio: the profile editor offers artwork upload, an accent palette and links; the public page shows the extras", async () => {
    await login("artist");
    const view = await renderPage("/studio/profile");
    await waitFor(() => expect(view.container.textContent).toContain("Artwork"));
    const names = Array.from(view.container.querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(names.filter((n) => /Upload|Replace/.test(n ?? "")).length).toBe(2);
    expect(view.container.querySelectorAll('[role="radio"]').length).toBe(7);
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
    fireEvent.click(Array.from(view.container.querySelectorAll("button")).find((b) => /Add a link/.test(b.textContent ?? ""))!);
    expect(view.container.querySelector('input[placeholder="https://"]')).not.toBeNull();
  }, 30_000);

  it("studio: scheduling a show uses plain dropdowns, never the native date-time picker (it can freeze embedded WebViews)", async () => {
    await login("artist");
    const view = await renderPage("/studio/show/new");
    await waitFor(() => expect(view.container.textContent).toContain("Starts at"));
    expect(view.container.querySelector('input[type="datetime-local"], input[type="date"], input[type="time"]')).toBeNull();
    const day = view.container.querySelector<HTMLSelectElement>('select[aria-label="Day"]')!;
    const hour = view.container.querySelector<HTMLSelectElement>('select[aria-label="Hour"]')!;
    const minute = view.container.querySelector<HTMLSelectElement>('select[aria-label="Minute"]')!;
    expect(day && hour && minute).toBeTruthy();
    expect(day.options.length).toBe(60);
    expect(day.options[0].textContent).toMatch(/^Today/);
    expect(day.value).toMatch(/^\d{4}-\d{2}-\d{2}$/); // a valid default is already selected
    fireEvent.change(hour, { target: { value: "21" } });
    fireEvent.change(minute, { target: { value: "30" } });
    await waitFor(() => expect(view.container.querySelector<HTMLSelectElement>('select[aria-label="Hour"]')!.value).toBe("21"));
    expect(view.container.querySelector<HTMLSelectElement>('select[aria-label="Minute"]')!.value).toBe("30");
  }, 30_000);

  it("track page: the preview and the purchase are two separate actions, and a free track just plays", async () => {
    await login(null);
    const view = await renderPage("/track/tr-miravale-2");
    await waitFor(() => expect(view.container.textContent).toContain("Midnight Cue"));
    const buttons = Array.from(view.container.querySelectorAll("button")).map((b) => b.textContent?.trim() ?? "");
    expect(buttons.some((b) => /Play a \d+-second preview/.test(b))).toBe(true);
    expect(buttons.some((b) => /Buy the full track · 2 NIM/.test(b))).toBe(true);
    expect(view.container.textContent).toMatch(/goes straight to Mira Vale.s wallet/);
    cleanup();
    const free = await renderPage("/track/tr-paperlanterns-1");
    await waitFor(() => expect(free.container.textContent).toContain("Free to play in full"));
    expect(Array.from(free.container.querySelectorAll("button")).some((b) => /Buy the full track/.test(b.textContent ?? ""))).toBe(false);
    cleanup();
    const missing = await renderPage("/track/no-such-track");
    await waitFor(() => expect(missing.container.textContent).toMatch(/Nothing here|not found/i));
  }, 30_000);
});
