import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { coverColors } from "@shared/format";
import { imgUrl } from "@/lib/img";

export type StageItem = {
  key: string;
  kind: "artist" | "track";
  label: string;
  sub: string;
  seed: string;
  image?: string | null; // uploaded artwork: used by the flat (no-WebGL) tiles
  onOpen: () => void;
};

export type Live = { level: number; playing: boolean };

/* ---------- textures: drawn once on a 2D canvas, so the GPU never runs a gradient shader ---------- */

function meshGradient(ctx: CanvasRenderingContext2D, size: number, seed: string) {
  const [a, b, c] = coverColors(seed);
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  const p = (n: number) => (0.12 + ((h >>> n) % 76) / 100) * size;
  ctx.fillStyle = "#14141f";
  ctx.fillRect(0, 0, size, size);
  const blobs: [string, number, number, number][] = [
    [a, p(0), p(5), 0.85],
    [b, p(10), p(15), 0.85],
    [c, p(20), p(25), 0.95],
  ];
  for (const [col, x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * r);
    g.addColorStop(0, col);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
}

/** Loads an uploaded artwork for a canvas texture. Resolves null on any failure: the generated art stays. */
function loadImage(key: string | null | undefined): Promise<HTMLImageElement | null> {
  const src = imgUrl(key);
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draws `img` to fill the box (like object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / k;
  const sh = h / k;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function tileTexture(item: StageItem) {
  const W = 256;
  const H = 320;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const paint = (img: HTMLImageElement | null) => {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    roundRect(ctx, 0, 0, W, H, 28);
    ctx.clip();
    ctx.fillStyle = "#14141f";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    roundRect(ctx, 12, 12, W - 24, W - 24, item.kind === "artist" ? (W - 24) / 2 : 18);
    ctx.clip();
    if (img) drawCover(ctx, img, 12, 12, W - 24, W - 24);
    else {
      ctx.translate(12, 12);
      meshGradient(ctx, W - 24, item.seed);
    }
    ctx.restore();
    ctx.fillStyle = "#f4f0e8";
    ctx.font = "700 24px Outfit, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    const label = item.label.length > 17 ? `${item.label.slice(0, 16)}…` : item.label;
    ctx.fillText(label, 18, H - 42);
    ctx.fillStyle = "#a6a6b8";
    ctx.font = "500 17px Outfit, system-ui, sans-serif";
    const sub = item.sub.length > 24 ? `${item.sub.slice(0, 23)}…` : item.sub;
    ctx.fillText(sub, 18, H - 18);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, W - 2, H - 2, 28);
    ctx.stroke();
  };
  paint(null); // the generated art shows immediately; an uploaded image replaces it when it has loaded
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (item.image)
    void loadImage(item.image).then((img) => {
      if (!img) return;
      paint(img);
      t.needsUpdate = true;
    });
  return t;
}

/* ---------- the hero record (the original look): fine grooves, a separate label disc, warm + cool lights ---------- */

// Built once and cached: the grooves are the same for every show, only the label changes.
let grooves: THREE.CanvasTexture | null = null;
const labels = new Map<string, THREE.CanvasTexture>();

function makeGrooves() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0c0c11";
  g.fillRect(0, 0, S, S);
  const cx = S / 2;
  for (let r = S * 0.2; r < S * 0.49; r += 1.7) {
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.strokeStyle = `rgba(255,255,255,${0.03 + ((r * 7) % 5) * 0.012})`;
    g.lineWidth = 0.8;
    g.stroke();
  }
  // dark bands between the tracks
  for (const r of [0.31, 0.38, 0.44]) {
    g.beginPath();
    g.arc(cx, cx, S * r, 0, Math.PI * 2);
    g.strokeStyle = "rgba(0,0,0,0.65)";
    g.lineWidth = 2;
    g.stroke();
  }
  // two light wedges, like light catching the grooves; they turn with the disc
  const sheen = g.createConicGradient(0.6, cx, cx);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.08, "rgba(255,255,255,0.24)");
  sheen.addColorStop(0.16, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0)");
  sheen.addColorStop(0.58, "rgba(255,255,255,0.2)");
  sheen.addColorStop(0.66, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  g.globalCompositeOperation = "screen";
  g.fillStyle = sheen;
  g.beginPath();
  g.arc(cx, cx, S * 0.49, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

function makeLabel(seed: string, image?: string | null) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const [a, b, d] = coverColors(seed);
  const blob = (x: number, y: number, r: number, col: string) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  };
  const paint = (img: HTMLImageElement | null) => {
    g.fillStyle = "#14141f";
    g.fillRect(0, 0, S, S);
    if (img) drawCover(g, img, 0, 0, S, S);
    else {
      blob(S * 0.3, S * 0.3, S * 0.7, a);
      blob(S * 0.75, S * 0.7, S * 0.65, b);
      blob(S * 0.5, S * 0.9, S * 0.6, d + "aa");
    }
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#0a0a10";
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.035, 0, Math.PI * 2);
    g.fill();
  };
  paint(null);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (image)
    void loadImage(image).then((img) => {
      if (!img) return;
      paint(img);
      t.needsUpdate = true;
    });
  return t;
}

