// Pure check of a Solana transaction (jsonParsed) against what an order expects.
// No imports so it can be unit-tested directly.

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

export interface ParsedTx {
  blockTime?: number | null;
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[] | null;
    postTokenBalances?: TokenBalance[] | null;
  } | null;
  transaction: {
    message: { accountKeys: ({ pubkey: string; signer?: boolean } | string)[] };
  };
}

export interface Expectation {
  recipient: string; // wallet that must receive the USDC
  mint: string; // USDC mint
  minMicro: bigint; // price in micro-USDC
  reference: string; // the order's unique reference key
}

export type Verdict =
  | { ok: true; payer: string; receivedMicro: bigint }
  | { ok: false; reason: string };

const keyOf = (k: { pubkey: string } | string) => (typeof k === "string" ? k : k.pubkey);

function receivedBy(balances: TokenBalance[] | null | undefined, e: Expectation): Map<number, bigint> {
  const m = new Map<number, bigint>();
  for (const b of balances ?? []) if (b.mint === e.mint && b.owner === e.recipient) m.set(b.accountIndex, BigInt(b.uiTokenAmount.amount));
  return m;
}

/** How much of the token the recipient gained in this transaction (micro units; 0 if it failed or is missing). */
export function receivedMicro(tx: ParsedTx | null, recipient: string, mint: string): bigint {
  if (!tx?.meta || tx.meta.err) return 0n;
  const e = { recipient, mint } as Expectation;
  const pre = receivedBy(tx.meta.preTokenBalances, e);
  let delta = 0n;
  for (const [idx, amount] of receivedBy(tx.meta.postTokenBalances, e)) delta += amount - (pre.get(idx) ?? 0n);
  return delta;
}

/** The fee payer / first signer of a transaction. */
export function payerOf(tx: ParsedTx): string {
  const signer = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? { pubkey: k, signer: false } : k)).find((k) => k.signer);
  return signer?.pubkey ?? "unknown";
}

/**
 * Accepts a transaction only if it succeeded, includes the order's reference key,
 * and increased the recipient's balance of the right token by at least the price.
 * (Overpayment is accepted; a wrong token, wrong recipient or underpayment is not.)
 */
export function verifyTransfer(tx: ParsedTx | null, e: Expectation): Verdict {
  if (!tx || !tx.meta) return { ok: false, reason: "transaction not found or not finalized" };
  if (tx.meta.err) return { ok: false, reason: "transaction failed" };
  const keys = tx.transaction.message.accountKeys;
  if (!keys.some((k) => keyOf(k) === e.reference)) return { ok: false, reason: "reference key missing" };

  const delta = receivedMicro(tx, e.recipient, e.mint);
  if (delta < e.minMicro) return { ok: false, reason: `received ${delta} < required ${e.minMicro}` };
  return { ok: true, payer: payerOf(tx), receivedMicro: delta };
}
