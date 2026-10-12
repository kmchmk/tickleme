import "server-only";
import { canBuy, priceMicro } from "./access";
import { MOCK_PAYMENTS, ORDER_TTL_MINUTES, SOLANA_RECIPIENT, USDC_MINT } from "./config";
import { query, type Row } from "./db";
import { findPayment, newReference, paymentUrl } from "./solana";
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
  txSignature?: string;
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
    txSignature: o.tx_signature ? String(o.tx_signature) : undefined,
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
       on conflict (user_id, avatar_id, product) do nothing returning 1
     )
     select (select count(*) from upd) as paid`,
    [orderId, signature, payer],
  );
  return Number(rows[0]?.paid ?? 0) > 0;
}

/** Current state of an order; while pending it checks the chain and fulfils on a valid payment. */
export async function refreshOrder(userId: string, orderId: string): Promise<OrderView | null> {
  const rows = await query("select * from orders where id = $1 and user_id = $2", [orderId, userId]);
  if (!rows[0]) return null;
  if (rows[0].status === "pending") {
    const found = await findPayment(String(rows[0].reference), BigInt(String(rows[0].amount_micro))).catch((e) => {
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