function Record({ seed, image, live, still }: { seed: string; image?: string | null; live: Live; still: boolean }) {
  const disc = useRef<THREE.Mesh>(null);
  const tilt = useRef<THREE.Group>(null);
  const spin = useRef({ vel: -0.8, grab: null as null | { a: number; v: number } });
  const tex = useMemo(() => {
    grooves ??= makeGrooves();
    const id = `${seed}|${image ?? ""}`;
    let label = labels.get(id);
    if (!label) labels.set(id, (label = makeLabel(seed, image)));
    return { grooves, label };
  }, [seed, image]);
  const { gl, camera } = useThree();

  // Grab the platter like a DJ: the angle around the centre follows the pointer while held, a flick
  // keeps it spinning and it eases back to its idle speed.
  useEffect(() => {
    const el = gl.domElement;
    const angle = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      // the disc is tilted, so squash the vertical axis to match what the eye sees
      return Math.atan2((e.clientY - (r.top + r.height / 2)) / 0.62, e.clientX - (r.left + r.width / 2));
    };
    const down = (e: PointerEvent) => {
      spin.current.grab = { a: angle(e), v: 0 };
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      const g = spin.current.grab;
      if (!g || !disc.current) return;
      const a = angle(e);
      let d = a - g.a;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      g.a = a;
      disc.current.rotation.y -= d; // clockwise on screen = negative rotation about the disc's axis
      g.v = -d * 60; // rad/s, roughly (pointer events arrive ~60/s)
      spin.current.vel = g.v;
    };
    const up = () => {
      if (spin.current.grab) spin.current.vel = spin.current.grab.v;
      spin.current.grab = null;
      el.style.cursor = "grab";
    };
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl]);

  useFrame((state, dt) => {
    const g = tilt.current;
    const d = disc.current;
    if (!g || !d) return;
    const sp = spin.current;
    if (!sp.grab) {
      const idle = -(0.8 + (live.playing ? 1.2 : 0));
      sp.vel += (idle - sp.vel) * Math.min(1, dt * 1.4);
      d.rotation.y += sp.vel * dt;
    }
    // lean gently toward the pointer and bob a little, as in the first version
    const t = state.clock.elapsedTime;
    const { x: px, y: py } = state.pointer;
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 1.05 - py * 0.22 + (still ? 0 : Math.sin(t * 0.7) * 0.03), 4, dt);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, 0.18 + px * 0.28, 4, dt);
    g.position.y = THREE.MathUtils.damp(g.position.y, (still ? 0 : Math.sin(t * 0.9) * 0.07) + (sp.grab ? -0.06 : 0), 8, dt);
    camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={tilt} rotation={[1.05, 0, 0.18]}>
      <mesh ref={disc}>
        <cylinderGeometry args={[1.62, 1.62, 0.05, 64]} />
        <meshStandardMaterial attach="material-0" color="#0b0b10" roughness={0.35} metalness={0.4} />
        <meshStandardMaterial attach="material-1" map={tex.grooves} roughness={0.3} metalness={0.35} />
        <meshStandardMaterial attach="material-2" color="#0b0b10" roughness={0.6} />
        <mesh position={[0, 0.0262, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.6, 40]} />
          <meshStandardMaterial map={tex.label} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.05, 16]} />
          <meshStandardMaterial color="#d8d8e0" metalness={0.9} roughness={0.3} />
        </mesh>
      </mesh>
    </group>
  );
}

