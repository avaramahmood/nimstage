import { Hono } from "hono";
import { HttpError, requireUser } from "@srv/http";
import { getUser } from "@srv/session";
import { randomArtistHandle } from "@srv/data";
import { accessCtx, adminView, artistView, discoverView, homeView, libraryView, studioView, trackView } from "@srv/views";

export const pages = new Hono();

pages.get("/home", async (c) => c.json(await homeView()));

pages.get("/discover", async (c) => c.json(await discoverView((c.req.query("q") ?? "").trim().slice(0, 60))));

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

pages.get("/studio", async (c) => c.json(await studioView(await requireUser(c))));

pages.get("/admin", async (c) => {
  const user = await getUser(c);
  if (user?.role !== "admin") throw new HttpError("Not found", 404); // don't reveal that the page exists
  return c.json(await adminView());
});

/** "Surprise me": a random artist's handle (the client navigates to it). */
pages.get("/surprise", async (c) => c.json({ handle: await randomArtistHandle() }));
