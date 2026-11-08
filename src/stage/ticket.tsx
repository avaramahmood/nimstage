import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Ticker, Watchdog, useFonts } from "./scene";

export type TicketData = { title: string; meta: string; price: string; serial: string };

/* The original ticket: a solid slab with a half-circle bite at the perforation, an ivory face, a stub on the right. */

const W = 3.5;
const H = 2.0;
const R = 0.16;
const NOTCH = 0.13;
const PERF_X = 0.9; // the perforation sits right of centre; the stub is the narrow part

/** Rounded rectangle with a half-circle bite at the top and bottom of the perforation. */
function ticketShape() {
  const x = -W / 2;
  const y = -H / 2;
  const s = new THREE.Shape();
  const px = PERF_X;
  const PI = Math.PI;
  s.moveTo(x + R, y);
  s.lineTo(px - NOTCH, y);
  s.absarc(px, y, NOTCH, PI, 0, true);
  s.lineTo(x + W - R, y);
  s.absarc(x + W - R, y + R, R, -PI / 2, 0, false);
  s.lineTo(x + W, y + H - R);
  s.absarc(x + W - R, y + H - R, R, 0, PI / 2, false);
  s.lineTo(px + NOTCH, y + H);
  s.absarc(px, y + H, NOTCH, 0, -PI, true);
  s.lineTo(x + R, y + H);
  s.absarc(x + R, y + H - R, R, PI / 2, PI, false);
  s.lineTo(x, y + R);
  s.absarc(x + R, y + R, R, PI, (3 * PI) / 2, false);
  return s;
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

function drawFace(p: TicketData) {
  const PX = 292; // pixels per world unit -> a 1022×584 texture
  const cw = Math.round(W * PX);
  const ch = Math.round(H * PX);
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const g = c.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue("--font-display").trim() || "'Bricolage Grotesque', system-ui, sans-serif";
  const mono = css.getPropertyValue("--font-mono").trim() || "'Geist Mono', ui-monospace, monospace";
  const px = (PERF_X + W / 2) * PX;

  g.fillStyle = "#f4f0e8";
  g.fillRect(0, 0, cw, ch);
  const wash = g.createRadialGradient(cw * 0.12, ch * 0.1, 0, cw * 0.12, ch * 0.1, cw * 0.55);
  wash.addColorStop(0, "rgba(250,93,41,0.22)");
  wash.addColorStop(1, "rgba(250,93,41,0)");
  g.fillStyle = wash;
  g.fillRect(0, 0, cw, ch);

  g.fillStyle = "#595965";
  g.font = `600 ${Math.round(ch * 0.055)}px ${mono}`;
  g.fillText("ADMIT ONE · NIMSTAGE", 40, ch * 0.16);

  g.fillStyle = "#17171d";
  g.font = `700 ${Math.round(ch * 0.15)}px ${display}`;
  const lines = wrap(g, p.title, px - 80, 3);
  lines.forEach((l, i) => g.fillText(l, 40, ch * 0.36 + i * ch * 0.165));

  g.fillStyle = "#595965";
  g.font = `500 ${Math.round(ch * 0.06)}px ${mono}`;
  g.fillText(p.meta.length > 46 ? p.meta.slice(0, 45) + "…" : p.meta, 40, ch * 0.9);

  g.setLineDash([10, 9]);
  g.strokeStyle = "rgba(23,23,29,0.35)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(px, ch * 0.09);
  g.lineTo(px, ch * 0.91);
  g.stroke();
  g.setLineDash([]);

  g.save();
  g.translate(px + (cw - px) / 2, ch / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = "center";
  g.fillStyle = "#17171d";
  g.font = `700 ${Math.round(ch * 0.15)}px ${display}`;
  g.fillText(p.price, 0, -ch * 0.02);
  g.fillStyle = "#595965";
  g.font = `500 ${Math.round(ch * 0.05)}px ${mono}`;
  g.fillText(p.serial, 0, ch * 0.08);
  g.restore();

  g.globalCompositeOperation = "destination-out";
  for (const y of [0, ch]) {
    g.beginPath();
    g.arc(px, y, NOTCH * PX, 0, Math.PI * 2);
    g.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function Ticket({ data, still }: { data: TicketData; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  const body = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(ticketShape(), { depth: 0.06, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 10 });
    geo.translate(0, 0, -0.03);
    return geo;
  }, []);
  const face = useMemo(() => drawFace(data), [data]);
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => face.dispose(), [face]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const { x: px, y: py } = state.pointer;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, -0.35 + px * 0.5 + (still ? 0 : Math.sin(t * 0.6) * 0.06), 4, dt);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0.18 - py * 0.3, 4, dt);
    g.rotation.z = still ? -0.06 : -0.06 + Math.sin(t * 0.5) * 0.015;
    g.position.y = still ? 0 : Math.sin(t * 0.8) * 0.06;
  });

  return (
    <group ref={group}>
      <mesh geometry={body}>
        <meshStandardMaterial color="#ebe6da" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.0425]}>
        <planeGeometry args={[W, H]} />
        {/* a little emissive keeps the ivory face and printed text crisp under dim lighting */}
        <meshStandardMaterial map={face} emissiveMap={face} emissive="#ffffff" emissiveIntensity={0.55} transparent alphaTest={0.02} roughness={0.6} />
      </mesh>
    </group>
  );
}

export default function TicketScene({ data, active, still, lite, onSlow }: { data: TicketData; active: boolean; still: boolean; lite: boolean; onSlow: (l: 1 | 2) => void }) {
  const fonts = useFonts(); // the face is drawn on a 2D canvas, so wait for the web fonts first
  return (
    <Canvas frameloop="demand" dpr={lite ? 1 : [1, 1.75]} camera={{ position: [0, 0, 4.6], fov: 34 }} gl={{ antialias: !lite, alpha: true, stencil: false }} style={{ touchAction: "pan-y" }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2.5, 3, 4]} intensity={1.6} color="#ffd9c4" />
      <directionalLight position={[-3, -1, 3]} intensity={0.9} color="#9fd4ff" />
      {fonts && <Ticket data={data} still={still} />}
      <Watchdog onSlow={onSlow} lite={lite} />
      <Ticker active={active && !still} lite={lite} />
    </Canvas>
  );
}
