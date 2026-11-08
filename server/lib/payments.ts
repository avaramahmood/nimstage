import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@srv/db";
import { newId } from "@srv/ids";
import { fetchChainTx, sameAddress } from "@srv/nimiq";
import { getArtistById, getShow, getTrack } from "@srv/data";
import { MAX_LUNA, nimToLuna } from "@shared/units";
import type { SessionUser } from "@srv/session";

const { paymentIntents, entitlements, tiers } = schema;
export type Intent = typeof paymentIntents.$inferSelect;
export type IntentKind = "ticket" | "tip" | "membership" | "track";

export const TIP_MIN = nimToLuna(0.1);
export const TIP_MAX = MAX_LUNA;
const MEMBERSHIP_DAYS = 30;

export class PaymentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Demo payments skip the chain. Only ever enabled explicitly, never in production by default. */
export const demoPaymentsEnabled = () => process.env.NIMSTAGE_DEMO_PAYMENTS === "1";

export async function createIntent(user: SessionUser, input: { kind: IntentKind; refId?: string; amountLuna?: number }): Promise<Intent> {
  const db = await getDb();
  let artistId: string;
  let amount: number;

  if (input.kind === "ticket") {
    const show = input.refId ? await getShow(input.refId) : null;
    if (!show || show.status !== "scheduled") throw new PaymentError("Show not found", 404);
    if (show.priceLuna <= 0) throw new PaymentError("This show is free");
    artistId = show.artistId;
    amount = show.priceLuna;
  } else if (input.kind === "track") {
    const track = input.refId ? await getTrack(input.refId) : null;
    if (!track || track.status !== "published") throw new PaymentError("Track not found", 404);
    if (track.priceLuna <= 0) throw new PaymentError("This track is free");
    artistId = track.artistId;
    amount = track.priceLuna;
  } else if (input.kind === "membership") {
    const [tier] = input.refId ? await db.select().from(tiers).where(eq(tiers.id, input.refId)).limit(1) : [];
    if (!tier) throw new PaymentError("Tier not found", 404);
    artistId = tier.artistId;
    amount = tier.priceLuna;
  } else {
    // tip: refId is the artist id (or a show id, resolved to its artist)
    const show = input.refId ? await getShow(input.refId) : null;
    const direct = !show && input.refId ? await getArtistById(input.refId) : null;
    const resolved = show?.artistId ?? direct?.id;
    if (!resolved) throw new PaymentError("Artist not found", 404);
    artistId = resolved;
    amount = Math.round(input.amountLuna ?? 0);
    if (!Number.isFinite(amount) || amount < TIP_MIN || amount > TIP_MAX) throw new PaymentError("Tip must be between 0.1 and 5 NIM");
  }

  // Belt and braces: a row saved before the cap existed must never be charged above it.
  if (amount > MAX_LUNA) throw new PaymentError("This costs more than NimStage allows (5 NIM)");

  const artist = await getArtistById(artistId);
  if (!artist || artist.status !== "active") throw new PaymentError("Artist unavailable", 404);
  if (artist.userId === user.id) throw new PaymentError("You can't pay yourself");
  // Demo artists use the burn address: never let real money be sent to them.
  if (artist.userId.startsWith("demo-") && !demoPaymentsEnabled()) throw new PaymentError("Demo artist: real payments are disabled");

  const id = newId();
  const intent: Intent = {
    id,
    userId: user.id,
    artistId,
    kind: input.kind,
    refId: input.refId ?? null,
    amountLuna: amount,
    recipient: artist.payoutAddress,
    memo: `NS:${id}`, // 15 bytes, well under the 64-byte on-chain limit
    status: "pending",
    txHash: null,
    failReason: null,
    createdAt: new Date(),
    confirmedAt: null,
  };
  await db.insert(paymentIntents).values(intent);
  return intent;
}

export type ConfirmResult = { status: "confirmed" | "pending" | "failed"; reason?: string };

export async function confirmIntent(user: SessionUser, intentId: string, txHash: string): Promise<ConfirmResult> {
  const db = await getDb();
  const [intent] = await db.select().from(paymentIntents).where(and(eq(paymentIntents.id, intentId), eq(paymentIntents.userId, user.id))).limit(1);
  if (!intent) throw new PaymentError("Payment not found", 404);
  if (intent.status === "confirmed") return { status: "confirmed" };
  if (!/^[0-9a-zA-Z-]{8,128}$/.test(txHash)) throw new PaymentError("Invalid transaction hash");

  // A transaction can settle exactly one payment.
  const [dupe] = await db
    .select({ id: paymentIntents.id })
    .from(paymentIntents)
    .where(and(eq(paymentIntents.txHash, txHash), eq(paymentIntents.status, "confirmed"), ne(paymentIntents.id, intent.id)))
    .limit(1);
  if (dupe) return fail(intent.id, "This transaction was already used");

  if (txHash.startsWith("demo-")) {
    if (!demoPaymentsEnabled()) return fail(intent.id, "Demo payments are disabled");
  } else {
    const found = await fetchChainTx(txHash);
    if (!found.ok) {
      // Not visible yet (propagation) or node unreachable: let the client retry rather than fail.
      if (found.reason === "not_found" || found.reason === "rpc_error") return { status: "pending", reason: found.reason };
      return { status: "pending", reason: "NIMIQ_RPC_URL is not configured on the server" };
    }
    const { tx } = found;
    if (!tx.executed) return fail(intent.id, "Transaction failed on-chain");
    if (!sameAddress(tx.to, intent.recipient)) return fail(intent.id, "Paid to the wrong address");
    if (tx.valueLuna < intent.amountLuna) return fail(intent.id, "Amount too low");
    if (tx.memo !== intent.memo) return fail(intent.id, "Payment reference does not match");
    if (tx.confirmations < 1) return { status: "pending", reason: "waiting_for_confirmation" };
  }

  await db.update(paymentIntents).set({ status: "confirmed", txHash, confirmedAt: new Date() }).where(eq(paymentIntents.id, intent.id));
  await grant(intent);
  return { status: "confirmed" };
}

async function fail(id: string, reason: string): Promise<ConfirmResult> {
  const db = await getDb();
  await db.update(paymentIntents).set({ status: "failed", failReason: reason }).where(eq(paymentIntents.id, id));
  return { status: "failed", reason };
}

async function grant(intent: Intent) {
  if (intent.kind === "tip" || !intent.refId) return;
  const db = await getDb();
  const kind = intent.kind === "ticket" ? "show" : intent.kind === "track" ? "track" : "tier";
  const [existing] = await db
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.userId, intent.userId), eq(entitlements.kind, kind), eq(entitlements.refId, intent.refId)))
    .limit(1);

  let expiresAt: Date | null = null;
  if (kind === "tier") {
    // Renewals extend from the current expiry so early renewals lose nothing.
    const base = existing?.expiresAt && existing.expiresAt > new Date() ? existing.expiresAt : new Date();
    expiresAt = new Date(base.getTime() + MEMBERSHIP_DAYS * 86_400_000);
  }
  if (existing) {
    await db.update(entitlements).set({ expiresAt, intentId: intent.id }).where(eq(entitlements.id, existing.id));
  } else {
    await db.insert(entitlements).values({ id: newId(), userId: intent.userId, artistId: intent.artistId, kind, refId: intent.refId, expiresAt, intentId: intent.id });
  }
}
