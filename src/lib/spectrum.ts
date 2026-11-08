// Live audio spectrum for the player, via the Web Audio API.
// An <audio> element can be wrapped by createMediaElementSource() only once, so the graph is a
// module-level singleton keyed by the element. If anything fails (old WebView, autoplay policy) the
// caller falls back to a static waveform: the music itself must never depend on this.

type Graph = { ctx: AudioContext; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> };
const graphs = new WeakMap<HTMLAudioElement, Graph | null>();

export function getSpectrum(audio: HTMLAudioElement): Graph | null {
  if (graphs.has(audio)) return graphs.get(audio) ?? null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("no AudioContext");
    const ctx = new Ctor();
    const src = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128; // 64 bins is plenty for ~40 bars and is cheap to read
    analyser.smoothingTimeConstant = 0.78;
    src.connect(analyser);
    analyser.connect(ctx.destination); // keep the audio audible
    const g: Graph = { ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
    graphs.set(audio, g);
    return g;
  } catch {
    graphs.set(audio, null);
    return null;
  }
}

/** Collapses FFT bins into `bars` values in 0..1, weighted toward the lower (more musical) bins. */
export function readBars(g: Graph, bars: number): number[] {
  g.analyser.getByteFrequencyData(g.data);
  const usable = Math.floor(g.data.length * 0.8);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const a = Math.floor((i / bars) ** 1.4 * usable);
    const b = Math.max(a + 1, Math.floor(((i + 1) / bars) ** 1.4 * usable));
    let sum = 0;
    for (let k = a; k < b; k++) sum += g.data[k];
    out.push(Math.min(1, sum / (b - a) / 255 / 0.85));
  }
  return out;
}
