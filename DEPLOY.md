# Deploying NimStage

NimStage is one Node process: the Hono API plus the built React app, served on one port. Hosting it needs
an HTTPS URL (Nimiq Pay won't load a plain `http://` app outside your local network), a Postgres database,
a place for uploaded audio, and a Nimiq RPC node to verify payments.

Free tiers change. Check each service's pricing page when you sign up.

## 1. Where each value goes

- **Local development:** `.env.local` in this folder. It is git-ignored. `npm start` and `npm run dev` read it.
- **Production:** the Render dashboard, under your service's **Environment** tab. Never commit secrets, and
  never paste them into a chat.

`.env.example` lists everything; this file explains where each value comes from.

## 2. Variables

### Required in production

| Variable | What it is | How to get it |
|---|---|---|
| `SESSION_SECRET` | Signs login cookies. The server refuses to start sessions in production without it. | Generate it yourself: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. No account needed. Keep it stable: changing it signs everyone out. |
| `DATABASE_URL` | Postgres connection string. | See [Database](#3-database). |
| `NIMIQ_RPC_URL` | A Nimiq JSON-RPC node, used to look up a payment by hash. Without it real payments stay "pending". | See [Nimiq RPC](#5-nimiq-rpc). |
| `ADMIN_ADDRESSES` | Comma-separated Nimiq addresses that become admins the first time they sign in. | Your own wallet address from Nimiq Pay (starts with `NQ`). It is public, not secret. |
| `NODE_ENV` | Set to `production`. | `npm start` already sets it; on Render set it explicitly. |

### Media storage (needed on Render)

Render's disk is wiped on every deploy, so uploaded audio must live in a bucket. When `S3_BUCKET` is set, audio goes there; otherwise it goes to local disk (`MEDIA_DIR`), which is fine only on your own machine.

| Variable | Value |
|---|---|
| `S3_BUCKET` | Bucket name |
| `S3_ENDPOINT` | Cloudflare R2: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` for R2 |
| `S3_ACCESS_KEY_ID` | From an R2 API token |
| `S3_SECRET_ACCESS_KEY` | From the same token (shown once) |

How to get them: see [Cloudflare R2](#4-media-storage-cloudflare-r2).

### Live video (LiveKit)

| Variable | Value |
|---|---|
| `LIVEKIT_URL` | `wss://<your-project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | A key from the project's Settings → Keys |
| `LIVEKIT_API_SECRET` | The matching secret |

Create a free project at cloud.livekit.io. Without these three, artists can't schedule or start live video shows
(audio premieres are unaffected). Check your keys any time with:

```bash
npx tsx --env-file=.env.local scripts/check-livekit.mts
```

### Optional / local only

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` in production | Render sets this itself; don't override. |
| `NIMSTAGE_SEED` | `1` | Seeds the fictional demo artists (Mira Vale etc.) on an empty database. Set `0` for a clean production database. |
| `NIMSTAGE_DEMO` | `0` | Enables the Fan / Artist / Admin persona login. **Leave `0` in production.** |
| `NIMSTAGE_DEMO_PAYMENTS` | `0` | Skips on-chain checks for `demo-` transactions. **Never enable with real money.** |
| `MEDIA_DIR` | `./.data/media` | Local audio folder. |
| `PGLITE_DIR` | `./.data/pglite` | Local embedded database, used only when `DATABASE_URL` is unset. |
| `API_PORT` | `8787` | Dev-only API port behind Vite's proxy. |

## 3. Database

NimStage creates its tables automatically on first start.

**Neon** works today: create a project and copy its connection string into `DATABASE_URL`.

The app connects with a standard Postgres driver (`postgres`), so **Neon, Supabase or any other Postgres**
works: set `DATABASE_URL` and nothing else. It uses a small connection pool (`DB_POOL_MAX`, default 5) and works
behind a transaction pooler. Verified against Neon. Supabase has not been tried with a real project.

For **Supabase**:

1. supabase.com → New project. Save the database password somewhere safe.
2. Project → **Connect** (or Settings → Database) → copy the **pooler** connection string, not the direct one.
   Render connects over IPv4, and Supabase's direct connection is IPv6-only on the free plan. Confirm this in
   Supabase's current docs.
3. Replace `[YOUR-PASSWORD]` in the string and put the whole thing in `DATABASE_URL`.

Free Supabase projects pause after a period of inactivity. A paused database makes the app fail, so check it
is awake before any judging or demo.

## 4. Media storage (Cloudflare R2)

1. dash.cloudflare.com → sign up (free) → **R2 Object Storage** → create a bucket (any name; that is `S3_BUCKET`).
   R2 may ask for a payment method to enable, even for the free allowance.
2. R2 overview → copy your **Account ID** into the endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. R2 → **Manage API tokens** → create a token with **Object Read & Write** limited to your bucket. Copy the
   **Access Key ID** and **Secret Access Key** immediately; the secret is shown once.
4. Keep the bucket private. The server streams audio itself so it can apply ticket and preview rules; do not
   make the bucket public.

This storage path has never been run against a real bucket. The first upload after deploy is the test.

## 5. Nimiq RPC

`NIMIQ_RPC_URL` must be a Nimiq node that answers `getTransactionByHash` over JSON-RPC.

- The Nimiq developer docs list open servers at <https://nimiq.dev/rpc/open-servers>. They are meant for
  testing, not production. Two are run by the community member sisou: testnet `https://rpc.testnet.nimiqwatch.com`
  and mainnet `https://rpc.nimiqwatch.com`. Both answered `getTransactionByHash` in a check on 2026-11-08.
- For testing, use a **testnet** endpoint together with Nimiq Pay in testnet mode (a hidden dev menu in the
  app). Mainnet only when you are ready to take real NIM.
- Running your own node is the production answer. It is not needed to enter.

**The RPC network must match the network people pay on.** Nimiq Pay pays on mainnet unless its hidden dev menu switches
it to testnet. If `NIMIQ_RPC_URL` points at testnet while people pay on mainnet (or the reverse), the node can't find
their payments and they stay "pending". Real NIM means `https://rpc.nimiqwatch.com`.

**Payments are recovered automatically.** If a payment reaches the artist's wallet but the app never learns the transaction
hash (the app froze or was closed mid-checkout), the server finds it by its memo (`NS:<id>`) in the artist's recent incoming
transactions and settles it with the same checks as a normal confirmation. This runs when someone opens the app, their
Receipts, or the Studio, so earnings catch up on their own. Payments still pending after 7 days are no longer retried.

Not verified yet: the exact response shape of a live node, and whether the payment memo appears where the code
expects it. The first real testnet payment settles this.

## 6. Render

1. Push the code to a GitHub repo (create a private one; nothing is pushed yet).
2. render.com → New → **Web Service** → connect the repo.
3. Settings:
   - Runtime: Node
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`
4. Environment tab → add the variables from section 2.
5. Deploy. You get an `https://<name>.onrender.com` URL.

Free Render web services sleep after about 15 minutes without traffic, and the first request afterwards is
slow. Wake it before a demo, or use a paid instance.

The repo includes a `render.yaml` Blueprint that sets steps 3 and 4 up for you (New → Blueprint → pick the repo).
Secrets are marked `sync: false`, so you enter them in the dashboard. It builds with `npm ci --include=dev` because the
build and `npm start` need dev tools (vite, tsx).

In production the server checks its configuration on boot: it refuses to start without a 32+ character
`SESSION_SECRET` or with `NIMSTAGE_DEMO_PAYMENTS=1`, and prints warnings for a missing database, bucket, RPC URL or
admin address.

## 7. Load it in Nimiq Pay

1. Install Nimiq Pay on your phone. For testing, switch it to testnet (hidden dev menu).
2. Mini Apps → **Custom URL** → paste your `https://...onrender.com` URL.
3. Sign in with Nimiq Pay, then try a tip or a ticket.

For the competition itself, register at miniappscompetition.com and submit the same URL plus a public social
post about the app. Cycle II closed on 2026-09-18; the next cycle's dates are not yet confirmed here.

## 8. Checklist before you share the link

- [ ] `SESSION_SECRET` set and not the demo one
- [ ] `NIMSTAGE_DEMO=0` and `NIMSTAGE_DEMO_PAYMENTS=0`
- [ ] `ADMIN_ADDRESSES` is your address
- [ ] `NIMIQ_RPC_URL` set (testnet while testing)
- [ ] `S3_*` set and a test upload plays back
- [ ] Database is awake
- [ ] A tip of 1 to 2 NIM from a second wallet shows as confirmed (you cannot pay yourself)
- [ ] Demo artists cannot receive real payments (their payout address is a burn address); to demo real
      payments, create a real artist with your own payout address and pay from a different wallet

## 9. Tests before deploy

Check storage and the bucket with your real `.env.local`:

```bash
npx tsx --env-file=.env.local scripts/check-storage.mts
```


```bash
npm run lint && npm run typecheck && npm run build
npm run test:unit
# with a fresh local database and NIMSTAGE_DEMO=1 NIMSTAGE_DEMO_PAYMENTS=1:
npm run test:features && npm run test:studio && npm run test:login
BASE=http://localhost:3000 npm run test:a11y
```

The payments suite also needs a mock Nimiq node; see the README.
