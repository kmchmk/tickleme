import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { MOCK_PAYMENTS, SOLANA_RECIPIENT } from "@/lib/config";
import { paymentHealth } from "@/lib/solana";

export const dynamic = "force-dynamic";

/** Live check of everything payments depend on (recipient wallet, its USDC account, the RPC). */
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if ("response" in a) return a.response;
  const configured = !!SOLANA_RECIPIENT;
  const health = configured ? await paymentHealth().catch((e) => ({ error: (e as Error).message })) : null;
  return NextResponse.json(
    { configured, mock: MOCK_PAYMENTS, rpcConfigured: !!process.env.SOLANA_RPC_URL, siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null, health },
    { headers: { "cache-control": "no-store" } },
  );
}
