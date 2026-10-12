import "server-only";
import { cookies } from "next/headers";
import { AUTH_ENABLED } from "./config";

/** The signed-in user's id, or null for guests. */
export async function currentUserId(): Promise<string | null> {
  if (AUTH_ENABLED) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId ?? null;
  }
  // Local development only (no Clerk configured): a fake user from a cookie.
  if (process.env.NODE_ENV !== "production") {
    const name = (await cookies()).get("dev_user")?.value;
    return name ? `dev_${name}` : null;
  }
  return null;
}
