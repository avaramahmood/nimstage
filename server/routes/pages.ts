import { Hono } from "hono";
import { HttpError, requireUser } from "@srv/http";
import { getUser } from "@srv/session";
import { swr } from "@srv/cache";
import { randomArtistHandle } from "@srv/data";
import { accessCtx, adminView, artistView, discoverView, forYouView, homeView, libraryView, studioView, trackView } from "@srv/views";

export const pages = new Hono();

// Public and identical for everyone, so it is served from memory (see lib/cache.ts) even while the database sleeps.
pages.get("/home", async (c) => c.json(await swr("home", 15_000, 600_000, homeView)));

pages.get("/discover", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 60);
  return c.json(await swr(`discover:${q.toLowerCase()}`, 15_000, 600_000, () => discoverView(q)));
});

pages.get("/artists/:handle", async (c) => {
  const view = await artistView(c.req.param("handle"), await accessCtx(await getUser(c)));
  if (!view) throw new HttpError("Artist not found", 404);
  return c.json(view);
});

pages.get("/tracks/:id", async (c) => {
  const view = await trackView(c.req.param("id"), await accessCtx(await getUser(c)));
  if (!view) throw new HttpError("Track not found", 404);
  return c.json(view);
});

pages.get("/library", async (c) => c.json(await libraryView((await requireUser(c)).id)));

// What the artists you follow are up to: live now, coming up, new tracks and posts. `since` (an ISO time) is when you last looked.
pages.get("/me/foryou", async (c) => {
  const user = await requireUser(c);
  const raw = c.req.query("since");
  const t = raw ? new Date(raw) : undefined;
  return c.json(await forYouView(user.id, t && !Number.isNaN(+t) ? t : undefined));
});

pages.get("/studio", async (c) => c.json(await studioView(await requireUser(c))));

pages.get("/admin", async (c) => {
  const user = await getUser(c);
  if (user?.role !== "admin") throw new HttpError("Not found", 404); // don't reveal that the page exists
  return c.json(await adminView());
});

/** "Surprise me": a random artist's handle (the client navigates to it). */
pages.get("/surprise", async (c) => c.json({ handle: await randomArtistHandle() }));
