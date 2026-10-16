import "server-only";
import { Keypair, PublicKey } from "@solana/web3.js";
import { SOLANA_RECIPIENT, SOLANA_RPC_URL, USDC_MINT } from "./config";
import { payerOf, receivedMicro, verifyTransfer, type ParsedTx } from "./solana-verify";

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

class RpcError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new RpcError(`Solana RPC ${method}: HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { code?: number; message: string } };
  if (json.error) throw new RpcError(`Solana RPC ${method}: ${json.error.message}`, json.error.code);
  return json.result as T;
}

// Payments count once "confirmed" (a supermajority voted on the block, about a second). Solana has never rolled back
// a confirmed block, and waiting ~13 s more for "finalized" would only make the buyer stare at a spinner.
const COMMITMENT = "confirmed";
let txVersion = 0; // raised automatically when the network starts using newer transaction versions

/** One transaction, parsed. Retries with the newer transaction version the RPC asks for. */
async function getTx(signature: string): Promise<ParsedTx | null> {
  try {
    return await rpc<ParsedTx | null>("getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: txVersion, commitment: COMMITMENT }]);
  } catch (e) {
    const want = e instanceof RpcError && e.code === -32015 ? Number(/maxSupportedTransactionVersion\\?"?:\s*(\d+)/.exec(e.message)?.[1]) : NaN;
    if (!Number.isFinite(want) || want <= txVersion) throw e;
    txVersion = want;
    return getTx(signature);
  }
}

interface SigInfo {
  signature: string;
  err: unknown;
  blockTime?: number | null;
}

export interface FoundPayment {
  signature: string;
  payer: string;
  receivedMicro: bigint;
}

/**
 * Looks for a confirmed transaction that carries this order's reference key (Solana Pay adds it) and pays the
 * recipient enough USDC. Returns null while nothing valid has been seen yet.
 */
export async function findPayment(reference: string, minMicro: bigint): Promise<FoundPayment | null> {
  const sigs = await rpc<SigInfo[]>("getSignaturesForAddress", [reference, { limit: 10, commitment: COMMITMENT }]);
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await getTx(s.signature);
    const verdict = verifyTransfer(tx, { recipient: SOLANA_RECIPIENT, mint: USDC_MINT, minMicro, reference });
    if (verdict.ok) return { signature: s.signature, payer: verdict.payer, receivedMicro: verdict.receivedMicro };
  }
  return null;
}

let accounts: { list: string[]; at: number } | null = null;

/** The recipient's USDC token accounts (normally just the associated one): where USDC payments land. */
export async function recipientTokenAccounts(): Promise<string[]> {
  if (accounts && Date.now() - accounts.at < 10 * 60_000 && accounts.list.length) return accounts.list;
  const res = await rpc<{ value: { pubkey: string }[] }>("getTokenAccountsByOwner", [SOLANA_RECIPIENT, { mint: USDC_MINT }, { encoding: "jsonParsed", commitment: COMMITMENT }]);
  accounts = { list: res.value.map((a) => a.pubkey), at: Date.now() };
  return accounts.list;
}

export interface Incoming {
  signature: string;
  payer: string;
  receivedMicro: bigint;
  blockTime: number;
}

// Transactions never change once confirmed, so what each one paid is remembered (bounded) across polls.
const seen = new Map<string, Incoming | null>();

/**
 * Recent USDC payments into the recipient's account since a time (unix seconds), newest first. Used to match
 * transfers sent without the Solana Pay reference (exchanges, manual sends), by their unique exact amount.
 */
export async function recentIncoming(sinceSec: number): Promise<Incoming[]> {
  const sigs: SigInfo[] = [];
  for (const acc of await recipientTokenAccounts()) sigs.push(...(await rpc<SigInfo[]>("getSignaturesForAddress", [acc, { limit: 50, commitment: COMMITMENT }])));
  const out: Incoming[] = [];
  let budget = 12; // new transactions looked at per call; the rest are picked up by the next poll (rate limits)
  for (const s of sigs) {
    if (s.err || (s.blockTime && s.blockTime < sinceSec)) continue;
    if (!seen.has(s.signature)) {
      if (budget-- <= 0) break;
      const tx = await getTx(s.signature).catch(() => null);
      if (!tx) continue; // not visible yet (or the RPC is busy); try again next time
      const got = receivedMicro(tx, SOLANA_RECIPIENT, USDC_MINT);
      seen.set(s.signature, got > 0n ? { signature: s.signature, payer: payerOf(tx), receivedMicro: got, blockTime: tx.blockTime ?? s.blockTime ?? 0 } : null);
      if (seen.size > 2000) seen.delete(seen.keys().next().value!);
    }
    const hit = seen.get(s.signature);
    if (hit) out.push(hit);
  }
  return out;
}

export interface PaymentHealth {
  recipient: string;
  recipientValid: boolean;
  tokenAccounts?: string[];
  balanceUsdc?: string;
  rpcHost: string;
  rpcOk: boolean;
  rpcPublic: boolean;
  slot?: number;
  error?: string;
}

/** Everything that has to be right for payments to work, checked live (admin dashboard). */
export async function paymentHealth(): Promise<PaymentHealth> {
  let host = "";
  try {
    host = new URL(SOLANA_RPC_URL).host;
  } catch {
    host = "invalid URL";
  }
  const h: PaymentHealth = { recipient: SOLANA_RECIPIENT, recipientValid: false, rpcHost: host, rpcOk: false, rpcPublic: host === "api.mainnet-beta.solana.com" };
  try {
    h.recipientValid = !!SOLANA_RECIPIENT && !!new PublicKey(SOLANA_RECIPIENT);
  } catch {
    h.recipientValid = false;
  }
  try {
    h.slot = await rpc<number>("getSlot", [{ commitment: COMMITMENT }]);
    h.rpcOk = true;
  } catch (e) {
    h.error = (e as Error).message;
    return h;
  }
  if (!h.recipientValid) return h;
  try {
    accounts = null;
    h.tokenAccounts = await recipientTokenAccounts();
    if (h.tokenAccounts.length) {
      const bal = await rpc<{ value: { uiAmountString: string } }>("getTokenAccountBalance", [h.tokenAccounts[0], { commitment: COMMITMENT }]);
      h.balanceUsdc = bal.value.uiAmountString;
    }
  } catch (e) {
    h.error = (e as Error).message;
  }
  return h;
}
