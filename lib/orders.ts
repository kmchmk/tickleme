import "server-only";
import { canBuy, priceMicro } from "./access";
import { MOCK_PAYMENTS, ORDER_TTL_MINUTES, SOLANA_RECIPIENT, USDC_MINT } from "./config";
import { query, type Row } from "./db";
import { findPayment, microToDecimal, newReference, paymentUrl, recentIncoming } from "./solana";
import type { AvatarDef, Product, Viewer } from "./types";

export interface OrderView {
  id: string;
  avatarId: string;
  product: Product;
  status: "pending" | "paid";
  amountMicro: string;
  amountUsdc: string;
  recipient: string;
  mint: string;
  reference: string;
  expiresAt: string;
  paymentUrl: string;
  /** Exact amount for a manual transfer (exchange / wallet without Solana Pay), once the buyer asked for it. */
  manualAmountUsdc?: string;
  txSignature?: string;
  createdAt: string;
}

const label = "Tickle Me";

function view(o: Row): OrderView {
  const amount = BigInt(String(o.amount_micro));
  return {
    id: String(o.id),
    avatarId: String(o.avatar_id),
    product: o.product as Product,
    status: o.status as "pending" | "paid",
    amountMicro: amount.toString(),
    amountUsdc: (Number(amount) / 1_000_000).toFixed(2),
    recipient: SOLANA_RECIPIENT,
    mint: USDC_MINT,
    reference: String(o.reference),
    expiresAt: new Date(String(o.expires_at)).toISOString(),
    paymentUrl: paymentUrl({ amountMicro: amount, reference: String(o.reference), label, message: `Unlock (${o.product})`, memo: String(o.id) }),
    manualAmountUsdc: o.manual_micro != null ? microToDecimal(BigInt(String(o.manual_micro))) : undefined,
    txSignature: o.tx_signature ? String(o.tx_signature) : undefined,
    createdAt: new Date(String(o.created_at)).toISOString(),
  };
}

/** Starts (or re-uses) a pending order for this user, avatar and product. */
export async function createOrder(userId: string, avatar: AvatarDef, product: Product, viewer: Viewer): Promise<OrderView> {
  if (!canBuy(viewer, avatar.id, product)) throw new Error("already-owned");
  const existing = await query(
    "select * from orders where user_id = $1 and avatar_id = $2 and product = $3 and status = 'pending' and expires_at > now() order by created_at desc limit 1",
    [userId, avatar.id, product],
  );
  if (existing[0]) return view(existing[0]);
  const rows = await query(
    `insert into orders (user_id, avatar_id, product, amount_micro, reference, expires_at)
     values ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval) returning *`,
    [userId, avatar.id, product, priceMicro(avatar, product), newReference(), String(ORDER_TTL_MINUTES)],
  );
  return view(rows[0]);
}

/** Marks an order paid and grants the entitlement in ONE statement (atomic, idempotent). */
export async function fulfill(orderId: string, signature: string, payer: string): Promise<boolean> {
  const rows = await query(
    `with upd as (
       update orders set status = 'paid', tx_signature = $2, payer = $3, paid_at = now()
       where id = $1 and status = 'pending' returning id, user_id, avatar_id, product
     ), ent as (
       insert into entitlements (user_id, avatar_id, product, order_id)
       select user_id, avatar_id, product, id from upd
       on conflict (user_id, avatar_id, product, source) do nothing returning 1
     )
     select (select count(*) from upd) as paid`,
    [orderId, signature, payer],
  );
  return Number(rows[0]?.paid ?? 0) > 0;
}

/** Looks for this order's payment on chain: by its Solana Pay reference, or (manual sends) by its unique exact amount. */
async function lookForPayment(o: Row) {
  const byReference = await findPayment(String(o.reference), BigInt(String(o.amount_micro)));
  if (byReference || o.manual_micro == null) return byReference;
  const exact = BigInt(String(o.manual_micro));
  const since = Math.floor(new Date(String(o.created_at)).getTime() / 1000) - 120;
  return (await recentIncoming(since)).find((p) => p.receivedMicro === exact && p.blockTime >= since) ?? null;
}

/** Current state of an order; while pending it checks the chain and fulfils on a valid payment. */
export async function refreshOrder(userId: string, orderId: string): Promise<OrderView | null> {
  const rows = await query("select * from orders where id = $1 and user_id = $2", [orderId, userId]);
  if (!rows[0]) return null;
  if (rows[0].status === "pending") {
    const found = await lookForPayment(rows[0]).catch((e) => {
      console.error("payment check failed", e);
      return null;
    });
    if (found) {
      try {
        await fulfill(orderId, found.signature, found.payer);
      } catch (e) {
        // e.g. the same transaction was already used for another order: never grant twice.
        console.error("fulfil failed", e);
      }
      return (await refreshOrderRow(userId, orderId)) ?? null;
    }
  }
  return view(rows[0]);
}

/**
 * Gives the order a unique exact amount (the price plus a few millionths of a USDC) so a plain transfer without the
 * Solana Pay reference, e.g. a withdrawal from an exchange, can still be matched to it. No other open order of the
 * last week shares it.
 */
export async function enableManualPayment(userId: string, orderId: string): Promise<OrderView | null> {
  const rows = await query("select * from orders where id = $1 and user_id = $2", [orderId, userId]);
  const o = rows[0];
  if (!o) return null;
  if (o.manual_micro != null || o.status !== "pending") return view(o);
  const base = BigInt(String(o.amount_micro));
  for (let i = 0; i < 20; i++) {
    const candidate = base + BigInt(1 + Math.floor(Math.random() * 9999));
    const updated = await query(
      `update orders set manual_micro = $3
       where id = $1 and user_id = $2 and manual_micro is null
         and not exists (select 1 from orders where manual_micro = $3 and created_at > now() - interval '7 days')
       returning *`,
      [orderId, userId, candidate.toString()],
    );
    if (updated[0]) return view(updated[0]);
  }
  throw new Error("no unique amount available");
}

async function refreshOrderRow(userId: string, orderId: string): Promise<OrderView | null> {
  const rows = await query("select * from orders where id = $1 and user_id = $2", [orderId, userId]);
  return rows[0] ? view(rows[0]) : null;
}

/** Development only: pretend the payment arrived. */
export async function mockPay(userId: string, orderId: string): Promise<OrderView | null> {
  if (!MOCK_PAYMENTS) throw new Error("mock payments are disabled");
  const rows = await query("select id from orders where id = $1 and user_id = $2", [orderId, userId]);
  if (!rows[0]) return null;
  await fulfill(orderId, `mock-${orderId}`, "mock-payer");
  return refreshOrderRow(userId, orderId);
}

/**
 * Checks this user's recent pending orders against the chain, so a payment made after the
 * payment dialog was closed (or the order timed out) is still honoured. Called when the viewer loads.
 */
export async function settlePendingOrders(userId: string): Promise<void> {
  const rows = await query(
    "select id from orders where user_id = $1 and status = 'pending' and created_at > now() - interval '24 hours' order by created_at desc limit 3",
    [userId],
  );
  await Promise.all(rows.map((r) => refreshOrder(userId, String(r.id)).catch(() => null)));
}
