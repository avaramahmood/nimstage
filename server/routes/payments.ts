import { Hono } from "hono";
import { z } from "zod";
import { body, rateLimit, requireUser } from "@srv/http";
import { checkIntent, confirmIntent, createIntent } from "@srv/payments";

export const payments = new Hono();

const Intent = z.object({
  kind: z.enum(["ticket", "tip", "membership", "track"]),
  refId: z.string().max(64).optional(),
  amountLuna: z.number().int().positive().optional(),
});

payments.post("/payments/intent", async (c) => {
  const user = await requireUser(c);
  rateLimit(`intent:${user.id}`, 20, 60_000);
  const intent = await createIntent(user, Intent.parse(await body(c)));
  return c.json({ intent: { id: intent.id, kind: intent.kind, amountLuna: intent.amountLuna, recipient: intent.recipient, memo: intent.memo } });
});

const Confirm = z.object({ intentId: z.string().min(6).max(32), txHash: z.string().min(8).max(128) });

payments.post("/payments/confirm", async (c) => {
  const user = await requireUser(c);
  rateLimit(`confirm:${user.id}`, 60, 60_000);
  const { intentId, txHash } = Confirm.parse(await body(c));
  return c.json(await confirmIntent(user, intentId, txHash));
});

// For a payment made by hand from any wallet: look for the transaction by its memo and settle it.
const Check = z.object({ intentId: z.string().min(6).max(32) });

payments.post("/payments/check", async (c) => {
  const user = await requireUser(c);
  rateLimit(`check:${user.id}`, 40, 60_000);
  const { intentId } = Check.parse(await body(c));
  return c.json(await checkIntent(user, intentId));
});
