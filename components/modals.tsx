"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { offeredProducts } from "@/lib/access";
import type { AvatarDef, Product } from "@/lib/types";
import { SignInTrigger } from "./AuthControls";
import { useViewer } from "./viewer";

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function SignInModal({ onClose, why }: { onClose?: () => void; why: string }) {
  return (
    <Modal title="Sign in to continue" onClose={onClose}>
      <p className="modal-text">{why}</p>
      <p className="modal-text modal-text--dim">We email you a one-time code. No password needed.</p>
      <div className="modal-actions">
        <SignInTrigger>Sign in with email</SignInTrigger>
        <Link href="/" className="btn btn--ghost">
          Back
        </Link>
      </div>
    </Modal>
  );
}

export function AgeModal({ onConfirmed, mention, onClose }: { onConfirmed: () => void; mention: string; onClose?: () => void }) {
  const { refresh } = useViewer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const confirm = async () => {
    setBusy(true);
    setError(false);
    const res = await fetch("/api/me/age", { method: "POST" }).catch(() => null);
    if (res?.ok) {
      await refresh();
      onConfirmed();
    } else {
      setError(true);
      setBusy(false);
    }
  };
  return (
    <Modal title="Adults only (18+)" onClose={onClose}>
      <p className="modal-text">
        {mention} contains adult themes and is for people aged <strong>18 or older</strong> only. By continuing you confirm that you are at least 18 years old and
        that viewing this content is legal where you live.
      </p>
      {error && <p className="modal-error">Something went wrong. Please try again.</p>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={confirm} disabled={busy}>
          I&apos;m 18+
        </button>
        <Link href="/" className="btn btn--ghost">
          Leave
        </Link>
      </div>
    </Modal>
  );
}

interface Order {
  id: string;
  status: "pending" | "paid";
  amountUsdc: string;
  recipient: string;
  paymentUrl: string;
  expiresAt: string;
}

const COPY: Record<Product, { title: string; blurb: string }> = {
  taps: { title: "More tap locations", blurb: "Unlock the extra tap locations on this avatar." },
  explicit: { title: "Explicit avatar", blurb: "Unlock the explicit version of this avatar." },
  bundle: { title: "Bundle", blurb: "All tap locations and the explicit avatar, together." },
};

export function PaywallModal({
  avatar,
  need,
  onClose,
  onPaid,
}: {
  avatar: Pick<AvatarDef, "id" | "pricing">;
  need: "taps" | "explicit";
  onClose: () => void;
  onPaid: () => void;
}) {
  const { viewer, features } = useViewer();
  const options = viewer ? offeredProducts(avatar, need, viewer) : [need];
  const [product, setProduct] = useState<Product>(need);
  const [order, setOrder] = useState<Order | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const done = useRef(false);

  const start = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ avatarId: avatar.id, product }) }).catch(() => null);
    if (res?.ok) setOrder((await res.json()) as Order);
    else setError(res?.status === 503 ? "Payments aren't available yet." : res?.status === 409 ? "You already own this." : "Couldn't start the payment. Please try again.");
    setBusy(false);
  };

  useEffect(() => {
    if (order) void QRCode.toDataURL(order.paymentUrl, { margin: 1, width: 240, color: { dark: "#17121f", light: "#ffffff" } }).then(setQr);
  }, [order]);

  const poll = useCallback(async () => {
    if (!order || done.current) return;
    const res = await fetch(`/api/orders/${order.id}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const next = (await res.json()) as Order;
    if (next.status === "paid" && !done.current) {
      done.current = true;
      setOrder(next);
      onPaid();
    }
  }, [order, onPaid]);

  useEffect(() => {
    if (!order || order.status === "paid") return;
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [order, poll]);

  const price = (p: Product) => avatar.pricing[p].toFixed(2);

  return (
    <Modal title={COPY[need].title} onClose={order?.status === "paid" ? undefined : onClose}>
      {!order && (
        <>
          <p className="modal-text">{COPY[need].blurb}</p>
          <div className="options" role="radiogroup" aria-label="What to unlock">
            {options.map((p) => (
              <label key={p} className={`option ${product === p ? "option--on" : ""}`}>
                <input type="radio" name="product" checked={product === p} onChange={() => setProduct(p)} />
                <span className="option-main">
                  <strong>{COPY[p].title}</strong>
                  <span>{COPY[p].blurb}</span>
                </span>
                <span className="option-price">{price(p)} USDC</span>
              </label>
            ))}
          </div>
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={start} disabled={busy || (!features.payments && !features.mockPayments)}>
              Pay with USDC on Solana
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Not now
            </button>
          </div>
          {!features.payments && !features.mockPayments && <p className="modal-text modal-text--dim">Payments aren&apos;t available yet. Check back soon.</p>}
          <p className="modal-fine">Paid in USDC on the Solana network. Payments go straight to us and can&apos;t be reversed automatically; contact us for refunds.</p>
        </>
      )}

      {order && order.status === "pending" && (
        <>
          <p className="modal-text">
            Send exactly <strong>{order.amountUsdc} USDC</strong> (Solana) with a wallet like Phantom or Solflare. Scan the code on your phone, or open it in your wallet.
          </p>
          <div className="qr">{qr ? <img src={qr} alt="Solana Pay QR code" width={240} height={240} /> : <span className="spinner" />}</div>
          <div className="modal-actions">
            <a className="btn" href={order.paymentUrl}>
              Open in wallet
            </a>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(order.recipient).then(() => setCopied(true));
              }}
            >
              {copied ? "Address copied" : "Copy address"}
            </button>
          </div>
          <p className="modal-status" role="status">
            <span className="spinner spinner--small" /> Waiting for your payment… this unlocks automatically.
          </p>
          {features.mockPayments && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={async () => {
                await fetch(`/api/orders/${order.id}/mock-pay`, { method: "POST" });
                await poll();
              }}
            >
              Simulate payment (dev only)
            </button>
          )}
          <p className="modal-fine">Order {order.id.slice(0, 8)} · The link is valid for 30 minutes, but a payment sent later is still honoured.</p>
        </>
      )}

      {order && order.status === "paid" && (
        <>
          <p className="modal-text">✅ Payment received. It&apos;s unlocked!</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Continue
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