/** The record on its own: one small canvas for the hero panel. */
export function HeroRecord({ seed, image, live, active, still, lite, onSlow }: { seed: string; image?: string | null; live: Live; active: boolean; still: boolean; lite: boolean; onSlow: (l: 1 | 2) => void }) {
  return (
    <Canvas frameloop="demand" dpr={lite ? 1 : [1, 1.75]} camera={{ position: [0, 0, 6.6], fov: 34 }} gl={{ antialias: !lite, alpha: true, stencil: false }} style={{ touchAction: "pan-y" }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 3]} intensity={3} color="#ffb48f" />
      <directionalLight position={[-4, 1, 2]} intensity={2.2} color="#7cc8ff" />
      <Record seed={seed} image={image} live={live} still={still} />
      <Watchdog onSlow={onSlow} lite={lite} />
      <Ticker active={active && !still} lite={lite} />
    </Canvas>
  );
}

/* ---------- ribbons: pure vertex shader curves, driven by time, audio level and the pointer ---------- */

const RIBBON_VERT = /* glsl */ `
uniform float uTime; uniform float uLevel; uniform vec2 uPointer; uniform float uPhase; uniform float uWidth; uniform float uKick;
varying float vT; varying float vSide;
void main() {
  float t = uv.x; float side = uv.y - 0.5;
  float x = (t - 0.5) * 16.0;
  float amp = 0.8 + uLevel * 1.1 + uKick * 0.8;
  float w1 = t * 5.0 + uTime * 0.55 + uPhase;
  float w2 = t * 2.3 - uTime * 0.35 + uPhase * 1.7;
  float y = sin(w1) * amp * 0.55 + sin(w2) * amp * 0.45;
  float z = cos(w1 * 0.8) * 1.2 + sin(w2) * 0.6;
  // bend toward the pointer, strongest in the middle of the ribbon
  float pull = smoothstep(0.0, 0.5, 0.5 - abs(t - 0.5));
  y += uPointer.y * 1.4 * pull * 0.5;
  z += uPointer.x * 1.0 * pull;
  float a = t * 7.0 + uTime * 0.9 + uPhase;
  vec3 off = vec3(0.0, cos(a), sin(a)) * side * uWidth * (0.7 + uLevel * 1.2);
  vT = t; vSide = side;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vec3(x, y, z) + off, 1.0);
}`;

const RIBBON_FRAG = /* glsl */ `
uniform vec3 uA; uniform vec3 uB; uniform float uTime; uniform float uLevel;
varying float vT; varying float vSide;
void main() {
  float fade = smoothstep(0.0, 0.3, vT) * smoothstep(1.0, 0.7, vT);
  float edge = 1.0 - abs(vSide) * 2.0;
  float glow = pow(edge, 0.7);
  vec3 col = mix(uA, uB, 0.5 + 0.5 * sin(vT * 6.0 + uTime * 0.6));
  float pulse = 0.55 + uLevel * 0.9;
  gl_FragColor = vec4(col * pulse, fade * glow * 0.8);
}`;

const RIBBONS = [
  { a: "#fa5d29", b: "#ffb15e", phase: 0, width: 0.55 },
  { a: "#49b3fc", b: "#8ee3ff", phase: 2.1, width: 0.45 },
  { a: "#c25bff", b: "#fa5d29", phase: 4.2, width: 0.4 },
  { a: "#f4f0e8", b: "#49b3fc", phase: 5.5, width: 0.22 },
];

