// Read-only staking data for the Earn screen. NimStage never touches anyone's NIM: the user signs every staking
// transaction inside Nimiq Pay. The server only (1) lists validators from Nimiq's official validators API and
// (2) reads a staker's position from the node.
import { looksLikeNimiqAddress } from "@shared/units";
import { swr } from "./cache";
import { parseAddress } from "./nimiq";

const VALIDATORS_URL = () => process.env.VALIDATORS_API_URL ?? "https://validators-api-mainnet.pages.dev/api/v1/validators";

export type ValidatorCard = {
  address: string;
  name: string;
  description: string | null;
  /** Share of the rewards the pool keeps, 0..1 */
  fee: number;
  /** none: rewards are not paid out; restake: added to your stake; direct: sent to your wallet */
  payoutType: "none" | "restake" | "direct";
  payoutSchedule: string;
  website: string | null;
  /** Reliability over recent epochs, 0..1 */
  score: number;
  stakers: number | null;
};

const payoutTypes = new Set(["none", "restake", "direct"]);

/** The official list is ~1.3 MB because of embedded logos; keep only what the screen shows. */
export function slimValidators(raw: unknown): ValidatorCard[] {
  if (!Array.isArray(raw)) return [];
  const out: ValidatorCard[] = [];
  for (const v of raw as Record<string, unknown>[]) {
    if (!v || v.isListed === false || typeof v.address !== "string" || typeof v.name !== "string" || !looksLikeNimiqAddress(v.address)) continue;
    const score = (v.score as { total?: unknown } | null | undefined)?.total;
    out.push({
      address: v.address,
      name: v.name.slice(0, 60),
      description: typeof v.description === "string" ? v.description.slice(0, 240) : null,
      fee: typeof v.fee === "number" && v.fee >= 0 && v.fee <= 1 ? v.fee : 0,
      payoutType: payoutTypes.has(String(v.payoutType)) ? (v.payoutType as ValidatorCard["payoutType"]) : "none",
      payoutSchedule: typeof v.payoutSchedule === "string" ? v.payoutSchedule.slice(0, 60) : "",
      website: typeof v.website === "string" && /^https:\/\//.test(v.website) ? v.website : null,
      score: typeof score === "number" ? Math.max(0, Math.min(1, score)) : 0,
      stakers: typeof v.stakers === "number" ? v.stakers : null,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.fee - b.fee).slice(0, 40);
}

export const listValidators = () =>
  swr("validators", 3600_000, 24 * 3600_000, async () => {
    const res = await fetch(VALIDATORS_URL(), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`validators api ${res.status}`);
    const text = await res.text();
    if (text.length > 8_000_000) throw new Error("validators api: response too large");
    const list = slimValidators(JSON.parse(text));
    // An empty list is a broken answer, not a list: never cache it over a good one.
    if (!list.length) throw new Error("validators api: no usable validators");
    return list;
  });

export type StakerPosition = {
  address: string;
  /** Lunas that are staked and active */
  balance: number;
  /** Lunas that are staked but not earning (waiting to be unstaked) */
  inactiveBalance: number;
  /** Lunas retired and ready to be withdrawn */
  retiredBalance: number;
  delegation: string | null;
};

/** Lunas from a number or a numeric string; anything else (negative, NaN, missing) is 0. */
const luna = (x: unknown) => {
  const n = typeof x === "string" && /^\d+$/.test(x) ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Field names follow core-rs-albatross; anything missing counts as zero. */
export function normalizeStaker(raw: Record<string, unknown>, address: string): StakerPosition {
  return {
    address,
    balance: luna(raw.balance),
    inactiveBalance: luna(raw.inactiveBalance),
    retiredBalance: luna(raw.retiredBalance),
    delegation: typeof raw.delegation === "string" ? raw.delegation : null,
  };
}

export type PositionResult = { ok: true; staker: StakerPosition | null } | { ok: false; reason: "rpc_unavailable" | "rpc_error" };

/** The node answers "No staker with address" (an error) for an address that has never staked: that is `staker: null`. */
export async function getStakerPosition(addressInput: string): Promise<PositionResult | "bad_address"> {
  const address = await parseAddress(addressInput);
  if (!address) return "bad_address";
  const url = process.env.NIMIQ_RPC_URL;
  if (!url) return { ok: false, reason: "rpc_unavailable" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getStakerByAddress", params: [address] }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: "rpc_error" };
    const json = (await res.json()) as { result?: { data?: Record<string, unknown> }; error?: { data?: unknown; message?: string } };
    // some nodes put the staker straight under `result`, others under `result.data`
    const raw = json.result?.data ?? (json.result as Record<string, unknown> | undefined);
    if (raw && typeof raw === "object" && ("balance" in raw || "delegation" in raw || "address" in raw)) return { ok: true, staker: normalizeStaker(raw as Record<string, unknown>, address) };
    const text = `${json.error?.message ?? ""} ${typeof json.error?.data === "string" ? json.error.data : ""}`;
    if (/no staker/i.test(text)) return { ok: true, staker: null };
    return { ok: false, reason: "rpc_error" };
  } catch {
    return { ok: false, reason: "rpc_error" };
  }
}
