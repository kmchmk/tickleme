import Link from "next/link";

export default function NotFound() {
  return (
    <main className="empty">
      <span className="empty-emoji" aria-hidden>
        🙈
      </span>
      <h1>Nobody here</h1>
      <p>We couldn&apos;t find what you were looking for.</p>
      <Link href="/" className="btn">
        Back to all avatars
      </Link>
    </main>
  );
}
