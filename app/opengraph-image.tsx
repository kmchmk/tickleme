import { ImageResponse } from "next/og";
import { getAvatars, posterUrl } from "@/lib/avatars";
import { SITE_NAME, TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME}: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

/** Link preview: the name, the tagline and the avatars in their everyday outfit. */
export default async function OpengraphImage() {
  const posters = getAvatars()
    .slice(0, 4)
    .map((a) => posterUrl(a.variants.jeans))
    .filter((u) => /^https?:/.test(u));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #2a1d36 0%, #17121f 60%)", color: "#f6f1ff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 72px", width: 560 }}>
          <div style={{ display: "flex", position: "relative", width: 84, height: 84, borderRadius: 22, background: "#ff7a59", marginBottom: 34 }}>
            {/* the paw from icon.svg (64 -> 84) */}
            {[
              [24, 34],
              [35, 24],
              [49, 24],
              [60, 34],
            ].map(([x, y]) => (
              <div key={x} style={{ position: "absolute", left: x - 6.5, top: y - 6.5, width: 13, height: 13, borderRadius: 7, background: "#fff" }} />
            ))}
            <div style={{ position: "absolute", left: 27.5, top: 40.5, width: 29, height: 24, borderRadius: 14, background: "#fff" }} />
          </div>
          <div style={{ display: "flex", fontSize: 88, fontWeight: 800, letterSpacing: -2 }}>
            Tickle<span style={{ color: "#ff7a59", marginLeft: 18 }}>Me</span>
          </div>
          <div style={{ fontSize: 36, color: "#b5a9c9", marginTop: 14, lineHeight: 1.3, display: "flex" }}>{`${TAGLINE}. Tap a nose, poke a belly, tickle an ear.`}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, paddingRight: 48 }}>
          {posters.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" width={140} height={420} style={{ objectFit: "cover", borderRadius: 24, marginTop: i % 2 ? 60 : -60, border: "3px solid rgba(255,255,255,0.12)" }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
