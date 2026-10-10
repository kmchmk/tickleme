import Link from "next/link";
import { getAvatars } from "@/lib/avatars";

export default function Home() {
  return (
    <main>
      <h1>Tickle Me</h1>
      <ul>
        {getAvatars().map((a) => (
          <li key={a.id}>
            <Link href={`/a/${a.id}`}>{a.name}</Link> {a.premium && "🔒"}
          </li>
        ))}
      </ul>
    </main>
  );
}
