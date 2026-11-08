import { normalizeAddress } from "@shared/units";

type Core = typeof import("@nimiq/core");
let corePromise: Promise<Core> | undefined;
const loadCore = () => (corePromise ??= import("@nimiq/core"));

const enc = new TextEncoder();

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Verifies a Nimiq Pay `sign()` result and returns the signer's address, or null.
 *
 * Nimiq's signed-message scheme hashes "\x16Nimiq Signed Message:\n" + length + message
 * with SHA-256 before signing. Because the exact digest Nimiq Pay uses could not be
 * checked against a device here, we accept the documented scheme first and fall back to
 * raw / sha256(raw). That is safe: every variant is still an Ed25519 signature by the
 * claimed key over a message containing our single-use, server-issued nonce.
 */
export async function verifyLoginSignature(
  message: string,
  publicKeyHex: string,
  signatureHex: string,
): Promise<string | null> {
  try {
    const { PublicKey, Signature, Hash } = await loadCore();
    const publicKey = PublicKey.fromHex(publicKeyHex);
    const signature = Signature.fromHex(signatureHex);
    const raw = enc.encode(message);
    const prefixed = concat(enc.encode(`\x16Nimiq Signed Message:\n${raw.length}`), raw);
    const candidates = [Hash.computeSha256(prefixed), raw, Hash.computeSha256(raw)];
    if (!candidates.some((data) => publicKey.verify(signature, data))) return null;
    return publicKey.toAddress().toUserFriendlyAddress();
  } catch {
    return null;
  }
}

/** Validates a Nimiq address (checksum included) and returns it in friendly form, or null. */
export async function parseAddress(input: string): Promise<string | null> {
  try {
    const { Address } = await loadCore();
    return Address.fromAny(input.trim()).toUserFriendlyAddress();
  } catch {
    return null;
  }
}

export type ChainTx = {
  to: string;
  valueLuna: number;
  memo: string;
  executed: boolean;
  confirmations: number;
};

export type ChainLookup =
  | { ok: true; tx: ChainTx }
  | { ok: false; reason: "not_found" | "rpc_unavailable" | "rpc_error" };

/**
 * Reads a transaction from a Nimiq JSON-RPC node (NIMIQ_RPC_URL).
 * Field names follow core-rs-albatross `ExecutedTransaction`: to, value (Luna),
 * recipientData (hex), confirmations, executionResult.
 */
export async function fetchChainTx(hash: string): Promise<ChainLookup> {
  const url = process.env.NIMIQ_RPC_URL;
  if (!url) return { ok: false, reason: "rpc_unavailable" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransactionByHash", params: [hash] }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, reason: "rpc_error" };
    const json = (await res.json()) as {
      result?: { data?: Record<string, unknown> } & Record<string, unknown>;
      error?: unknown;
    };
    if (json.error || !json.result) return { ok: false, reason: "not_found" };
    const t = (json.result.data ?? json.result) as Record<string, unknown>;
    if (typeof t.to !== "string") return { ok: false, reason: "not_found" };
    const hex = typeof t.recipientData === "string" ? t.recipientData : "";
    return {
      ok: true,
      tx: {
        to: t.to,
        valueLuna: Number(t.value ?? 0),
        memo: hex ? Buffer.from(hex, "hex").toString("utf8") : "",
        executed: t.executionResult !== false,
        confirmations: Number(t.confirmations ?? 0),
      },
    };
  } catch {
    return { ok: false, reason: "rpc_error" };
  }
}

export const sameAddress = (a: string, b: string) => normalizeAddress(a) === normalizeAddress(b);
