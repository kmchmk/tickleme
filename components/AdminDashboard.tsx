"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminUser } from "@/lib/admin";
import type { Product } from "@/lib/types";

type Avatar = { id: string; name: string };
type Pending = { email: string; avatar_id: string; product: Product; granted_by: string; note: string | null; created_at: string };
type Audit = { at: string; actor: string; action: string; target_email: string | null; target_user_id: string | null; avatar_id: string | null; product: string | null; note: string | null };

const PRODUCT_LABEL: Record<Product, string> = { taps: "More tap locations", explicit: "Explicit avatar", bundle: "Bundle" };
const PRODUCTS: Product[] = ["taps", "explicit", "bundle"];
const when = (v: string | number | null) => (v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/admin/grants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ ok: false, error: "bad response" }));
}

export default function AdminDashboard({ email, meId, avatars }: { email: string; meId: string; avatars: Avatar[] }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ email: "", avatarId: "*", product: "explicit" as Product, note: "" });

  const loadUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&page=${page}`, { cache: "no-store" });
    if (!res.ok) return setNotice({ ok: false, text: "Could not load users." });
    const d = await res.json();
    setUsers(d.users);
    setTotal(d.total);
    setLimit(d.limit);
  }, [q, page]);
  const loadOverview = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      setPending(d.pending);
      setAudit(d.audit);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadUsers(), 250);
    return () => clearTimeout(t);
  }, [loadUsers]);
  useEffect(() => void loadOverview(), [loadOverview]);

  const user = useMemo(() => users.find((u) => u.id === selected) ?? null, [users, selected]);
  const refresh = () => Promise.all([loadUsers(), loadOverview()]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    const r = await post(body);
    setNotice({ ok: r.ok, text: r.message ?? r.error ?? "" });
    await refresh();
    setBusy(false);
    return r;
  }

  const cell = (u: AdminUser, avatarId: string, product: Product) => {
    const rows = u.access.filter((a) => a.avatarId === avatarId && a.product === product);
    const paid = rows.some((r) => r.source === "payment");
    const adm = rows.find((r) => r.source === "admin");
    return (
      <td key={product}>
        {paid && <span className="adm-tag adm-tag--paid">Paid</span>}
        {adm ? (
          <span className="adm-tag adm-tag--admin" title={`by ${adm.grantedBy ?? "admin"}${adm.note ? ` — ${adm.note}` : ""}`}>
            Admin
            <button type="button" aria-label="Remove admin access" disabled={busy} onClick={() => act({ action: "revoke", userId: u.id, avatarId, product })}>
              ×
            </button>
          </span>
        ) : (
          <button type="button" className="adm-btn" disabled={busy} onClick={() => act({ action: "grant", userId: u.id, avatarId, product })}>
            Grant
          </button>
        )}
      </td>
    );
  };

  return (
    <main className="admin">
      <header className="adm-head">
        <div>
          <h1>Admin</h1>
          <p className="adm-dim">Signed in as {email}. Access given here is marked “Admin”, separate from paid access, and only admins can remove it.</p>
        </div>
        <Link href="/" className="btn btn--ghost btn--small">
          Back to the site
        </Link>
      </header>

      {notice && (
        <p role="status" className={`adm-notice ${notice.ok ? "" : "adm-notice--bad"}`}>
          {notice.text}
        </p>
      )}

      <section className="adm-card">
        <div className="adm-row">
          <input className="adm-input" placeholder="Search users by email or name…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          <button type="button" className="adm-btn" onClick={() => { setQ(email); setPage(0); }}>
            My account
          </button>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Joined</th>
                <th>18+</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.id === selected ? "adm-sel" : ""} onClick={() => setSelected(u.id)}>
                  <td>
                    {u.email || u.id}
                    {u.id === meId && <span className="adm-tag"> you</span>}
                    {u.name && <div className="adm-dim">{u.name}</div>}
                  </td>
                  <td>{when(u.createdAt)}</td>
                  <td>{u.ageConfirmed ? "✓" : "—"}</td>
                  <td>
                    {u.access.length ? (
                      u.access.map((a, i) => (
                        <span key={i} className={`adm-tag adm-tag--${a.source === "admin" ? "admin" : "paid"}`}>
                          {avatars.find((v) => v.id === a.avatarId)?.name ?? a.avatarId}: {a.product}
                        </span>
                      ))
                    ) : (
                      <span className="adm-dim">none</span>
                    )}
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={4} className="adm-dim">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="adm-row adm-pager">
          <button type="button" className="adm-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ← Newer
          </button>
          <span className="adm-dim">
            {total ? `${page * limit + 1}–${Math.min(total, (page + 1) * limit)} of ${total}` : "0"}
          </span>
          <button type="button" className="adm-btn" disabled={(page + 1) * limit >= total} onClick={() => setPage(page + 1)}>
            Older →
          </button>
        </div>
      </section>

      {user && (
        <section className="adm-card">
          <h2>
            {user.email || user.id} {user.id === meId && <span className="adm-tag">your account</span>}
          </h2>
          <p className="adm-dim">
            Joined {when(user.createdAt)} · last sign-in {when(user.lastSignInAt)} · 18+ {user.ageConfirmed ? "confirmed" : "not confirmed"}
          </p>
          <table className="adm-table adm-grid">
            <thead>
              <tr>
                <th>Avatar</th>
                {PRODUCTS.map((p) => (
                  <th key={p}>{PRODUCT_LABEL[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>All avatars</strong>
                </td>
                {PRODUCTS.map((p) => (
                  <td key={p}>
                    <button type="button" className="adm-btn" disabled={busy} onClick={() => act({ action: "grant", userId: user.id, avatarId: "*", product: p })}>
                      Grant all
                    </button>{" "}
                    <button type="button" className="adm-btn adm-btn--quiet" disabled={busy} onClick={() => act({ action: "revoke", userId: user.id, avatarId: "*", product: p })}>
                      Remove admin
                    </button>
                  </td>
                ))}
              </tr>
              {avatars.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  {PRODUCTS.map((p) => cell(user, a.id, p))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="adm-dim">“Bundle” counts as both Taps and Explicit. “Paid” access can’t be removed here.</p>
        </section>
      )}

      <section className="adm-card">
        <h2>Give access to an email address</h2>
        <p className="adm-dim">If they already have an account it applies right away. Otherwise it is saved and they get an invitation email; it applies when they sign up.</p>
        <form
          className="adm-row adm-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act({ action: "grant", ...invite });
            if (r.ok) setInvite({ ...invite, email: "", note: "" });
          }}
        >
          <input className="adm-input" type="email" required placeholder="person@example.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <select className="adm-input" value={invite.avatarId} onChange={(e) => setInvite({ ...invite, avatarId: e.target.value })}>
            <option value="*">All avatars</option>
            {avatars.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select className="adm-input" value={invite.product} onChange={(e) => setInvite({ ...invite, product: e.target.value as Product })}>
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {PRODUCT_LABEL[p]}
              </option>
            ))}
          </select>
          <input className="adm-input" placeholder="Note (optional)" maxLength={200} value={invite.note} onChange={(e) => setInvite({ ...invite, note: e.target.value })} />
          <button type="submit" className="adm-btn adm-btn--main" disabled={busy}>
            Grant &amp; invite
          </button>
        </form>
        {pending.length > 0 && (
          <>
            <h3>Waiting for sign-up</h3>
            <table className="adm-table">
              <tbody>
                {pending.map((p, i) => (
                  <tr key={i}>
                    <td>{p.email}</td>
                    <td>
                      {avatars.find((a) => a.id === p.avatar_id)?.name ?? p.avatar_id}: {PRODUCT_LABEL[p.product]}
                    </td>
                    <td className="adm-dim">{p.note ?? ""}</td>
                    <td>
                      <button type="button" className="adm-btn adm-btn--quiet" disabled={busy} onClick={() => act({ action: "revoke_pending", email: p.email, avatarId: p.avatar_id, product: p.product })}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="adm-card">
        <h2>Recent admin actions</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td>{when(a.at)}</td>
                  <td>{a.actor}</td>
                  <td>{a.action.replace("_", " ")}</td>
                  <td>{a.target_email ?? a.target_user_id}</td>
                  <td>
                    {a.avatar_id === "*" ? "all avatars" : a.avatar_id} {a.product}
                  </td>
                  <td className="adm-dim">{a.note ?? ""}</td>
                </tr>
              ))}
              {!audit.length && (
                <tr>
                  <td className="adm-dim">Nothing yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
