import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAvatars } from "./avatars";
import { AUTH_ENABLED } from "./config";
import { isAllowedAdmin, isGrantProduct, looksLikeEmail, parseAdminEmails, sameOrigin } from "./admin-core";
import { query } from "./db";
import type { Product } from "./types";

const allowedEmails = () => parseAdminEmails(process.env.ALLOWED_ADMIN_EMAILS);

/** The signed-in admin's (verified) email, or null if the viewer is not an admin. Checked on every admin call. */
export async function currentAdmin(): Promise<{ email: string; userId: string } | null> {
  const allowed = allowedEmails();
  if (!allowed.length) return null;
  if (AUTH_ENABLED) {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    const primary = user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    const email = primary?.verification?.status === "verified" ? primary.emailAddress.toLowerCase() : null;
    return user && isAllowedAdmin(email, allowed) ? { email: email!, userId: user.id } : null;
  }
  if (process.env.NODE_ENV !== "production") {
    const name = (await cookies()).get("dev_user")?.value; // local development without Clerk
    const email = name ? `${name}@dev.local` : null;
    return isAllowedAdmin(email, allowed) ? { email: email!, userId: `dev_${name}` } : null;
  }
  return null;
}

/** For admin API routes: the admin, or the response to send back (404, so the page's existence isn't revealed). */
export async function requireAdmin(req?: Request): Promise<{ admin: { email: string; userId: string } } | { response: NextResponse }> {
  const admin = await currentAdmin();
  if (!admin) return { response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  if (req && req.method !== "GET" && !sameOrigin(req.headers.get("origin"), (await headers()).get("host"))) {
    return { response: NextResponse.json({ error: "bad origin" }, { status: 403 }) };
  }
  return { admin };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  createdAt: number | null;
  lastSignInAt: number | null;
  imageUrl?: string;
  ageConfirmed: boolean;
  access: { avatarId: string; product: Product; source: "payment" | "admin"; grantedBy?: string; note?: string }[];
}

async function decorate(base: BaseUser[]): Promise<AdminUser[]> {
  if (!base.length) return [];
  const ids = base.map((u) => u.id);
  const [ents, profs] = await Promise.all([
    query("select user_id, avatar_id, product, source, granted_by, note from entitlements where user_id = any($1) order by created_at", [ids]),
    query("select user_id, age_confirmed_at from profiles where user_id = any($1)", [ids]),
  ]);
  return base.map((u) => ({
    ...u,
    ageConfirmed: !!profs.find((p) => p.user_id === u.id)?.age_confirmed_at,
    access: ents
      .filter((e) => e.user_id === u.id)
      .map((e) => ({ avatarId: String(e.avatar_id), product: e.product as Product, source: e.source as "payment" | "admin", grantedBy: (e.granted_by as string) ?? undefined, note: (e.note as string) ?? undefined })),
  }));
}

type BaseUser = { id: string; email: string; name: string; createdAt: number | null; lastSignInAt: number | null; imageUrl?: string };

async function clerkUsers(params: { query?: string; userId?: string[]; limit: number; offset: number }): Promise<{ base: BaseUser[]; total: number }> {
  const { clerkClient } = await import("@clerk/nextjs/server");
  const res = await (await clerkClient()).users.getUserList({ ...params, orderBy: "-created_at" });
  return {
    total: res.totalCount,
    base: res.data.map((u) => ({
      id: u.id,
      email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? "",
      name: [u.firstName, u.lastName].filter(Boolean).join(" "),
      createdAt: u.createdAt ?? null,
      lastSignInAt: u.lastSignInAt ?? null,
      imageUrl: u.hasImage ? u.imageUrl : undefined,
    })),
  };
}

const devBase = (id: string): BaseUser => ({ id, email: `${id.replace(/^dev_/, "")}@dev.local`, name: "", createdAt: null, lastSignInAt: null });

export type UserFilter = "all" | "paying" | "granted" | "adult";
const FILTER_SQL: Record<Exclude<UserFilter, "all">, string> = {
  paying: "select user_id, max(created_at) at from entitlements where source = 'payment' group by user_id",
  granted: "select user_id, max(created_at) at from entitlements where source = 'admin' group by user_id",
  adult: "select user_id, age_confirmed_at at from profiles where age_confirmed_at is not null",
};

/** Users, newest first, optionally searched (email / name) and filtered (paying, admin-granted, 18+ confirmed). */
export async function listUsers(q: string, offset: number, limit: number, filter: UserFilter = "all"): Promise<{ users: AdminUser[]; total: number }> {
  if (filter !== "all") {
    const rows = await query(`select user_id from (${FILTER_SQL[filter]}) t order by at desc nulls last limit 1000`);
    let ids = rows.map((r) => String(r.user_id));
    if (!AUTH_ENABLED) {
      if (q) ids = ids.filter((id) => id.includes(q.toLowerCase()));
      return { users: await decorate(ids.slice(offset, offset + limit).map(devBase)), total: ids.length };
    }
    if (!ids.length) return { users: [], total: 0 };
    if (q) {
      // Search within the filtered set (Clerk caps userId lists at 100 per call, so search first and intersect).
      const { base } = await clerkUsers({ query: q, limit: 100, offset: 0 });
      const set = new Set(ids);
      const hits = base.filter((u) => set.has(u.id));
      return { users: await decorate(hits.slice(offset, offset + limit)), total: hits.length };
    }
    const page = ids.slice(offset, offset + limit);
    const { base } = page.length ? await clerkUsers({ userId: page, limit, offset: 0 }) : { base: [] };
    const order = new Map(page.map((id, i) => [id, i]));
    base.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
    return { users: await decorate(base), total: ids.length };
  }
  if (AUTH_ENABLED) {
    const { base, total } = await clerkUsers({ query: q || undefined, limit, offset });
    return { users: await decorate(base), total };
  }
  // Development without Clerk: whoever has a profile or an entitlement.
  const rows = await query("select user_id from (select user_id from profiles union select user_id from entitlements) t order by user_id");
  const base = rows
    .map((r) => String(r.user_id))
    .filter((id) => !q || id.includes(q.toLowerCase()))
    .map(devBase);
  return { users: await decorate(base.slice(offset, offset + limit)), total: base.length };
}

export interface AdminOrder {
  id: string;
  userId: string;
  email?: string;
  avatarId: string;
  product: Product;
  status: "pending" | "paid";
  amountUsdc: string;
  manual: boolean;
  txSignature?: string;
  createdAt: string;
  paidAt?: string;
}

const orderView = (o: Record<string, unknown>): AdminOrder => ({
  id: String(o.id),
  userId: String(o.user_id),
  avatarId: String(o.avatar_id),
  product: o.product as Product,
  status: o.status as "pending" | "paid",
  amountUsdc: (Number(o.amount_micro) / 1e6).toFixed(2),
  manual: o.manual_micro != null,
  txSignature: o.tx_signature ? String(o.tx_signature) : undefined,
  createdAt: new Date(String(o.created_at)).toISOString(),
  paidAt: o.paid_at ? new Date(String(o.paid_at)).toISOString() : undefined,
});

/** Emails for a set of user ids (one Clerk call per 100). */
export async function emailsOf(ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (!AUTH_ENABLED) {
    for (const id of unique) m.set(id, devBase(id).email);
    return m;
  }
  for (let i = 0; i < unique.length; i += 100) {
    const { base } = await clerkUsers({ userId: unique.slice(i, i + 100), limit: 100, offset: 0 });
    for (const u of base) m.set(u.id, u.email);
  }
  return m;
}

/** Recent orders (newest first), optionally only paid or only pending, with the buyer's email. */
export async function listOrders(status: "all" | "paid" | "pending", offset: number, limit: number): Promise<{ orders: AdminOrder[]; total: number }> {
  const where = status === "all" ? "" : `where status = '${status}'`;
  const [rows, count] = await Promise.all([
    query(`select * from orders ${where} order by coalesce(paid_at, created_at) desc limit $1 offset $2`, [limit, offset]),
    query(`select count(*)::int n from orders ${where}`),
  ]);
  const orders = rows.map(orderView);
  const emails = await emailsOf(orders.map((o) => o.userId)).catch(() => new Map<string, string>());
  for (const o of orders) o.email = emails.get(o.userId);
  return { orders, total: Number(count[0]?.n ?? 0) };
}

/** One person, everything about them: account, access, orders. */
export async function userDetail(userId: string): Promise<{ user: AdminUser; orders: AdminOrder[] } | null> {
  let base: BaseUser | undefined;
  if (AUTH_ENABLED) base = (await clerkUsers({ userId: [userId], limit: 1, offset: 0 })).base[0];
  else if (/^dev_/.test(userId)) base = devBase(userId);
  if (!base) return null;
  const [[user], rows] = await Promise.all([decorate([base]), query("select * from orders where user_id = $1 order by created_at desc limit 50", [userId])]);
  return { user, orders: rows.map(orderView) };
}

export interface AdminStats {
  users: number | null;
  adults: number;
  paying: number;
  granted: number;
  revenueUsdc: string;
  revenue30Usdc: string;
  sales: number;
  sales30: number;
  pending24: number;
  invites: number;
}

/** Headline numbers for the overview. Mock (dev) payments are left out of the revenue. */
export async function stats(): Promise<AdminStats> {
  const [r] = await query(`select
      (select count(*) from profiles where age_confirmed_at is not null)::int adults,
      (select count(distinct user_id) from entitlements where source = 'payment')::int paying,
      (select count(distinct user_id) from entitlements where source = 'admin')::int granted,
      (select coalesce(sum(amount_micro), 0) from orders where status = 'paid' and tx_signature not like 'mock-%')::bigint revenue,
      (select coalesce(sum(amount_micro), 0) from orders where status = 'paid' and tx_signature not like 'mock-%' and paid_at > now() - interval '30 days')::bigint revenue30,
      (select count(*) from orders where status = 'paid' and tx_signature not like 'mock-%')::int sales,
      (select count(*) from orders where status = 'paid' and tx_signature not like 'mock-%' and paid_at > now() - interval '30 days')::int sales30,
      (select count(*) from orders where status = 'pending' and created_at > now() - interval '24 hours')::int pending24,
      (select count(distinct email) from pending_grants)::int invites`);
  let users: number | null = null;
  if (AUTH_ENABLED) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      users = await (await clerkClient()).users.getCount();
    } catch {
      users = null;
    }
  } else users = Number((await query("select count(*)::int n from (select user_id from profiles union select user_id from entitlements) t"))[0]?.n ?? 0);
  const usdc = (v: unknown) => (Number(v) / 1e6).toFixed(2);
  return {
    users,
    adults: Number(r.adults),
    paying: Number(r.paying),
    granted: Number(r.granted),
    revenueUsdc: usdc(r.revenue),
    revenue30Usdc: usdc(r.revenue30),
    sales: Number(r.sales),
    sales30: Number(r.sales30),
    pending24: Number(r.pending24),
    invites: Number(r.invites),
  };
}