function Ribbons({ live, pointer, kick }: { live: Live; pointer: React.RefObject<THREE.Vector2>; kick: React.RefObject<number> }) {
  const mats = useMemo(
    () =>
      RIBBONS.map(
        (r) =>
          new THREE.ShaderMaterial({
            vertexShader: RIBBON_VERT,
            fragmentShader: RIBBON_FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            uniforms: {
              uTime: { value: 0 },
              uLevel: { value: 0 },
              uKick: { value: 0 },
              uPointer: { value: new THREE.Vector2() },
              uPhase: { value: r.phase },
              uWidth: { value: r.width },
              uA: { value: new THREE.Color(r.a) },
              uB: { value: new THREE.Color(r.b) },
            },
          }),
      ),
    [],
  );
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1, 180, 1), []);
  const smooth = useRef(0);
  useEffect(
    () => () => {
      mats.forEach((m) => m.dispose());
      geo.dispose();
    },
    [mats, geo],
  );
  useFrame((state, dt) => {
    smooth.current += (live.level - smooth.current) * Math.min(1, dt * 8);
    for (const m of mats) {
      const u = m.uniforms;
      u.uTime.value = state.clock.elapsedTime;
      u.uLevel.value = smooth.current;
      u.uKick.value = kick.current ?? 0;
      u.uPointer.value.copy(pointer.current);
    }
    kick.current *= Math.pow(0.7, dt / 0.05); // the click "kick" fades out over about half a second
  });
  return (
    <group position={[0, 0.7, -1.2]}>
      {mats.map((m, i) => (
        <mesh key={i} geometry={geo} material={m} frustumCulled={false} renderOrder={i} />
      ))}
    </group>
  );
}

/** Tiles are 1.5 wide; leave a little air between neighbours. */
const ringRadius = (n: number) => Math.max(3.2, (n * 1.7) / (Math.PI * 2));

/** Backs the camera off until the whole ring fits the canvas width, so nothing is ever cropped. */
function Fit({ count }: { count: number }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const half = Math.tan((cam.fov * Math.PI) / 360);
    const d = (ringRadius(count) + 1.1) / (half * aspect);
    cam.position.set(0, 0.6, Math.min(18, Math.max(7.6, d)) - 0.4);
    cam.lookAt(0, 0, -0.4);
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, count, invalidate]);
  return null;
}

/* ---------- the tile ring: drag to spin (with inertia), hover lifts, click opens ---------- */

function Tile({ item, angle, radius, hovered, index }: { item: StageItem; angle: number; radius: number; hovered: React.RefObject<string | null>; index: number }) {
  const mesh = useRef<THREE.Group>(null);
  // Each tile draws its own texture on its own turn (index * 40 ms), so fourteen canvases are not painted in one
  // long task that would freeze taps. Keyed on what is drawn, not on the item object, so a data refetch doesn't redraw.
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let made: THREE.CanvasTexture | null = null;
    const t = setTimeout(() => {
      made = tileTexture(item);
      setTex(made);
    }, index * 40);
    return () => {
      clearTimeout(t);
      made?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.key, item.kind, item.label, item.sub, item.seed, item.image, index]);
  const open = useRef(item.onOpen);
  useEffect(() => {
    open.current = item.onOpen;
  }, [item.onOpen]);
  useFrame((_, dt) => {
    const g = mesh.current;
    if (!g) return;
    const isHot = hovered.current === item.key;
    const s = isHot ? 1.16 : 1;
    g.scale.x += (s - g.scale.x) * Math.min(1, dt * 10);
    g.scale.setScalar(g.scale.x);
    g.position.y += ((isHot ? 0.28 : 0) - g.position.y) * Math.min(1, dt * 10);
  });
  if (!tex) return null;
  return (
    <group rotation={[0, angle, 0]}>
      <group ref={mesh} position={[0, 0, radius]}>
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation();
            hovered.current = item.key;
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            hovered.current = null;
            document.body.style.cursor = "";
          }}
          onClick={(e) => {
            if (e.delta > 6) return; // that was a drag, not a click
            e.stopPropagation();
            open.current();
          }}
        >
          <planeGeometry args={[1.5, 1.875]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function Ring({ items, live, scroll }: { items: StageItem[]; live: Live; scroll: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const vel = useRef(0.18);
  const drag = useRef<{ x: number; last: number } | null>(null);
  const hovered = useRef<string | null>(null); // a ref, not state: hovering must not re-render every tile
  const { gl, size } = useThree();
  const radius = ringRadius(items.length);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, last: e.clientX };
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.last;
      d.last = e.clientX;
      vel.current = (dx / size.width) * 9;
      if (group.current) group.current.rotation.y += (dx / size.width) * 5;
    };
    const up = () => {
      drag.current = null;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl, size.width]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || drag.current) return;
    const rest = hovered.current ? 0 : live.playing ? 0.32 : 0.16;
    vel.current += (rest - vel.current) * Math.min(1, dt * 1.6); // inertia decays to a gentle drift
    g.rotation.y += vel.current * dt + (scroll.current ?? 0) * 0.00005;
    scroll.current *= Math.pow(0.8, dt / 0.05); // scroll nudge fades out
  });

  return (
    <group ref={group} position={[0, -0.15, -0.4]}>
      {items.map((it, i) => (
        <Tile key={it.key} item={it} index={i} angle={(i / items.length) * Math.PI * 2} radius={radius} hovered={hovered} />
      ))}
    </group>
  );
}

