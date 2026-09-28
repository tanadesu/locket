import test from "node:test";
import assert from "node:assert/strict";
import { Charge } from "../dist/lib/charge.mjs";
const motion = { valid: true, score: 4, cameraShift: false };
test("STEP 4: power responds immediately, caps at 9999, and sets effect tiers", () => {
  const charge = new Charge();
  charge.step(motion, 0.05, 0);
  assert.ok(charge.power > 0);
  assert.ok(charge.fraction > 0);
  charge.add(3000);
  assert.equal(charge.tier, 1);
  charge.add(10000);
  assert.equal(charge.power, 9999);
  assert.equal(charge.fraction, 1);
});
test("STEP 4: no phantom power when no player or no motion", () => {
  const charge = new Charge();
  for (let i = 0; i < 100; i++)
    charge.step({ valid: false, score: 0 }, 0.05, i * 0.05);
  assert.equal(charge.power, 0);
});
