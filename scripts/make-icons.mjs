// Draws the NimStage icon and writes every size the app needs.
//   node scripts/make-icons.mjs
// A hexagonal vinyl (a nod to Nimiq's hexagon) under a stage spotlight, with equalizer bars as its label.
import fs from "node:fs";
import sharp from "sharp";

const hex = (r, cx = 256, cy = 256) =>
  [-90, -30, 30, 90, 150, 210].map((a) => `${(cx + r * Math.cos((a * Math.PI) / 180)).toFixed(1)},${(cy + r * Math.sin((a * Math.PI) / 180)).toFixed(1)}`).join(" ");

/**
 * @param {{ rounded: boolean, scale?: number }} o  rounded: the rounded-square app icon; otherwise a full-bleed
 * square (what stores and home screens want, they apply their own corners). scale: shrink the artwork (maskable).
 */
function icon({ rounded, scale = 1 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fa5d29"/><stop offset=".55" stop-color="#c25bff"/><stop offset="1" stop-color="#49b3fc"/></linearGradient>
    <linearGradient id="label" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc06b"/><stop offset="1" stop-color="#fa5d29"/></linearGradient>
    <radialGradient id="glowA" cx=".8" cy=".14" r=".75"><stop offset="0" stop-color="#fa5d29" stop-opacity=".42"/><stop offset="1" stop-color="#fa5d29" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx=".12" cy=".92" r=".75"><stop offset="0" stop-color="#49b3fc" stop-opacity=".36"/><stop offset="1" stop-color="#49b3fc" stop-opacity="0"/></radialGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="square"><rect width="512" height="512" rx="${rounded ? 112 : 0}"/></clipPath>
    <clipPath id="disc"><polygon points="${hex(176)}"/></clipPath>
  </defs>
  <g clip-path="url(#square)">
    <rect width="512" height="512" fill="#090910"/>
    <rect width="512" height="512" fill="url(#glowA)"/>
    <rect width="512" height="512" fill="url(#glowB)"/>
    <polygon points="206,0 306,0 478,512 34,512" fill="url(#beam)"/>
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
      <polygon points="${hex(176)}" fill="#12121b" stroke="url(#ring)" stroke-width="16" stroke-linejoin="round"/>
      <g fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="5" stroke-linejoin="round">
        <polygon points="${hex(148)}"/>
        <polygon points="${hex(122)}"/>
        <polygon points="${hex(96)}"/>
      </g>
      <polygon points="112,128 196,128 408,384 324,384" fill="#fff" fill-opacity=".09" clip-path="url(#disc)"/>
      <circle cx="256" cy="256" r="66" fill="url(#label)"/>
      <g stroke="#130a05" stroke-width="13" stroke-linecap="round">
        <line x1="226" y1="244" x2="226" y2="268"/>
        <line x1="241" y1="228" x2="241" y2="284"/>
        <line x1="256" y1="212" x2="256" y2="300"/>
        <line x1="271" y1="232" x2="271" y2="280"/>
        <line x1="286" y1="246" x2="286" y2="266"/>
      </g>
    </g>
  </g>
</svg>
`;
}

fs.mkdirSync("public", { recursive: true });
const rounded = icon({ rounded: true });
fs.writeFileSync("public/icon.svg", rounded);
fs.writeFileSync("public/favicon.svg", rounded);

const png = async (svg, size, file) => {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log("wrote", file, size + "px");
};
await png(rounded, 512, "public/icon-512.png");
await png(rounded, 192, "public/icon-192.png");
await png(icon({ rounded: false }), 180, "public/apple-touch-icon.png"); // iOS adds its own rounded corners
await png(icon({ rounded: false, scale: 0.78 }), 512, "public/icon-maskable-512.png"); // artwork inside the safe zone

fs.writeFileSync(
  "public/manifest.webmanifest",
  JSON.stringify(
    {
      name: "NimStage",
      short_name: "NimStage",
      description: "Live music, real fans, paid in NIM.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#090910",
      theme_color: "#090910",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("wrote public/manifest.webmanifest");
