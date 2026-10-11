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
    this.history = [];
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
      this.history = [];
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
    // A squat moves the torso while feet stay planted. Do not mistake it for camera shake.
    const feetVisible = [27, 28].every(i => visible(points[i]) && visible(this.previous[i]));
    const feetFollow = feetVisible && [27, 28].every(i =>
      Math.hypot(smooth[i].x - this.previous[i].x - dx, smooth[i].y - this.previous[i].y - dy) < Math.max(.002, translation * .3));
    const cameraShift =
      translation > scale * 0.014 &&
      coherent >= Math.max(6, deltas.length * 0.85) && (!feetVisible || feetFollow);
    const speeds = {};
    let score = 0;
    for (const d of deltas) {
      const displacement = Math.hypot(d.x, d.y) / scale;
      const speed =
        cameraShift || displacement < 0.006
          ? 0
          : Math.min(4, Math.max(0, displacement / dt - 0.2));
      speeds[d.i] = speed;
      score += speed;
    }
    // Recent range, not accumulated path length: fast tiny shaking stays low-value.
    if (cameraShift) this.history = [];
    else this.history.push({ time: timestamp, points: smooth });
    this.history = this.history.filter(frame => timestamp - frame.time <= 650);
    const ranges = {};
    for (const i of MOTION_JOINTS) {
      const samples = this.history.map(frame => frame.points[i]);
      if (samples.length < 2 || !samples.every(visible)) { ranges[i] = 0; continue; }
      const xs = samples.map(p => p.x), ys = samples.map(p => p.y);
      ranges[i] = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / scale;
    }
    const result = {
      ranges,
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
