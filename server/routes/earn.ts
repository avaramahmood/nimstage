import { Hono } from "hono";
import { HttpError, clientIp, rateLimit } from "@srv/http";
import { getStakerPosition, listValidators } from "@srv/staking";

export const earn = new Hono();

// Public, the same for everyone: Nimiq's official validator list, trimmed.
earn.get("/earn/validators", async (c) => {
  rateLimit(`earn-val:${clientIp(c)}`, 60, 60_000);
  try {
    return c.json({ validators: await listValidators() });
  } catch {
    throw new HttpError("The validator list is unavailable right now. Try again in a minute.", 503);
  }
});

// A staker's position, read from the node. Public chain data, but rate limited since it costs a node call.
earn.get("/earn/position", async (c) => {
  rateLimit(`earn-pos:${clientIp(c)}`, 60, 60_000);
  const r = await getStakerPosition(c.req.query("address") ?? "");
  if (r === "bad_address") throw new HttpError("That isn't a valid Nimiq address.", 400);
  if (!r.ok) return c.json({ available: false, reason: r.reason, staker: null });
  return c.json({ available: true, staker: r.staker });
});
