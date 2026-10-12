import { NextResponse } from "next/server";
import { AUTH_ENABLED, MOCK_PAYMENTS, paymentsConfigured } from "@/lib/config";
import { settlePendingOrders } from "@/lib/orders";
import { loadViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** Who is looking and what they own, plus which features are switched on. */
export async function GET() {
  let { userId, viewer } = await loadViewer();
  if (userId && paymentsConfigured()) {
    // A payment may have arrived since the last visit (dialog closed, order timed out, ...).
    await settlePendingOrders(userId).catch(() => {});
    ({ viewer } = await loadViewer());
  }
  return NextResponse.json(
    { viewer, features: { auth: AUTH_ENABLED || process.env.NODE_ENV !== "production", payments: paymentsConfigured() || MOCK_PAYMENTS, mockPayments: MOCK_PAYMENTS } },
    { headers: { "cache-control": "no-store" } },
  );
}
