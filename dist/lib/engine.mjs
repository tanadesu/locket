import { Charge } from "./charge.mjs";
export const CHARGE_SECONDS = 45;
export class GameEngine {
  constructor() {
    this.charge = new Charge();
    this.reset();
  }
  reset() {
    this.state = "title";
    this.elapsed = 0;
    this.countdown = 3;
    this.stable = 0;
    this.lost = 0;
    this.upperBody = false;
    this.pausedFrom = null;
    this.pauseReason = "";
    this.charge.reset();
  }
  setup() {
    this.reset();
    this.state = "setup";
  }
  allowUpperBody() {
    this.upperBody = true;
  }
  pause(reason = "manual") {
    if (this.state === "paused" && this.pauseReason === "tracking") {
      this.pauseReason = reason;
      return;
    }
    if (!["charge", "countdown"].includes(this.state)) return;
    this.pausedFrom = this.state;
    this.state = "paused";
    this.pauseReason = reason;
  }
  resume() {
    if (this.state !== "paused") return;
    this.state = this.pausedFrom;
    this.lost = 0;
    if (this.state === "countdown") this.countdown = 3;
  }
  step(dt, motion, quality) {
    // dt is real monotonic active time. Hidden tabs explicitly pause, never score in the background.
    if (!Number.isFinite(dt) || dt < 0) return;
    if (this.state === "setup") {
      this.stable =
        quality.detected && (quality.knees || this.upperBody)
          ? this.stable + Math.min(dt, 0.1)
          : 0;
      if (this.stable >= 1.5) {
        this.state = "countdown";
        this.countdown = 3;
        this.lost = 0;
      }
    } else if (this.state === "countdown") {
      this.lost = quality.detected ? 0 : this.lost + dt;
      if (this.lost > 0.7) {
        this.state = "setup";
        this.stable = 0;
        return;
      }
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.state = "charge";
        this.elapsed = 0;
      }
    } else if (this.state === "charge") {
      const previousLost = this.lost;
      this.lost = quality.detected ? 0 : this.lost + dt;
      const activeDt = Math.min(dt, CHARGE_SECONDS - this.elapsed,
        quality.detected ? dt : Math.max(0, 5 - previousLost));
      this.charge.step(quality.detected ? motion : { valid: false, score: 0 }, Math.min(activeDt, 0.15), this.elapsed);
      this.elapsed = Math.min(CHARGE_SECONDS, this.elapsed + activeDt);
      if (this.elapsed >= CHARGE_SECONDS) {
        this.state = "launch";
        this.launchTime = 0;
      } else if (this.lost >= 5) this.pause("tracking");
    } else if (this.state === "paused" && this.pauseReason === "tracking") {
      if (quality.detected) this.resume();
    } else if (this.state === "launch") {
      this.launchTime += dt;
      if (this.launchTime >= 10) this.state = "result";
    }
  }
  get remaining() {
    return Math.max(0, Math.ceil(CHARGE_SECONDS - this.elapsed));
  }
}
