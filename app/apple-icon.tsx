import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iPhones (they ignore SVG icons). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ff7a59", position: "relative" }}>
        {/* the paw from icon.svg, scaled from 64 to 180 */}
        {[
          [51, 73],
          [76, 51],
          [104, 51],
          [129, 73],
        ].map(([x, y]) => (
          <div key={x} style={{ position: "absolute", left: x - 14, top: y - 14, width: 28, height: 28, borderRadius: 14, background: "#fff" }} />
        ))}
        <div style={{ position: "absolute", left: 59, top: 87, width: 62, height: 50, borderRadius: 31, background: "#fff" }} />
      </div>
    ),
    size,
  );
}
