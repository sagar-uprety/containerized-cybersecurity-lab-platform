// Deterministic PRNG so the mock dataset looks the same every dev session
// instead of reshuffling on every reload (mulberry32).
export function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function weighted<T>(rand: () => number, options: Array<[T, number]>): T {
  const total = options.reduce((acc, [, w]) => acc + w, 0);
  let r = rand() * total;
  for (const [value, w] of options) {
    if (r < w) return value;
    r -= w;
  }
  return options[options.length - 1][0];
}

export function randInt(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
