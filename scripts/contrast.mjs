// WCAG contrast check for every text/background pair NimStage uses.
// Run: node scripts/contrast.mjs   (exits 1 if any pair fails AA)
const c = {
  bg: "#090910",
  surface: "#13131d",
  surface2: "#1b1b29",
  text: "#f6f3ee",
  muted: "#a4a4b8",
  accent: "#fa5d29",
  accentInk: "#130a05",
  blue: "#49b3fc",
  cream: "#f4f0e8",
  creamInk: "#17171d",
  creamMuted: "#595965",
  danger: "#ff7a7a",
  ok: "#5be3a4",
};

const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (hex) => {
  const [r, g, b] = hex2(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Colour of `fg` at `alpha` laid over `bg`: what a tinted chip (e.g. bg-ok/10) really looks like. */
const over = (fg, bg, alpha) => {
  const [f, b] = [hex2(fg), hex2(bg)];
  return "#" + f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
};

// Tinted surfaces used in the UI (Tailwind /10 and /20 backgrounds over the card colour).
c.okTint = over(c.ok, c.surface, 0.1);
c.dangerTint = over(c.danger, c.surface, 0.1);
c.blueTint = over(c.blue, c.surface, 0.1);
c.accentTint = over(c.accent, c.surface, 0.1);
c.accentBar = over(c.accent, c.surface, 0.2); // poll result bar behind option text
c.whiteHover = over("#ffffff", c.surface, 0.09); // ghost-button hover
c.rowActive = over("#ffffff", c.bg, 0.07);

const pairs = [
  ["text", "bg"], ["text", "surface"], ["text", "surface2"],
  ["muted", "bg"], ["muted", "surface"], ["muted", "surface2"],
  ["accent", "bg"], ["accent", "surface"],
  ["accentInk", "accent"], // primary buttons, LIVE pill, active nav
  ["accentInk", "blue"], // blue buttons, SOON pill
  ["blue", "bg"], ["blue", "surface"],
  ["creamInk", "cream"], ["creamMuted", "cream"], // tickets, Me card
  ["danger", "bg"], ["danger", "surface"], ["ok", "bg"], ["ok", "surface"],
  ["accentInk", "danger"], // armed remove button
  // tinted chips and bars
  ["ok", "okTint"], ["danger", "dangerTint"], ["blue", "blueTint"], ["accent", "accentTint"],
  ["text", "accentBar"], ["muted", "accentBar"], // poll option label/percent over the result bar
  ["text", "whiteHover"], ["muted", "rowActive"], ["text", "rowActive"],
];

let fail = 0;
for (const [fg, bg] of pairs) {
  const r = ratio(c[fg], c[bg]);
  const pass = r >= 4.5;
  if (!pass) fail++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${fg.padEnd(10)} on ${bg.padEnd(11)} ${r.toFixed(2)}:1`);
}
console.log(fail ? `\n${fail} pair(s) below 4.5:1` : `\nAll ${pairs.length} pairs meet WCAG AA (4.5:1).`);
process.exit(fail ? 1 : 0);
