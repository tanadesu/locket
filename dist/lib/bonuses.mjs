/** Loose motion gestures with hysteresis, duration checks and cooldowns. */
export class BonusDetector {
  constructor() {
    this.reset();
  }
  reset() {
    this.hand = 0;
    this.full = 0;
    this.cooldowns = { hand: -10, squat: -10, jump: -10, full: -10 };
    this.baseHip = null;
    this.down = false;
    this.downAt = 0;
    this.prepUntil = 0;
    this.history = [];
    this.jump = null;
  }
  update(m, time) {
    if (!m.valid || m.cameraShift || !m.dt) {
      this.hand = 0;
      this.full = 0;
      this.history = [];
      this.jump = null;
      this.baseHip = null;
      this.down = false;
      this.prepUntil = 0;
      return [];
    }
    const events = [],
      s = m.speeds;
    const emit = (key, label, points, cooldown) => {
      if (time - this.cooldowns[key] < cooldown) return false;
      this.cooldowns[key] = time;
      events.push({ key, label, points });
      return true;
    };
    this.hand =
      s[15] > 0.65 && s[16] > 0.65 &&
      s[13] > .3 && s[14] > .3 &&
      (m.ranges?.[15] || 0) > .55 && (m.ranges?.[16] || 0) > .55 &&
      (m.ranges?.[13] || 0) > .25 && (m.ranges?.[14] || 0) > .25
        ? this.hand + m.dt
        : Math.max(0, this.hand - m.dt * 2);
    if (this.hand > 0.22 && emit("hand", "HAND BOOST", 50, 1.8)) this.hand = 0;
    const arms = [13, 14, 15, 16].filter((i) => s[i] > 0.4 && (m.ranges?.[i] || 0) > .25).length >= 2;
    const torso = [11, 12, 23, 24].some((i) => s[i] > 0.3 && (m.ranges?.[i] || 0) > .2);
    const legs = [25, 26].some((i) => s[i] > 0.3 && (m.ranges?.[i] || 0) > .2);
    this.full = arms && torso && legs ? this.full + m.dt : 0;
    if (this.full > 0.25 && emit("full", "FULL POWER!!", 0, 6)) this.full = 0;
    // Hip travel relative to feet rejects camera translation and changing camera angle.
    // Squat bonuses need both down and up; repeated standing-still frames cannot farm them.
    if (m.ankleY !== null && Number.isFinite(m.hipY)) {
      const relative = (m.hipY - m.ankleY) / m.scale;
      if (this.baseHip === null) this.baseHip = relative;
      if (!this.down) {
        this.baseHip = Math.min(this.baseHip + 0.01 * m.dt, relative);
        if (relative - this.baseHip > 0.32) {
          this.down = true;
          this.downAt = time;
          this.prepUntil = time + 1.5;
        }
      } else if (time - this.downAt > 4) {
        this.down = false;
        this.baseHip = relative;
      } else if (relative - this.baseHip < 0.055 && time - this.downAt > 0.3) {
        emit("squat", "SQUAT BOOST", 100, 2);
        this.down = false;
        this.baseHip = relative;
      }
    } else {
      this.down = false;
      this.baseHip = null;
    }
    this.history.push({
      time,
      hip: m.hipY,
      shoulder: m.shoulderY,
      head: m.headY,
      ankle: m.ankleY,
      scale: m.scale,
    });
    this.history = this.history.filter((p) => time - p.time <= 0.35);
    const before = this.history[0];
    if (this.jump) {
      if (time - this.jump.time > 1.1) this.jump = null;
      else if (
        m.hipY - this.jump.apex > 0.07 * m.scale &&
        time - this.jump.time > 0.1
      ) {
        emit("jump", "JUMP BOOST", 150, 2.5);
        this.jump = null;
        this.prepUntil = 0;
      } else this.jump.apex = Math.min(this.jump.apex, m.hipY);
    } else if (
      before &&
      time - before.time > 0.12 &&
      time < this.prepUntil &&
      m.ankleY !== null &&
      before.ankle !== null &&
      (before.hip - m.hipY) / m.scale > 0.12 &&
      (before.shoulder - m.shoulderY) / m.scale > 0.12 &&
      (before.head - m.headY) / m.scale > 0.12 &&
      (before.ankle - m.ankleY) / m.scale > 0.055 &&
      Math.abs(before.scale / m.scale - 1) < 0.08
    ) {
      this.jump = { time, apex: m.hipY };
    }
    return events;
  }
}
