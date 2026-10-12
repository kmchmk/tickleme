import "server-only";
import { Keypair } from "@solana/web3.js";
import { SOLANA_RECIPIENT, SOLANA_RPC_URL, USDC_MINT } from "./config";
import { verifyTransfer, type ParsedTx, type Verdict } from "./solana-verify";

/** A fresh, unique reference key for one order (a public key; the private half is discarded). */
export const newReference = () => Keypair.generate().publicKey.toBase58();

/** micro-USDC (6 decimals) -> "3" or "3.5" for the Solana Pay URL. */
export function microToDecimal(micro: bigint | number): string {
  const m = BigInt(micro);
  const whole = m / 1_000_000n;
  const frac = (m % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Solana Pay "transfer request": wallets (Phantom, Solflare, ...) open this link or QR code. */
export function paymentUrl(o: { amountMicro: bigint | number; reference: string; label: string; message: string; memo: string }): string {
  const p = new URLSearchParams({
    amount: microToDecimal(o.amountMicro),
    "spl-token": USDC_MINT,
    reference: o.reference,
    label: o.label,
    message: o.message,
    memo: o.memo,
  });
  return `solana:${SOLANA_RECIPIENT}?${p.toString()}`;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Solana RPC ${method}: HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`Solana RPC ${method}: ${json.error.message}`);
  return json.result as T;
}

export interface FoundPayment {
  signature: string;
  payer: string;
  receivedMicro: bigint;
}

/**
 * Looks for a finalized transaction that carries this order's reference key and pays
 * the recipient enough USDC. Returns null while nothing valid has been seen yet.
 */
export async function findPayment(reference: string, minMicro: bigint): Promise<FoundPayment | null> {
  const sigs = await rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [reference, { limit: 10, commitment: "finalized" }]);
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await rpc<ParsedTx | null>("getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "finalized" }]);
    const verdict: Verdict = verifyTransfer(tx, { recipient: SOLANA_RECIPIENT, mint: USDC_MINT, minMicro, reference });
    if (verdict.ok) return { signature: s.signature, payer: verdict.payer, receivedMicro: verdict.receivedMicro };
  }
  return null;
}
