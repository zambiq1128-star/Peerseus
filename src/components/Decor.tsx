/* Original decorative shapes (spiky star, ink splat) drawn as plain SVG polygons. Purely visual: aria-hidden. */

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pts(list: [number, number][]) {
  return list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/** Spiky starburst: alternating long and short points. */
export function Starburst({ points = 12, seed = 1, className = "" }: { points?: number; seed?: number; className?: string }) {
  const r = mulberry(seed);
  const list: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points + (r() - 0.5) * 0.08;
    const rad = i % 2 === 0 ? 46 + r() * 4 : 20 + r() * 8;
    list.push([50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad]);
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className} fill="currentColor"><polygon points={pts(list)} /></svg>
  );
}

/** Irregular ink splat with a few long drips and spikes. */
export function Splat({ seed = 1, className = "" }: { seed?: number; className?: string }) {
  const r = mulberry(seed);
  const n = 22;
  const list: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const spike = r() < 0.28;
    const rad = spike ? 40 + r() * 10 : 22 + r() * 12;
    list.push([50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad]);
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className} fill="currentColor"><polygon points={pts(list)} /></svg>
  );
}
