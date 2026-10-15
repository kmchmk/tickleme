import "server-only";
import { AUTH_ENABLED } from "./config";
import { query } from "./db";

/**
 * A person an admin invited (or promised access to) gets it when they first sign in, whichever way they signed up:
 * the verified emails of their account are matched against pending_grants once.
 */
export async function applyPendingGrants(userId: string): Promise<void> {
  if (!AUTH_ENABLED) return; // pending grants only exist with real accounts
  const { clerkClient } = await import("@clerk/nextjs/server");
  const user = await (await clerkClient()).users.getUser(userId);
  const emails = user.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress.toLowerCase());
  if (emails.length) {
    await query(
      `with moved as (delete from pending_grants where email = any($2) returning avatar_id, product, granted_by, note)
       insert into entitlements (user_id, avatar_id, product, source, granted_by, note)
       select $1, avatar_id, product, 'admin', granted_by, note from moved
       on conflict (user_id, avatar_id, product, source) do nothing`,
      [userId, emails],
    );
  }
  await query("insert into grant_checks (user_id) values ($1) on conflict do nothing", [userId]);
}
