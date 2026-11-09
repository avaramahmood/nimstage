import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { ZodError } from "zod";
import { getDb } from "@srv/db";
import { HttpError } from "@srv/http";
import { PaymentError } from "@srv/payments";
import { auth } from "./routes/auth";
import { account } from "./routes/account";
import { images } from "./routes/images";
import { profile } from "./routes/profile";
import { payments } from "./routes/payments";
import { media } from "./routes/media";
import { shows } from "./routes/shows";
import { polls } from "./routes/polls";
import { social } from "./routes/social";
import { studio } from "./routes/studio";
import { admin } from "./routes/admin";
import { pages } from "./routes/pages";
import { earn } from "./routes/earn";
import { checkEnv } from "@srv/env";
import { clearCache, swr } from "@srv/cache";
import { discoverView, homeView } from "@srv/views";

const prod = process.env.NODE_ENV === "production";
{
  const { errors, warnings } = checkEnv();
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[config] ${e}`);
    process.exit(1);
  }
}
export const app = new Hono();

const api = new Hono();
// API responses are per-user and live: never cache them (the media route sets its own headers).
api.use("*", async (c, next) => {
  await next();
  if (!c.res.headers.has("cache-control")) c.res.headers.set("cache-control", "no-store");
  // A write by an artist, an admin (takedowns, suspensions) or a payment can change what home and discover show.
  if (c.req.method !== "GET" && /^\/api\/(studio|admin|payments|reports|me)\b/.test(c.req.path)) clearCache();
});
for (const r of [auth, account, profile, images, payments, media, shows, polls, social, studio, admin, pages, earn]) api.route("/", r);
// Cheap liveness probe for the host (no database call, so a slow database can't fail the deploy).
api.get("/health", (c) => c.json({ ok: true }));
api.notFound((c) => c.json({ error: "Not found" }, 404));
app.route("/api", api);

app.onError((err, c) => {
  if (err instanceof HttpError || err instanceof PaymentError) return c.json({ error: err.message }, err.status as 400);
  if (err instanceof ZodError) return c.json({ error: err.issues[0]?.message ?? "Invalid input" }, 400);
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

// Production: serve the built single-page app (with its fallback to index.html for client-side routes).
if (prod) {
  if (!existsSync("./dist/index.html")) console.warn("dist/ not found: run `npm run build` first.");
  app.use("/assets/*", serveStatic({ root: "./dist", onFound: (_p, c) => c.header("cache-control", "public, max-age=31536000, immutable") }));
  // HTML must be revalidated on every load: it names the current hashed assets, so a cached copy would
  // keep serving an old build after a deploy.
  const html = {
    onFound: (p: string, c: { header: (k: string, v: string) => void }) => {
      if (p.endsWith(".html")) c.header("cache-control", "no-cache");
    },
  };
  app.use("*", serveStatic({ root: "./dist", ...html }));
  app.get("*", serveStatic({ path: "./dist/index.html", ...html }));
}

const port = Number(process.env.PORT ?? (prod ? 3000 : (process.env.API_PORT ?? 8787)));
// Open the database (create tables, seed demo data) before the first request arrives.
await getDb();
// Warm the public pages now, so the first visitor after a deploy or restart gets them from memory.
void Promise.all([swr("home", 15_000, 600_000, homeView), swr("discover:", 15_000, 600_000, () => discoverView(""))]).catch(() => {});
serve({ fetch: app.fetch, port }, () => console.log(`NimStage ${prod ? "(production) " : "API "}listening on http://localhost:${port}`));