async function findUserByEmail(email: string): Promise<string | null> {
  if (!AUTH_ENABLED) return `dev_${email.split("@")[0]}`;
  const { clerkClient } = await import("@clerk/nextjs/server");
  const res = await (await clerkClient()).users.getUserList({ emailAddress: [email], limit: 1 });
  return res.data[0]?.id ?? null;
}

const avatarIds = () => getAvatars().map((a) => a.id);

async function audit(actor: string, action: string, f: { userId?: string; email?: string; avatarId?: string; product?: string; note?: string }) {
  await query("insert into admin_audit (actor, action, target_user_id, target_email, avatar_id, product, note) values ($1,$2,$3,$4,$5,$6,$7)", [
    actor, action, f.userId ?? null, f.email ?? null, f.avatarId ?? null, f.product ?? null, f.note ?? null,
  ]);
}

const targets = (avatarId: string): string[] | null => (avatarId === "*" ? avatarIds() : avatarIds().includes(avatarId) ? [avatarId] : null);

export type GrantInput = { admin: string; userId?: string; email?: string; avatarId: string; product: unknown; note?: string; origin: string };
export type GrantResult = { ok: true; message: string } | { ok: false; error: string };

/** Give access ("admin" source, shown separately from paid access). With only an email: grant now if that person has an account, otherwise save it and invite them. */
export async function grantAccess(i: GrantInput): Promise<GrantResult> {
  if (!isGrantProduct(i.product)) return { ok: false, error: "unknown product" };
  const avatars = targets(i.avatarId);
  if (!avatars) return { ok: false, error: "unknown avatar" };
  const note = (i.note ?? "").slice(0, 200) || undefined;
  let userId = i.userId;
  const email = i.email?.trim().toLowerCase();
  if (!userId) {
    if (!looksLikeEmail(email)) return { ok: false, error: "enter a valid email" };
    userId = (await findUserByEmail(email!)) ?? undefined;
  }
  if (userId) {
    for (const a of avatars)
      await query(
        "insert into entitlements (user_id, avatar_id, product, source, granted_by, note) values ($1,$2,$3,'admin',$4,$5) on conflict (user_id, avatar_id, product, source) do update set granted_by = $4, note = $5",
        [userId, a, i.product, i.admin, note ?? null],
      );
    await audit(i.admin, "grant", { userId, email, avatarId: i.avatarId, product: String(i.product), note });
    return { ok: true, message: `Granted ${i.product} (${i.avatarId === "*" ? "all avatars" : i.avatarId}).` };
  }
  // Not signed up yet: remember the grant and invite them with Clerk.
  for (const a of avatars)
    await query(
      "insert into pending_grants (email, avatar_id, product, granted_by, note) values ($1,$2,$3,$4,$5) on conflict (email, avatar_id, product) do update set granted_by = $4, note = $5",
      [email, a, i.product, i.admin, note ?? null],
    );
  await audit(i.admin, "invite", { email, avatarId: i.avatarId, product: String(i.product), note });
  let invite = "No invitation email was sent (sign-in is not configured here).";
  if (AUTH_ENABLED) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      await (await clerkClient()).invitations.createInvitation({ emailAddress: email!, redirectUrl: `${i.origin}/join`, ignoreExisting: true, notify: true });
      invite = "Invitation email sent.";
    } catch (e) {
      console.error("invitation failed", e);
      invite = "Saved, but the invitation email could not be sent (they can still sign up normally).";
    }
  }
  return { ok: true, message: `${email} has no account yet. Access will apply when they sign up. ${invite}` };
}

