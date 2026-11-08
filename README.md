# NimStage

**Tickets, premieres and fan memberships for independent musicians, paid in NIM inside [Nimiq Pay](https://nimiq.com).**

Artists schedule a premiere, sell tickets and supporter tiers, and get paid **directly to their own wallet**: no platform fee, no custody. Fans open a link, hear a preview for free, buy with one tap, and the full show unlocks once the payment is verified on the Nimiq network.

Built for the Nimiq Mini Apps Competition. MIT licensed.

## Icon

`node scripts/make-icons.mjs` draws the app icon (a hexagonal record under a stage spotlight, equalizer bars as its label)
and writes `public/icon.svg`, `favicon.svg`, the PNG sizes (192, 512, a maskable 512, the iOS 180) and the web manifest.
The same mark is drawn in the app header by `src/components/logo.tsx`.

## Stack

| Layer | Choice |
|---|---|
| App | **Vite** + React 19 + TypeScript, React Router, TanStack Query, Tailwind 4 |
| API | **Hono** on Node (one process serves the API and the built app) |
| Images | `sharp` re-encodes every upload (resize, WebP, EXIF removed); stored in the same bucket as audio, served from `/api/img/<key>` with a one-year cache |
| Data | Drizzle ORM: embedded Postgres (PGlite) locally, Neon in production |
| Wallet | `@nimiq/mini-app-sdk` in the browser, `@nimiq/core` for signature checks on the server |
| Depth | **Three.js** via React Three Fiber: spinning record, shader music ribbons, a grabbable hero record, a flippable 3D ticket, a draggable ring of artist and track tiles (always on; lazy-loaded, ~30fps, steps down on slow devices, plain-DOM fallback without WebGL) |

Why this shape: Vite has no compile-on-demand, so dev start and hot reload are near-instant; the app is a single-page app, so navigation after the first load is instant (links prefetch page data on hover/touch); and the 3D stage is one lazy-loaded canvas that detects software rendering, watches its own frame time and steps down (never switches off); without WebGL it shows plain tiles.

## Run it

```bash
npm install
npm run dev      # API on :8787, app on http://localhost:5173 (hot reload)
```

or, the fast production version of everything:

```bash
npm run demo     # builds, then serves app + API on http://localhost:3000
```

With the defaults in `.env.local` (`NIMSTAGE_DEMO=1`, `NIMSTAGE_DEMO_PAYMENTS=1`) you get an embedded database, five fictional demo artists, and **persona login** (Fan / Artist / Admin buttons on the Me tab) so everything can be tried in a plain browser. Demo audio is synthesized the first time a track is played. Demo payments skip the chain, and demo artists use Nimiq's burn address, so **real payments to them are refused**.

To try it inside Nimiq Pay, load your dev server's LAN URL as a custom mini app (see [Load a Local Mini App](https://nimiq.dev/mini-apps/development/load-local-mini-app)) or deploy it over HTTPS.

## What's in it

| Role | What they can do |
|---|---|
| **Everyone** | A unique @username (never a wallet address) chosen on first sign-in, a public profile page for every account with picture, banner, bio, links, accent colour, fan level and the artists you follow, edited with a live preview |
| **Fan** | Browse live and upcoming shows, hear a free preview, buy a ticket / 30-day membership, or preview a track and buy it on its own page, tip, react live (🔥 ❤️ 👏 🎸), chat, vote in setlist polls, follow artists, earn a Fan Pass (levels, XP, badges), share and add shows to a calendar |
| **Artist** | Profile with picture, banner, tagline, accent colour and up to 4 https links; cover art for every track and show (JPEG/PNG/WebP, resized to WebP on the server with location data stripped); payout address, upload MP3 tracks (checked by content, with a rights attestation), schedule audio premieres or live video shows, public or supporter-only posts, up to 3 tiers, setlist polls (optionally tier-gated), verified earnings |
| **Admin** | Review reports, take content down, verify or suspend artists |

Player: queue with auto-advance, keyboard shortcuts (space, arrows), lock-screen controls, and a live spectrum.

## How a payment works

```
Fan taps "Get ticket"
  1. server creates a payment intent: recipient = artist's wallet, amount, memo "NS:<id>"
  2. the app calls nimiq.sendBasicTransactionWithData({ recipient, value, data: memo })
     -> Nimiq Pay shows its native confirmation and returns the transaction hash
  3. the server looks the transaction up on a Nimiq node and checks:
       executed ok · to == artist · value >= price · memo == this intent · confirmed
       · this transaction has never settled another purchase
  4. only then does it grant access (ticket / track / 30-day membership)
```

NimStage never holds funds. Audio is gated on the server: everyone can stream a short preview, and the full file only goes to ticket holders, supporters, the artist and admins (Range requests supported). Anything a viewer may not see, such as supporter-only post text, is removed **before** the API response is built, never hidden in the browser.

## Configuration

See [`.env.example`](.env.example). For production:

| Variable | Why |
|---|---|
| `SESSION_SECRET` | Signs session cookies. **Required in production** |
| `DATABASE_URL` | Postgres (Neon works). Unset = embedded PGlite (dev only) |
| `NIMIQ_RPC_URL` | A Nimiq JSON-RPC node for `getTransactionByHash`. Without it, real payments stay "pending" |
| `S3_BUCKET` + `S3_*` | S3-compatible storage for audio (Cloudflare R2 has a free tier) |
| `ADMIN_ADDRESSES` | Comma-separated addresses that become admins on first sign-in |
| `NIMSTAGE_PROOF_ADDRESS` | Optional recipient of the browser sign-in proof transaction (default: first admin address, else the burn address) |
| `NIMSTAGE_DEMO`, `NIMSTAGE_DEMO_PAYMENTS` | Leave **off** in production |

Production runs as one Node process: `npm run build && npm start` (serves `dist/` and the API on `PORT`).

## Tests

The API must be running for everything except the unit tests. Run against a fresh database for repeatable results.

```bash
npm run test:unit       # 24 unit tests (Vitest): fan pass, calendar, cover art, units, queue, spectrum, price cap, live-join window, startup config
npm run test:features   # 20 API tests: live room, presence, reactions, polls, fan pass, rate limits
npm run test:studio     # 16 API tests: studio, uploads, tiers, moderation, access control, gated audio, live-video tokens
npm run test:login      # real Ed25519 login (replay, wrong key, tampered message) plus the account routes: rename, export, delete
npm run test:payments   # 13 cases against a mock Nimiq node (start the server with NIMIQ_RPC_URL=http://localhost:4010)
npm run test:a11y       # 43 tests: mounts the real app in jsdom per role and checks structure and behaviour
npm run test:contrast   # WCAG AA for 28 text/background pairs, including tinted chips
npm run lint && npm run typecheck
```

## Verified, and not

**Verified (all of the above passing):** gated audio and previews; payment rules (wrong recipient, underpayment, wrong or missing memo, failed execution, unconfirmed, replayed transaction); wallet-login verification; tier-gated polls; rate limits; a taken-down track no longer leaks via shows; locked post text absent from the API response and the DOM; page structure for four roles; a production build in about a second.

**Not verified (needs Nimiq Pay, a live node, or real hardware):**
- Nimiq Pay's real `sign()` digest. The server accepts the three plausible ones, but this hasn't run on a device.
- The memo path against a live node. The response shape of `getTransactionByHash` was checked against `rpc.nimiqwatch.com` (a real mainnet transaction: `result.data` with `to`, `value`, `recipientData` hex, `confirmations`, `executionResult`), but a payment made by this app has not yet been looked up end to end.
- The S3/R2 storage backend (never run against a real bucket).
- The Three.js scenes (record, ticket, tile ring, ribbons) were checked by eye in desktop Chrome on an Intel GPU (60fps). Not yet checked on a phone, in Nimiq Pay's WebView, or at phone width. jsdom has no WebGL, so tests exercise the fallbacks.
- Real camera streaming from a phone, and the Nimiq Pay WebView's camera/microphone permission. Live video works end to end in desktop Chrome with a synthetic test stream (an artist token publishes, a signed-in viewer watches a free show), but a real camera, a real phone and Nimiq Pay have not been tried. Audio premieres are separate: pre-recorded audio played on a schedule.

## Project layout

```
src/       the single-page app (pages, components, client libs)
server/    Hono API: routes/, lib/ (db, data, payments, nimiq, session, seed, storage, views)
shared/    pure code used by both sides (units, fan pass, calendar, cover art, queue)
tests/     Vitest: unit + rendered-app tests
scripts/   API suites, login and payment checks, contrast check, demo runner
```

## License

MIT
