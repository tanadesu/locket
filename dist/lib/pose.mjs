export const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
export const BONES = [
  [0, 11],
  [0, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];
export const visible = (p) =>
  !!p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  (p.visibility ?? 1) >= 0.6 &&
  p.x > 0.015 &&
  p.x < 0.985 &&
  p.y > 0.015 &&
  p.y < 0.985;
export function poseQuality(points) {
  if (!points || ![0, 11, 12, 23, 24].every((i) => visible(points[i])))
    return { detected: false, full: false, knees: false };
  return {
    detected: true,
    full: [25, 26, 27, 28].every((i) => visible(points[i])),
    knees: [25, 26].every((i) => visible(points[i])),
  };
}
/** Inference lives off the rendering thread. Never queue more than one video frame. */
export class PoseTracker {
  constructor() {
    this.worker = null;
    this.busy = false;
    this.lastVideoTime = -1;
    this.lastSent = 0;
    this.onPose = () => {};
    this.onError = () => {};
    this.generation = 0;
  }
  async init() {
    if (this.worker) return this.initPromise;
    const worker = new Worker(new URL("./pose-worker.js", import.meta.url));
    this.worker = worker;
    this.initPromise = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.cancelInit = null;
        error ? reject(error) : resolve();
      };
      const timeout = setTimeout(() => {
        finish(Error("MODEL_TIMEOUT"));
        if (this.worker === worker) this.close();
      }, 30000);
      this.cancelInit = () => finish(Error("MODEL_CANCELLED"));
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker) return;
        if (data.type === "ready") finish();
        if (data.type === "pose") {
          this.busy = false;
          this.onPose(data.points, data.timestamp);
        }
        if (data.type === "error") {
          this.busy = false;
          if (!settled) finish(Error(data.message));
          else this.onError(Error(data.message));
        }
      };
      worker.onerror = () => {
        if (this.worker !== worker) return;
        if (!settled) finish(Error("MODEL_WORKER"));
        else this.onError(Error("MODEL_WORKER"));
      };
      worker.postMessage({ type: "init" });
    });
    return this.initPromise;
  }
  async sample(video, now) {
    if (
      !this.worker ||
      this.busy ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoTime ||
      now - this.lastSent < 50
    )
      return;
    this.busy = true;
    this.lastVideoTime = video.currentTime;
    this.lastSent = now;
    const worker = this.worker,
      generation = this.generation;
    try {
      const bitmap = await createImageBitmap(video, {
        resizeWidth: 480,
        resizeHeight: Math.round((480 * video.videoHeight) / video.videoWidth),
      });
      if (this.worker !== worker || this.generation !== generation) {
        bitmap.close();
        return;
      }
      worker.postMessage({ type: "frame", bitmap, timestamp: now }, [bitmap]);
    } catch (error) {
      if (this.generation === generation) {
        this.busy = false;
        this.onError(error);
      }
    }
  }
  close() {
    this.generation++;
    this.cancelInit?.();
    this.cancelInit = null;
    this.initPromise = null;
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
    this.lastVideoTime = -1;
  }
}
