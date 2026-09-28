import test from "node:test";
import assert from "node:assert/strict";
import { MovementTracker } from "../dist/lib/movement.mjs";
import { pose, shifted } from "./fixtures.mjs";
test("STEP 3: stillness and subpixel landmark noise earn no movement", () => {
  const tracker = new MovementTracker();
  for (let i = 0; i < 80; i++) {
    const p = pose();
    p.forEach((v, j) => {
      v.x += Math.sin(i + j) * 0.0005;
      v.y += Math.cos(i + j) * 0.0005;
    });
    assert.equal(tracker.update(p, i * 50).score, 0);
  }
});
test("STEP 3: moving wrists responds on the next inference frame", () => {
  const tracker = new MovementTracker();
  tracker.update(pose(), 0);
  const p = pose();
  p[15].y -= 0.06;
  p[16].y -= 0.07;
  const result = tracker.update(p, 50);
  assert.ok(result.score > 3);
  assert.ok(result.speeds[15] > 1);
  assert.ok(result.intensity > 0);
});
test("STEP 3: rigid camera shake is rejected; tracking loss/reacquisition does not score", () => {
  const tracker = new MovementTracker();
  tracker.update(pose(), 0);
  assert.equal(tracker.update(shifted(pose(), 0.025, 0.025), 50).score, 0);
  tracker.update(null, 100);
  assert.equal(tracker.update(shifted(pose(), -0.1, 0), 150).score, 0);
  assert.equal(tracker.update(pose(), 3000).score, 0);
});
test("STEP 3: invisible wrists cannot add movement", () => {
  const tracker = new MovementTracker();
  tracker.update(pose(), 0);
  const p = pose();
  p[15].y = 0.05;
  p[15].visibility = 0.1;
  assert.equal(tracker.update(p, 50).score, 0);
});
