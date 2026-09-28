export function pose() {
  const p = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  const coords = {
    0: [0.5, 0.14],
    11: [0.4, 0.3],
    12: [0.6, 0.3],
    13: [0.33, 0.4],
    14: [0.67, 0.4],
    15: [0.3, 0.5],
    16: [0.7, 0.5],
    23: [0.43, 0.55],
    24: [0.57, 0.55],
    25: [0.43, 0.73],
    26: [0.57, 0.73],
    27: [0.43, 0.91],
    28: [0.57, 0.91],
  };
  for (const [i, [x, y]] of Object.entries(coords))
    p[i] = { x, y, z: 0, visibility: 1 };
  return p;
}
export const shifted = (points, dx, dy) =>
  points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
