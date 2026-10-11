export const MAX_POWER = 9999;
// Gameplay motion value, not a measurement of physical exertion or fitness.
export function motionRate(motion) {
  if (!motion.valid || motion.cameraShift) return 0;
  const weights = { 15: .25, 16: .25, 13: 1, 14: 1, 11: .65, 12: .65, 23: 1.3, 24: 1.3, 25: 1, 26: 1 };
  let effort = 0;
  for (const [joint, weight] of Object.entries(weights)) {
    const speed = Math.min(2.5, Math.max(0, motion.speeds?.[joint] || 0));
    const range = Math.max(0, motion.ranges?.[joint] || 0);
    const amplitude = Math.min(1.2, Math.max(0, (range - .04) / .5));
    effort += speed * amplitude * weight;
  }
  return Math.min(165, 14 * effort ** 1.35);
}
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
    this.boosts = {};
  }
  add(value) {
    this.power = Math.min(MAX_POWER, Math.max(0, this.power + value));
  }
  applyBonus(event, time) {
    this.add(event.points);
    if (event.key === "full") this.fullUntil = time + 3;
    if (event.multiplier > 1 && event.duration > 0) {
      this.boosts[event.key] = { label: event.label, multiplier: event.multiplier, until: time + event.duration };
    }
  }
  getBoost(time) {
    let best = time < this.fullUntil ? { label: "FULL POWER", multiplier: 1.5 } : { label: "", multiplier: 1 };
    for (const boost of Object.values(this.boosts)) {
      if (time < boost.until && boost.multiplier > best.multiplier) best = boost;
    }
    return best;
  }
  step(motion, dt, time) {
    const rate = motionRate(motion);
    const active = rate >= 1;
    if (active) {
      this.idle = 0;
      this.activeTime += dt;
      this.combo = Math.floor(this.activeTime / 0.5);
      const comboMultiplier = 1 + Math.min(this.combo, 40) * 0.01;
      const fullMultiplier = this.getBoost(time).multiplier;
      // No flat participation points: bigger, coordinated movements earn more.
      this.add(
        rate *
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
