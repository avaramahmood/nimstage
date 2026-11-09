# NimStage

**Live music, tickets, tracks and tips for independent artists, paid in NIM. Your fans, your stage, your NIM.**

Artists upload tracks, schedule premieres and live shows, sell tickets and supporter tiers, and get paid **directly to their own wallet**: no platform fee, no custody. Fans open a link, hear a preview for free, buy with one tap, follow their favourite artists and see them first, and the full show unlocks once the payment is verified on the Nimiq network. Everyone can also put idle NIM to work from the Earn screen.

It runs as a **phone-first mini app inside [Nimiq Pay](https://nimiq.com)** and also works in a normal browser on phones, tablets, laptops and big screens.

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
| Wallet | `@nimiq/mini-app-sdk` in Nimiq Pay, `@nimiq/core` for signature and address checks on the server |
| Live video | LiveKit (the server mints tokens; the artist publishes, ticket holders watch) |
| Depth | **Three.js** via React Three Fiber: spinning record, shader music ribbons, a grabbable hero record, a flippable 3D ticket, a draggable ring of artist and track tiles (lazy-loaded, ~30fps, steps down on slow devices, plain-DOM fallback without WebGL) |

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

With the defaults in `.env.local` (`NIMSTAGE_DEMO=1`, `NIMSTAGE_DEMO_PAYMENTS=1`) you get an embedded database, five fictional demo artists, and **persona login** (Fan / Artist / Admin buttons on the Me tab) so everything can be tried in a plain browser. Demo audio is synthesized the first time a track is played. Demo payments skip the chain, and demo artists use Nimiq's null address, so **real payments to them are refused**.

To try it inside Nimiq Pay, load your dev server's LAN URL as a custom mini app (see [Load a Local Mini App](https://nimiq.dev/mini-apps/development/load-local-mini-app)) or deploy it over HTTPS.

## What's in it

| Role | What they can do |
|---|---|
| **Everyone** | A unique @username (never a wallet address) chosen on first sign-in, a public profile page for every account with picture, banner, bio, links, accent colour, fan level and the artists you follow, edited with a live preview. The Earn screen (staking). |
| **Fan** | Browse live and upcoming shows, hear a free preview, buy a ticket / 30-day membership, or preview a track and buy it on its own page, tip, watch live full screen, react live (🔥 ❤️ 👏 🎸), chat, vote in setlist polls, **follow artists and see them first**, earn a Fan Pass (levels, XP, badges), share and add shows to a calendar |
| **Artist** | Profile with picture, banner, tagline, accent colour and up to 4 https links; cover art for every track and show (JPEG/PNG/WebP, resized to WebP on the server with location data stripped); payout address, upload MP3 tracks (checked by content, with a rights attestation), schedule audio premieres or live video shows and go live full screen, public or supporter-only posts, up to 3 tiers, setlist polls (optionally tier-gated), verified earnings, and a shortcut to stake them |
| **Admin** | Review reports, take content down, verify or suspend artists |

Player: queue with auto-advance, keyboard shortcuts (space, arrows), lock-screen controls, and a live spectrum.

## In a browser, on any screen

**Layout.** A phone gets one column with a tab bar along the bottom. From tablet width, and on a phone turned on its side, the tab bar becomes a rail down the left, the page grows, and rows of posters become grids. The 3D ring and the hero record stay on every size (the ring is taller on bigger screens). `.wrap`, `.app-nav` and `.rail` in `src/styles/globals.css` hold the rules.

**Signing in without Nimiq Pay** (there is no wallet extension to sign with, so there are two ways, easiest first):

1. **Approve a code from your phone.** The browser shows a short code (e.g. `YQ82-9DWW`). Open NimStage inside Nimiq Pay, go to **Me → Sign in on another device**, type the code and approve. The browser is signed in as the same account within seconds. The code is single use and lasts 10 minutes; the browser polls with a separate private secret that is never shown. (`/api/auth/pair/start | approve | check`)
2. **Prove an address on-chain.** Paste your NQ address, then send one luna (0.00001 NIM) from it to the address shown with the code as the message. A transaction's sender is fixed by its signature, so seeing it on mainnet proves you hold the key; nobody can sign in as an address they don't control. The proof goes to `NIMSTAGE_PROOF_ADDRESS`, else the first admin address, else a built-in valid address nobody holds the key for (and never to the signer's own address, which wallets won't send to). (`/api/auth/address/start | check`)

**Paying in a browser.** The pay sheet shows the artist's address, the amount and the message (`NS:<id>`) with copy buttons. Send it from any Nimiq wallet; the server finds the transaction by its message on the artist's address and settles it with exactly the same checks as a normal payment (`/api/payments/check`).

## Live video

Artists go live from the show page; ticket holders (or everyone, for a free show) watch. Both sides open **full screen** like an Instagram Live: the picture fills the screen (a portrait stream fills a phone, a landscape one is letterboxed), with the artist, a LIVE chip and the watching count on top, the latest chat fading in over the picture, reactions floating up the right edge, a comment box and Tip along the bottom. The host also gets mute, camera off and switch-camera. The same chat and reactions feed the card on the page (`useLiveRoom`), so there is one poll.

Inside Nimiq Pay the camera and microphone are often not available to a mini app. If starting the camera fails there, the artist sees one line, "Switch to your browser to go live", with an **Open in browser** button, and goes live from the browser instead (sign in with the pairing code above). Picture without sound is never offered.

## Follow, and "For you"

Following an artist now changes what you see:

- **Home.** The hero record stays. A live show from an artist you follow is picked as the hero first, and a **For you** row sits right under it: live now, then coming up, then new tracks and public posts from the artists you follow. If you follow nobody, the row is a card with a "Find artists" button.
- **Live banner.** When someone you follow is live, a banner with a **Join** button shows at the top of every screen (the app asks every ~20 seconds while open). You can hide it per show.
- **A dot on the Me tab** when there is anything new since you last looked (a show that went live or was scheduled, a new track, a public post). The Me page lists it under "From artists you follow". Looking at the For you row or that card clears the dot. "Last looked" is kept on the device only.
- **Discover and Library** list followed artists, their shows and tracks first; Discover marks them "Following".

There are no push notifications in a mini app, so this works while the app is open. Supporter-only posts are never included, and the response carries no internal ids or payout details. (`GET /api/me/foryou?since=<iso>`, `server/lib/foryou.ts`, `src/lib/foryou.ts`, `src/components/foryou.tsx`)

## Earn (staking)

Me → **Earn** (also a card in the Studio for artists) lets people stake NIM from inside Nimiq Pay:

- **Before you stake**: four plain notes: where your NIM goes (NimStage never holds it; you confirm every step in Nimiq Pay), that the rate varies (a rough guide of about 8% a year before the pool's fee, labelled an estimate, never a promise), what can go wrong, and that unstaking has a waiting period.
- **Pools**: Nimiq's official validators list, ranked by reliability, each with its fee, payout style (rewards restaked, paid to your wallet, or none) and schedule. The server trims the 1.3 MB official list (logos removed), validates every address, caches it for an hour, and keeps serving the last good copy if the source goes down. It defaults to the most reliable pool that actually pays rewards.
- **Staking**: "Show my staking" shares your Nimiq Pay address and shows your balance and what you have staked. Enter an amount (100 NIM minimum to start) and a rough yearly figure after the pool's fee appears. The app calls `sendNewStakerTransaction` (or `sendStakeTransaction` to add to an existing stake). A wallet reply that isn't a transaction hash is treated as "nothing was sent".
- **Safety**: staking is switched off when Nimiq Pay is on testnet (the pools are mainnet), and the screen is read-only in a normal browser. **Unstaking** needs several separate steps with waits between them, so the screen sends people to Nimiq Pay's own Staking screen for it.

Not built: **support by staking** (a fan's rewards paying for an artist's membership). It needs a pool or validator that pays out to artists, which means an operator people have to trust. (`/api/earn/validators`, `/api/earn/position`, `server/lib/staking.ts`, `src/pages/earn.tsx`)

## How a payment works

```
Fan taps "Get ticket"
  1. server creates a payment intent: recipient = artist's wallet, amount, memo "NS:<id>"
  2. in Nimiq Pay: the app calls nimiq.sendBasicTransactionWithData({ recipient, value, data: memo })
     -> Nimiq Pay shows its native confirmation and returns the transaction hash
     in a browser: the fan sends the same payment by hand and the server finds it by its memo
  3. the server looks the transaction up on a Nimiq node and checks:
       executed ok · to == artist · value >= price · memo == this intent · confirmed
       · this transaction has never settled another purchase
  4. only then does it grant access (ticket / track / 30-day membership)
```

A payment sent but never confirmed in the app (it froze, or the wallet didn't report the hash) is found later by its memo and settled with the same rules. NimStage never holds funds. Audio is gated on the server: everyone can stream a short preview, and the full file only goes to ticket holders, supporters, the artist and admins (Range requests supported). Anything a viewer may not see, such as supporter-only post text, is removed **before** the API response is built, never hidden in the browser.

## Configuration

See [`.env.example`](.env.example). For production:

| Variable | Why |
|---|---|
| `SESSION_SECRET` | Signs session cookies. **Required in production** |
| `DATABASE_URL` | Postgres (Neon works). Unset = embedded PGlite (dev only) |
| `NIMIQ_RPC_URL` | A Nimiq JSON-RPC node (mainnet in production). Used for payments, the browser sign-in proof and staking positions. Without it, real payments stay "pending" |
| `S3_BUCKET` + `S3_*` | S3-compatible storage for audio (Cloudflare R2 has a free tier) |
| `LIVEKIT_*` | LiveKit URL and keys for live video |
| `ADMIN_ADDRESSES` | Comma-separated addresses that become admins on first sign-in |
| `NIMSTAGE_PROOF_ADDRESS` | Optional recipient of the browser sign-in proof transaction (default: first admin address, else a built-in valid address nobody holds the key for) |
| `VALIDATORS_API_URL` | Optional. Where the Earn screen reads the staking pool list (default: Nimiq's official mainnet validators API) |
| `NIMSTAGE_DEMO`, `NIMSTAGE_DEMO_PAYMENTS` | Leave **off** in production |

Production runs as one Node process: `npm run build && npm start` (serves `dist/` and the API on `PORT`). `DEPLOY.md` walks through Render, Neon, R2 and LiveKit.

## Tests

The API must be running for everything except the unit tests. Each API suite expects a fresh database, so the easy way is the runner, which starts its own throwaway server, runs the suite and stops it:

```bash
npm run test:suite -- browser    # also: payments | studio | features | login | a11y | foryou
```

| Command | What it covers |
|---|---|
| `npm run test:unit` | 39 unit tests (Vitest): fan pass, calendar, cover art, units, queue, spectrum, price cap, live-join window, startup config; **staking** (pool list trimming and ranking, staker position, the estimate), **follow ordering** |
| `npm run test:features` | 20 API tests: live room, presence, reactions, polls, fan pass, rate limits |
| `npm run test:studio` | 26 API tests: studio, uploads, tiers, moderation, access control, gated audio, live-video tokens |
| `npm run test:login` | real Ed25519 login (replay, wrong key, tampered message) plus the account routes: rename, export, delete |
| `npm run test:payments` | 13 cases against a mock Nimiq node (server started with `NIMIQ_RPC_URL=http://localhost:4010`), plus recovery of payments the app never heard back about |
| `npm run test:browser` | 31 checks against a mock node: sign-in by proving an address (wrong sender, wrong memo, wrong address, unconfirmed, failed, replay), sign-in by approving a code (single use, wrong code, replay, can't be redeemed on the signature route), paying by hand |
| `npm run test:foryou` | 19 checks: follow, what shows up and in what order, the "new" count behind the dot, supporter-only posts never shown, bad input, no ids or payout addresses leaked, each user sees only their own follows |
| `npm run test:earn` | 18 checks against a mock validators API and a mock node: the pool list (unlisted, ranking, logos stripped, odd values clamped), a staker's position (no staker, both reply shapes, numeric strings), and failure behaviour (list down, node down, no list ever loaded). Start the server with `VALIDATORS_API_URL=http://localhost:4020/validators NIMIQ_RPC_URL=http://localhost:4021`; set `BASE_DEAD` to a second server with an unreachable list to include the 503 check |
| `npm run test:a11y` | 58 tests: mounts the real app in jsdom per role and checks structure and behaviour |
| `npm run test:contrast` | WCAG AA for 28 text/background pairs, including tinted chips |
| `npm run lint && npm run typecheck` | |

## Verified, and not

**Verified (all of the above passing):** gated audio and previews; payment rules (wrong recipient, underpayment, wrong or missing memo, failed execution, unconfirmed, replayed transaction); wallet-login verification; browser sign-in by code and by on-chain proof against a mock node; follow ordering, the live banner and the "new" dot; the staking screen in a browser driven by a **fake** Nimiq Pay wallet (it sends the right call for the right amount, refuses less than 100 NIM, and is switched off on testnet); the validator list read from Nimiq's real official API; tier-gated polls; rate limits; a taken-down track no longer leaks via shows; locked post text absent from the API response and the DOM; page structure for four roles; layouts at phone, tablet, laptop, 1080p and ultrawide sizes; the full-screen live view with a host and a viewer on a real LiveKit room and a synthetic camera; a production build in a few seconds.

**Not verified (needs Nimiq Pay, a live node, or real hardware):**
- **Staking has never moved real NIM.** The staking calls come from the SDK's types and ran only against a fake wallet. Try 100 NIM on a real phone first. How a real node reports a staker who has a waiting-to-unstake balance was not seen (the field names are best-effort), so that part of the position display is a guess.
- **The browser sign-in has not been run with a real wallet on mainnet.** The server's reading of mainnet transactions (`from`, `to`, memo, confirmations) was checked against the live node, and the rules against a mock. Whether Nimiq Pay's own wallet lets you add a message to a 0.00001 NIM transaction was not tried; sign-in by approving a code from the phone avoids that.
- Nimiq Pay's real `sign()` digest. The server accepts the three plausible ones, but this hasn't run on a device.
- The memo path against a live node end to end: the response shape of `getTransactionByHash` was checked against `rpc.nimiqwatch.com`, but a payment made by this app has not yet been looked up and settled on mainnet.
- Camera and microphone inside Nimiq Pay. The mini app SDK has no permission call for them, and whether Nimiq Pay's web view allows them to a mini app is not documented. That is why the app sends artists to the browser to go live. A real phone camera has not been tried either.
- The S3/R2 storage backend against a real bucket (it runs in production, but the test suites use local disk).
- The Three.js scenes on a phone and in Nimiq Pay's WebView. jsdom has no WebGL, so tests exercise the fallbacks.

## Project layout

```
src/       the single-page app (pages, components, client libs)
server/    Hono API: routes/, lib/ (db, data, payments, nimiq, session, seed, storage, views, foryou, staking)
shared/    pure code used by both sides (units, fan pass, calendar, cover art, queue)
tests/     Vitest: unit + rendered-app tests
scripts/   API suites and the suite runner, login and payment checks, contrast check, demo runner
```

## License

MIT
