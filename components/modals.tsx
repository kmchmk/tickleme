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
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          {onClose && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function SignInModal({ onClose, why }: { onClose?: () => void; why: string }) {
  return (
    <Modal title="Sign in to continue" onClose={onClose}>
      <p className="modal-text">{why}</p>
      <p className="modal-text modal-text--dim">Enter your email and we send you a one-time code. No password, and no separate sign-up: new here? The same step creates your account.</p>
      <div className="modal-actions">
        <SignInTrigger>Continue with email</SignInTrigger>
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
  manualAmountUsdc?: string;
  txSignature?: string;
}

/** A value with a one-tap copy button (shows "Copied" for a moment). */
function CopyField({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <code className="copy-value">{display ?? value}</code>
      <button type="button" className="btn btn--ghost btn--small" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
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
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [touch, setTouch] = useState(false);
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

  useEffect(() => setTouch(window.matchMedia("(pointer: coarse)").matches), []);

  // Check every few seconds, and right away when the buyer comes back from their wallet app.
  useEffect(() => {
    if (!order || order.status === "paid") return;
    const t = setInterval(() => document.visibilityState === "visible" && void poll(), 3000);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [order, poll]);

  const openManual = async () => {
    setManualOpen(true);
    if (!order || order.manualAmountUsdc) return;
    setManualBusy(true);
    const res = await fetch(`/api/orders/${order.id}/manual`, { method: "POST" }).catch(() => null);
    if (res?.ok) {
      const next = (await res.json()) as Order;
      setOrder((o) => (o && o.status === "pending" ? { ...o, manualAmountUsdc: next.manualAmountUsdc } : o));
    } else setError("Couldn't prepare a manual payment. Please use a wallet app, or try again.");
    setManualBusy(false);
  };

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
              {busy ? (
                <>
                  <span className="spinner spinner--small" /> Preparing…
                </>
              ) : (
                `Pay ${price(product)} USDC`
              )}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Not now
            </button>
          </div>
          {!features.payments && !features.mockPayments && <p className="modal-text modal-text--dim">Payments aren&apos;t available yet. Check back soon.</p>}
          <p className="modal-fine">Paid in USDC on the Solana network, from any Solana wallet or exchange. Payments can&apos;t be reversed automatically; contact us for refunds.</p>
        </>
      )}

      {order && order.status === "pending" && (
        <>
          <div className="pay-amount">
            <strong>{order.amountUsdc} USDC</strong>
            <span>on Solana · {COPY[product].title}</span>
          </div>
          <div className={`pay-ways ${touch ? "pay-ways--touch" : ""}`}>
            <div className="qr">{qr ? <img src={qr} alt="Solana Pay QR code: scan it with your wallet app" width={220} height={220} /> : <span className="spinner" />}</div>
            <a className="btn pay-open" href={order.paymentUrl}>
              Open in wallet app
            </a>
          </div>
          <p className="modal-text modal-text--dim pay-hint">
            {touch ? "Opens Phantom, Solflare or another Solana wallet on this phone." : "Scan with Phantom, Solflare or any Solana wallet on your phone."} The amount is filled
            in for you.
          </p>
          <p className="modal-status" role="status" aria-live="polite">
            <span className="spinner spinner--small" /> Waiting for your payment. This unlocks by itself within seconds.
          </p>

          {!manualOpen ? (
            <button type="button" className="link-btn" onClick={openManual}>
              Paying from an exchange or another app?
            </button>
          ) : (
            <div className="manual">
              {manualBusy || !order.manualAmountUsdc ? (
                <p className="modal-status">
                  <span className="spinner spinner--small" /> Preparing…
                </p>
              ) : (
                <>
                  <p className="modal-text">
                    Send <strong>exactly</strong> this amount of <strong>USDC on the Solana network</strong> to this address. The exact amount is how we recognise your
                    payment.
                  </p>
                  <CopyField label="Amount (USDC)" value={order.manualAmountUsdc} />
                  <CopyField label="Address" value={order.recipient} display={`${order.recipient.slice(0, 6)}…${order.recipient.slice(-6)}`} />
                  <p className="modal-fine">
                    Only USDC on Solana. Other tokens or networks (Ethereum, Tron, BNB…) can&apos;t be recovered. If your exchange takes its fee from the amount, add the fee so
                    exactly {order.manualAmountUsdc} USDC arrives.
                  </p>
                </>
              )}
            </div>
          )}
          {error && <p className="modal-error">{error}</p>}

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
          <p className="modal-fine">
            Order {order.id.slice(0, 8)}. You can close this window: a payment that arrives later still unlocks automatically next time you visit.
          </p>
        </>
      )}

      {order && order.status === "paid" && (
        <>
          <div className="pay-done" role="status">
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="m7.5 12.5 3 3 6-6.5" />
            </svg>
            <strong>Payment received</strong>
            <span>{COPY[product].title} is unlocked. Enjoy!</span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn--wide" onClick={onClose} autoFocus>
              Continue
            </button>
          </div>
          {order.txSignature && !order.txSignature.startsWith("mock-") && (
            <p className="modal-fine">
              <a href={`https://solscan.io/tx/${order.txSignature}`} target="_blank" rel="noreferrer" className="link">
                View the transaction on Solscan ↗
              </a>
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
