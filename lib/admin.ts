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
  ageConfirmed: boolean;
  access: { avatarId: string; product: Product; source: "payment" | "admin"; grantedBy?: string; note?: string }[];
}

async function decorate(base: { id: string; email: string; name: string; createdAt: number | null; lastSignInAt: number | null }[]): Promise<AdminUser[]> {
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

/** Users, newest first, optionally filtered by an email / name search. */
export async function listUsers(q: string, offset: number, limit: number): Promise<{ users: AdminUser[]; total: number }> {
  if (AUTH_ENABLED) {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const res = await client.users.getUserList({ query: q || undefined, limit, offset, orderBy: "-created_at" });
    const base = res.data.map((u) => ({
      id: u.id,
      email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? "",
      name: [u.firstName, u.lastName].filter(Boolean).join(" "),
      createdAt: u.createdAt ?? null,
      lastSignInAt: u.lastSignInAt ?? null,
    }));
    return { users: await decorate(base), total: res.totalCount };
  }
  // Development without Clerk: whoever has a profile or an entitlement.
  const rows = await query("select user_id from (select user_id from profiles union select user_id from entitlements) t order by user_id");
  const base = rows
    .map((r) => String(r.user_id))
    .filter((id) => !q || id.includes(q.toLowerCase()))
    .map((id) => ({ id, email: `${id.replace(/^dev_/, "")}@dev.local`, name: "", createdAt: null, lastSignInAt: null }));
  return { users: await decorate(base.slice(offset, offset + limit)), total: base.length };
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
