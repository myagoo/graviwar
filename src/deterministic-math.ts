// Fixed arithmetic order avoids browser-specific libm approximations in the simulation.
// Angles are radians. These bounded Taylor series target double-precision accuracy.
export function sin(angle: number): number {
  let x = angle % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x < -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI / 2) x = Math.PI - x;
  if (x < -Math.PI / 2) x = -Math.PI - x;
  let term = x;
  let sum = x;
  for (let n = 1; n <= 11; n++) {
    term *= -(x * x) / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

export const cos = (angle: number) => sin(angle + Math.PI / 2);

export function acos(value: number): number {
  const x = Math.max(-1, Math.min(1, value));
  if (x === 1) return 0;
  if (x === -1) return Math.PI;
  const ratio = Math.sqrt((1 - x) / (1 + x));
  const t = ratio > 1 ? 1 / ratio : ratio;
  const reduced = t / (1 + Math.sqrt(1 + t * t));
  let term = reduced;
  let sum = reduced;
  for (let n = 1; n <= 20; n++) {
    term *= -(reduced * reduced);
    sum += term / (2 * n + 1);
  }
  const angle = 2 * sum;
  return 2 * (ratio > 1 ? Math.PI / 2 - angle : angle);
}
