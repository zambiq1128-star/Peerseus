export const START_ELO = 1000;
const K = 32;

export function expectedScore(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** result: 1 = A wins, 0.5 = draw, 0 = A loses. Returns [deltaA, deltaB]. */
export function eloDelta(a: number, b: number, result: 1 | 0.5 | 0): [number, number] {
  const dA = Math.round(K * (result - expectedScore(a, b)));
  return [dA, -dA];
}
