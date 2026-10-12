import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTransfer, type ParsedTx } from "../lib/solana-verify.ts";

const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RECIPIENT = "RecipientWallet1111111111111111111111111111";
const REF = "OrderReference111111111111111111111111111111";
const PAYER = "PayerWallet11111111111111111111111111111111";
const exp = { recipient: RECIPIENT, mint: MINT, minMicro: 3_000_000n, reference: REF };

const tx = (over: Partial<{ err: unknown; pre: string; post: string; mint: string; owner: string; keys: string[] }> = {}): ParsedTx => ({
  blockTime: 1,
  meta: {
    err: over.err ?? null,
    preTokenBalances: [{ accountIndex: 3, mint: over.mint ?? MINT, owner: over.owner ?? RECIPIENT, uiTokenAmount: { amount: over.pre ?? "10000000" } }],
    postTokenBalances: [{ accountIndex: 3, mint: over.mint ?? MINT, owner: over.owner ?? RECIPIENT, uiTokenAmount: { amount: over.post ?? "13000000" } }],
  },
  transaction: {
    message: { accountKeys: (over.keys ?? [PAYER, "x", "y", "ata", REF]).map((pubkey, i) => ({ pubkey, signer: i === 0 })) },
  },
});

test("accepts an exact payment", () => {
  const v = verifyTransfer(tx(), exp);
  assert.ok(v.ok); assert.equal(v.payer, PAYER); assert.equal(v.receivedMicro, 3_000_000n);
});
test("accepts an overpayment", () => assert.ok(verifyTransfer(tx({ post: "20000000" }), exp).ok));
test("rejects an underpayment", () => assert.equal(verifyTransfer(tx({ post: "12999999" }), exp).ok, false));
test("rejects a different token (fake mint)", () => assert.equal(verifyTransfer(tx({ mint: "FakeMint" }), exp).ok, false));
test("rejects a different recipient", () => assert.equal(verifyTransfer(tx({ owner: "SomeoneElse" }), exp).ok, false));
test("rejects a failed transaction", () => assert.equal(verifyTransfer(tx({ err: { InstructionError: [0, "x"] } }), exp).ok, false));
test("rejects when the order reference is missing", () => assert.equal(verifyTransfer(tx({ keys: [PAYER, "x", "y", "ata"] }), exp).ok, false));
test("rejects a missing / unfinalized transaction", () => assert.equal(verifyTransfer(null, exp).ok, false));
test("a balance that did not increase is not a payment", () => assert.equal(verifyTransfer(tx({ pre: "13000000", post: "13000000" }), exp).ok, false));
test("a brand-new token account (no pre balance) counts in full", () => {
  const t = tx(); t.meta!.preTokenBalances = [];
  assert.equal(verifyTransfer(t, exp).ok, true);
});