/* ---------- adaptive quality: step down if frames are slow, then ask to be switched off ---------- */

export function Watchdog({ onSlow, lite }: { onSlow: (level: 1 | 2) => void; lite: boolean }) {
  const acc = useRef({ n: 0, t: 0, strikes: 0 });
  const { setDpr } = useThree();
  useFrame((_, dt) => {
    const a = acc.current;
    if (dt > 0.5) return; // tab was hidden / resumed
    a.n++;
    a.t += dt;
    if (a.n < 60) return;
    const avg = a.t / a.n;
    a.n = 0;
    a.t = 0;
    // full mode runs at the display rate (~16 ms); lite runs at 30fps on purpose (~33 ms)
    if (avg > (lite ? 0.07 : 0.036)) {
      a.strikes++;
      if (a.strikes === 1) setDpr(1);
      onSlow(a.strikes >= 2 ? 2 : 1);
    } else a.strikes = Math.max(0, a.strikes - 1);
  });
  return null;
}

/**
  Drives rendering only while visible. It rides requestAnimationFrame so frames land on the display's
  vsync (a setInterval drifts against it and judders). Full rate normally; ~30fps in lite mode.
  The canvas itself is frameloop="demand".
*/
export function Ticker({ active, lite }: { active: boolean; lite: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    const gap = lite ? 29 : 0; // a little under 33ms so 30fps isn't missed by a vsync
    let raf = 0;
    let last = -Infinity;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last >= gap) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, lite, invalidate]);
  return null;
}

/** Textures are drawn on a 2D canvas, so wait for the web fonts or they'd bake in a fallback font. */
export function useFonts() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    const done = () => live && setOk(true);
    Promise.all([document.fonts.load("700 24px Outfit"), document.fonts.load("700 24px 'Bricolage Grotesque'"), document.fonts.load("600 14px 'Geist Mono'")]).then(done, done);
    const t = setTimeout(done, 1500); // never block on a slow font
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);
  return ok;
}

function Pointer({ target, kick, scroll }: { target: React.RefObject<THREE.Vector2>; kick: React.RefObject<number>; scroll: React.RefObject<number> }) {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.current.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    };
    const click = () => {
      kick.current = 1;
    };
    let lastY = window.scrollY;
    const onScroll = () => {
      scroll.current = window.scrollY - lastY;
      lastY = window.scrollY;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", click);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", click);
      window.removeEventListener("scroll", onScroll);
    };
  }, [gl, target, kick, scroll]);
  return null;
}

export default function Scene({ items, live, active, still, lite, onSlow }: { items: StageItem[]; live: Live; active: boolean; still: boolean; lite: boolean; onSlow: (l: 1 | 2) => void }) {
  const pointer = useRef(new THREE.Vector2());
  const kick = useRef(0);
  const scroll = useRef(0);
  const fonts = useFonts();
  return (
    <Canvas
      frameloop="demand"
      dpr={lite ? 1 : [1, 1.5]}
      camera={{ position: [0, 0.6, 11], fov: 48 }}
      gl={{ antialias: false, alpha: true, powerPreference: "default", stencil: false }}
      style={{ touchAction: "pan-y" }}
    >
      <Fit count={items.length} />
      <Pointer target={pointer} kick={kick} scroll={scroll} />
      <Ribbons live={live} pointer={pointer} kick={kick} />
      {fonts && <Ring items={items} live={live} scroll={scroll} />}
      <Watchdog onSlow={onSlow} lite={lite} />
      <Ticker active={active && !still} lite={lite} />
    </Canvas>
  );
}
