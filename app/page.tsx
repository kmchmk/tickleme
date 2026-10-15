import AvatarCard from "@/components/AvatarCard";
import { HomeTransitionsProvider } from "@/components/HomeTransitions";
import { AccountArea } from "@/components/AuthControls";
import { getAvatars, summarize } from "@/lib/avatars";

export default function Home() {
  return (
    <main className="home">
      <header className="hero">
        <div className="hero-text">
          <h1 className="hero-title">
            Tickle <span>Me</span>
          </h1>
          <p className="hero-sub">Tap a nose, poke a belly, tickle an ear. Every spot gets a different reaction.</p>
        </div>
        <AccountArea />
      </header>

      <HomeTransitionsProvider>
        <ul className="grid">
          {getAvatars().map((a) => (
            <li key={a.id}>
              <AvatarCard avatar={summarize(a)} />
            </li>
          ))}
        </ul>
      </HomeTransitionsProvider>

      <footer className="home-footer">Best on your phone. Some outfits are for adults only (18+).</footer>
    </main>
  );
}
