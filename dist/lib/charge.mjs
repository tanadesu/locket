export const MAX_POWER = 9999;
export class Charge {
  constructor() {
    this.reset();
  }
  reset() {
    this.power = 0;
    this.combo = 0;
    this.activeTime = 0;
    this.idle = 0;
    this.fullUntil = 0;
  }
  add(value) {
    this.power = Math.min(MAX_POWER, Math.max(0, this.power + value));
  }
  step(motion, dt, time) {
    const active = motion.valid && motion.score > 0.65 && !motion.cameraShift;
    if (active) {
      this.idle = 0;
      this.activeTime += dt;
      this.combo = Math.floor(this.activeTime / 0.5);
      const comboMultiplier = 1 + Math.min(this.combo, 40) * 0.01;
      const fullMultiplier = time < this.fullUntil ? 1.5 : 1;
      // Upper-body play alone can reach every destination; no jump is necessary.
      this.add(
        Math.min(190, 60 + motion.score * 25) *
          dt *
          comboMultiplier *
          fullMultiplier,
      );
    } else {
      this.idle += dt;
      if (this.idle >= 2) {
        this.combo = 0;
        this.activeTime = 0;
      }
    }
    return active;
  }
  get tier() {
    return Math.min(4, Math.floor(this.power / 2500));
  }
  get fraction() {
    return this.power / MAX_POWER;
  }
}