/** Remove access an admin gave. Paid access is never touched. */
export async function revokeAccess(i: { admin: string; userId: string; avatarId: string; product: unknown }): Promise<GrantResult> {
  if (!isGrantProduct(i.product)) return { ok: false, error: "unknown product" };
  const avatars = targets(i.avatarId);
  if (!avatars) return { ok: false, error: "unknown avatar" };
  await query("delete from entitlements where user_id = $1 and avatar_id = any($2) and product = $3 and source = 'admin'", [i.userId, avatars, i.product]);
  await audit(i.admin, "revoke", { userId: i.userId, avatarId: i.avatarId, product: String(i.product) });
  return { ok: true, message: "Removed the admin-granted access." };
}

export async function revokePending(i: { admin: string; email: string; avatarId: string; product: unknown }): Promise<GrantResult> {
  if (!isGrantProduct(i.product)) return { ok: false, error: "unknown product" };
  await query("delete from pending_grants where email = $1 and avatar_id = $2 and product = $3", [i.email.toLowerCase(), i.avatarId, i.product]);
  await audit(i.admin, "revoke_pending", { email: i.email, avatarId: i.avatarId, product: String(i.product) });
  return { ok: true, message: "Removed the pending grant." };
}

export const listPending = () => query("select email, avatar_id, product, granted_by, note, created_at from pending_grants order by created_at desc limit 200");
export const listAudit = () => query("select at, actor, action, target_email, target_user_id, avatar_id, product, note from admin_audit order by id desc limit 50");
