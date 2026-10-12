import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The signed-in user clicked "I'm 18+". Recorded once, with the time. */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  try {
    await query(
      `insert into profiles (user_id, age_confirmed_at) values ($1, now())
       on conflict (user_id) do update set age_confirmed_at = coalesce(profiles.age_confirmed_at, now())`,
      [userId],
    );
  } catch (e) {
    console.error("age confirm failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
