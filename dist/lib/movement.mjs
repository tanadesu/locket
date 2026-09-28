import { visible, poseQuality } from "./pose.mjs";
export const MOTION_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26];
const mean = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const blank = () => ({
  valid: false,
  score: 0,
  intensity: 0,
  dt: 0,
  speeds: {},
  points: null,
  cameraShift: false,
});
export class MovementTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.previous = null;
    this.time = 0;
    this.scale = 0;
  }
  update(points, timestamp) {
    if (!poseQuality(points).detected) {
      this.reset();
      return blank();
    }
    const shoulders = mean(points[11], points[12]),
      hips = mean(points[23], points[24]);
    const scale = Math.max(0.12, distance(shoulders, hips));
    const dt = (timestamp - this.time) / 1000;
    if (
      !this.previous ||
      dt <= 0.015 ||
      dt > 0.3 ||
      Math.abs(scale / this.scale - 1) > 0.12
    ) {
      this.previous = points.map((p) => ({ ...p }));
      this.time = timestamp;
      this.scale = scale;
      return { ...blank(), valid: true, points };
    }
    const alpha = 1 - Math.exp(-dt / 0.045);
    const smooth = points.map((p, i) =>
      visible(p) && visible(this.previous[i])
        ? {
            ...p,
            x: this.previous[i].x + (p.x - this.previous[i].x) * alpha,
            y: this.previous[i].y + (p.y - this.previous[i].y) * alpha,
          }
        : { ...p },
    );
    const deltas = MOTION_JOINTS.filter(
      (i) => visible(points[i]) && visible(this.previous[i]),
    ).map((i) => ({
      i,
      x: smooth[i].x - this.previous[i].x,
      y: smooth[i].y - this.previous[i].y,
    }));
    const dx = deltas.reduce((s, d) => s + d.x, 0) / Math.max(1, deltas.length),
      dy = deltas.reduce((s, d) => s + d.y, 0) / Math.max(1, deltas.length);
    const translation = Math.hypot(dx, dy);
    // Rigid translation of every joint is more likely a camera bump; it cannot earn bonuses.
    const coherent = deltas.filter(
      (d) =>
        Math.hypot(d.x - dx, d.y - dy) < Math.max(0.002, translation * 0.2),
    ).length;
    const cameraShift =
      translation > scale * 0.014 &&
      coherent >= Math.max(6, deltas.length * 0.85);
    const speeds = {};
    let score = 0;
    for (const d of deltas) {
      const displacement = Math.hypot(d.x, d.y) / scale;
      const speed =
        cameraShift || displacement < 0.012
          ? 0
          : Math.min(4, (displacement - 0.012) / dt);
      speeds[d.i] = speed;
      score += speed;
    }
    const result = {
      valid: true,
      score,
      intensity: Math.min(1, score / 8),
      dt,
      speeds,
      points: smooth,
      cameraShift,
      scale,
      hipY: (smooth[23].y + smooth[24].y) / 2,
      shoulderY: (smooth[11].y + smooth[12].y) / 2,
      headY: smooth[0].y,
      ankleY:
        visible(smooth[27]) && visible(smooth[28])
          ? (smooth[27].y + smooth[28].y) / 2
          : null,
      kneeY:
        visible(smooth[25]) && visible(smooth[26])
          ? (smooth[25].y + smooth[26].y) / 2
          : null,
    };
    this.previous = smooth;
    this.time = timestamp;
    this.scale = scale;
    return result;
  }
}
