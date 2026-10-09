import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../dist/lib/engine.mjs";
const quality = { detected: true, knees: true };
const motion = { valid: true, score: 3, cameraShift: false, speeds: {13: 1.5, 14: 1.5, 15: 2, 16: 2}, ranges: {13: .7, 14: .7, 15: 1, 16: 1} };
function ready() {
  const e = new GameEngine();
  e.setup();
  while (e.state === "setup") e.step(0.05, motion, quality);
  assert.equal(e.state, "countdown");
  while (e.state === "countdown") e.step(0.05, motion, quality);
  assert.equal(e.state, "charge");
  return e;
}
test("STEP 5: stable recognition → 3 seconds → exactly 45 seconds → launch", () => {
  const e = ready();
  for (let i = 0; i < 899; i++) e.step(0.05, motion, quality);
  assert.equal(e.state, "charge");
  e.step(0.051, motion, quality);
  assert.equal(e.state, "launch");
  assert.equal(e.remaining, 0);
  assert.ok(e.charge.power > 5000);
});
test("STEP 5: explicit upper-body start works without visible knees", () => {
  const e = new GameEngine();
  e.setup();
  for (let i = 0; i < 30; i++)
    e.step(0.1, motion, { detected: true, knees: false });
  assert.equal(e.state, "setup");
  e.allowUpperBody();
  for (let i = 0; i < 16; i++)
    e.step(0.1, motion, { detected: true, knees: false });
  assert.equal(e.state, "countdown");
});
test("STEP 5: tracking loss and manual pause freeze timer and scoring", () => {
  const e = ready();
  e.pause();
  const score = e.charge.power;
  e.step(30, motion, quality);
  assert.equal(e.elapsed, 0);
  assert.equal(e.charge.power, score);
  e.resume();
  for (let i = 0; i < 21; i++)
    e.step(0.1, { valid: false, score: 0 }, { detected: false });
  assert.equal(e.state, "paused");
  assert.equal(e.pauseReason, "tracking");
});
