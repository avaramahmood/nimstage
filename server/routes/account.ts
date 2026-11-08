import { Hono } from "hono";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@srv/db";
import { HttpError, body, rateLimit, requireUser } from "@srv/http";
import { clearSession } from "@srv/session";
import { getArtistByUser } from "@srv/data";
import { reconcileSoon } from "@srv/payments";
import { ACCENT_KEYS, MAX_LINKS, isSafeLink } from "@shared/artist";
import { deleteMedia } from "@srv/storage";

export const account = new Hono();

const { users, paymentIntents, entitlements, follows, pollVotes, chatMessages, shows, tracks, tiers, artists } = schema;

account.patch("/me", async (c) => {
  const user = await requireUser(c);
  rateLimit(`rename:${user.id}`, 10, 60_000);
  const b = z
    .object({
      displayName: z.string().trim().min(2, "Use at least 2 characters").max(30, "Use 30 characters or fewer").optional(),
      bio: z.string().trim().max(160, "Keep your bio under 160 characters").optional(),
      accent: z.enum([...ACCENT_KEYS, ""]).optional(),
      links: z
        .array(z.object({ label: z.string().trim().min(1, "Give each link a label").max(24, "Link labels are 24 characters at most"), url: z.string().trim().refine(isSafeLink, "Links must be full https:// addresses") }))
        .max(MAX_LINKS, `At most ${MAX_LINKS} links`)
        .optional(),
      showPass: z.boolean().optional(),
    })
    .parse(await body(c));
  const patch: Partial<typeof users.$inferInsert> = {};
  if (b.displayName !== undefined) patch.displayName = b.displayName;
  if (b.bio !== undefined) patch.bio = b.bio;
  if (b.accent !== undefined) patch.accent = b.accent;
  if (b.links !== undefined) patch.links = JSON.stringify(b.links);
  if (b.showPass !== undefined) patch.showPass = b.showPass;
  if (!Object.keys(patch).length) throw new HttpError("Nothing to change");
  const db = await getDb();
  await db.update(users).set(patch).where(eq(users.id, user.id));
  return c.json({ ok: true, name: b.displayName ?? user.displayName });
});

/**
 * What this person has paid for, newest first: confirmed payments, plus ones still being checked (so a payment
 * that is slow to confirm is visible instead of silently missing). Failed or abandoned attempts are not listed.
 */
async function receiptsFor(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(paymentIntents).where(eq(paymentIntents.userId, userId)).orderBy(desc(paymentIntents.createdAt)).limit(200);
  const paid = rows.filter((r) => r.status === "confirmed" || (r.status === "pending" && Date.now() - r.createdAt.getTime() < 7 * 86_400_000));
  const ids = (kind: string) => [...new Set(paid.filter((r) => r.kind === kind && r.refId).map((r) => r.refId!))];
  const [sh, tr, ti, ar] = await Promise.all([
    ids("ticket").length ? db.select({ id: shows.id, title: shows.title }).from(shows).where(inArray(shows.id, ids("ticket"))) : [],
    ids("track").length ? db.select({ id: tracks.id, title: tracks.title }).from(tracks).where(inArray(tracks.id, ids("track"))) : [],
    ids("membership").length ? db.select({ id: tiers.id, title: tiers.name }).from(tiers).where(inArray(tiers.id, ids("membership"))) : [],
    paid.length ? db.select({ id: artists.id, name: artists.name }).from(artists).where(inArray(artists.id, [...new Set(paid.map((r) => r.artistId))])) : [],
  ]);
  const title = new Map<string, string>([...sh, ...tr, ...ti].map((x) => [x.id, x.title]));
  const artistName = new Map(ar.map((a) => [a.id, a.name]));
  return paid.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status as "confirmed" | "pending",
    item: (r.refId && title.get(r.refId)) || (r.kind === "tip" ? "Tip" : "Removed item"),
    artist: artistName.get(r.artistId) ?? "Artist",
    amountLuna: r.amountLuna,
    txHash: r.txHash,
    at: (r.confirmedAt ?? r.createdAt).toISOString(),
  }));
}

account.get("/me/receipts", async (c) => {
  const user = await requireUser(c);
  await reconcileSoon({ userId: user.id });
  return c.json({ receipts: await receiptsFor(user.id) });
});

/** Everything NimStage holds about this account, as a download. */
account.get("/me/export", async (c) => {
  const user = await requireUser(c);
  rateLimit(`export:${user.id}`, 5, 60_000);
  const db = await getDb();
  const [ents, fol, msgs, receipts] = await Promise.all([
    db.select().from(entitlements).where(eq(entitlements.userId, user.id)),
    db.select().from(follows).where(eq(follows.userId, user.id)),
    db.select({ showId: chatMessages.showId, body: chatMessages.body, createdAt: chatMessages.createdAt }).from(chatMessages).where(eq(chatMessages.userId, user.id)),
    receiptsFor(user.id),
  ]);
  c.header("content-disposition", 'attachment; filename="nimstage-my-data.json"');
  return c.json({ exportedAt: new Date().toISOString(), account: { id: user.id, name: user.displayName, username: user.username, bio: user.bio, address: user.address, role: user.role, createdAt: user.createdAt }, access: ents, following: fol, chatMessages: msgs, receipts });
});

/**
 * Deletes a fan account: personal activity is removed and the account is anonymised. Payment records are
 * kept (they are financial history shared with the artist) but no longer point at a name or a wallet.
 * Artists and admins can't self-delete: that would orphan shows and listings.
 */
account.delete("/me", async (c) => {
  const user = await requireUser(c);
  rateLimit(`delete:${user.id}`, 3, 60_000);
  const { confirm } = z.object({ confirm: z.literal("DELETE", { error: 'Type DELETE to confirm' }) }).parse(await body(c));
  void confirm;
  if (user.role !== "fan" || (await getArtistByUser(user.id))) throw new HttpError("Artist and admin accounts can't be deleted here. Ask an admin.", 403);
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(follows).where(eq(follows.userId, user.id));
    await tx.delete(pollVotes).where(eq(pollVotes.userId, user.id));
    await tx.delete(chatMessages).where(eq(chatMessages.userId, user.id));
    await tx.delete(entitlements).where(eq(entitlements.userId, user.id));
    // Frees the wallet address: signing in with it again creates a fresh, empty account.
    await tx
      .update(users)
      .set({ displayName: "Deleted account", address: `deleted-${user.id}`, username: null, avatarKey: null, bannerKey: null, bio: "", links: "[]", accent: "" })
      .where(eq(users.id, user.id));
  });
  for (const k of [user.avatarKey, user.bannerKey]) if (k) void deleteMedia(k);
  clearSession(c);
  return c.json({ ok: true });
});
