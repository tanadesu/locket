import test from "node:test";
import assert from "node:assert/strict";
import { BonusDetector } from "../dist/lib/bonuses.mjs";
import { Charge } from "../dist/lib/charge.mjs";
const motion = (overrides = {}) => ({
  valid: true,
  cameraShift: false,
  dt: 0.05,
  score: 6,
  speeds: { 13: 1, 14: 1, 15: 1, 16: 1 },
  ranges: {13: .5, 14: .5, 15: .8, 16: .8, 23: .3, 25: .3},
  hipY: 0.55,
  shoulderY: 0.3,
  headY: 0.14,
  ankleY: 0.9,
  scale: 0.25,
  ...overrides,
});
test("STEP 6: hand boost requires both wrists and respects cooldown", () => {
  const d = new BonusDetector();
  let events = [];
  for (let i = 0; i < 20; i++) events.push(...d.update(motion(), i * 0.05));
  assert.equal(events.filter((e) => e.key === "hand").length, 1);
  d.reset();
  for (let i = 0; i < 20; i++)
    assert.equal(
      d.update(motion({ speeds: { 15: 2, 16: 0 } }), i * 0.05).length,
      0,
    );
});
test("STEP 6: squat requires a down/up cycle; missing feet and camera motion rejected", () => {
  const d = new BonusDetector();
  d.update(motion(), 0);
  for (let i = 1; i < 8; i++) d.update(motion({ hipY: 0.65 }), i * 0.05);
  assert.ok(d.update(motion(), 0.5).some((e) => e.key === "squat"));
  assert.equal(d.update(motion(), 0.55).length, 0);
  d.reset();
  d.update(motion({ ankleY: null }), 0);
  assert.equal(d.update(motion({ hipY: 0.7, ankleY: null }), 0.2).length, 0);
  assert.equal(d.update(motion({ cameraShift: true }), 0.3).length, 0);
});
test("STEP 6: full power needs arms, torso and knees; multiplier expires", () => {
  const d = new BonusDetector();
  let events = [];
  for (let i = 0; i < 10; i++)
    events.push(
      ...d.update(motion({ speeds: { 13: 1, 15: 1, 23: 1, 25: 1 } }), i * 0.05),
    );
  assert.equal(events.filter((e) => e.key === "full").length, 1);
  const a = new Charge(),
    b = new Charge();
  a.fullUntil = 3;
  a.step(motion(), 0.1, 1);
  b.step(motion(), 0.1, 1);
  assert.ok(Math.abs(a.power - b.power * 1.5) < 0.001);
  a.reset();
  a.fullUntil = 1;
  b.reset();
  a.step(motion(), 0.1, 2);
  b.step(motion(), 0.1, 2);
  assert.equal(a.power, b.power);
});
test("STEP 6: combo grows during movement and resets after two seconds of stillness", () => {
  const c = new Charge();
  for (let i = 0; i < 60; i++) c.step(motion(), 0.05, i * 0.05);
  assert.ok(c.combo >= 5);
  for (let i = 0; i < 39; i++)
    c.step({ valid: false, score: 0 }, 0.05, 3 + i * 0.05);
  assert.ok(c.combo > 0);
  c.step({ valid: false, score: 0 }, 0.06, 5);
  assert.equal(c.combo, 0);
});
test("STEP 6: jump requires preparation, coordinated rise and return", () => {
  const d = new BonusDetector();
  let events = [];
  d.update(motion({ speeds: {} }), 0);
  for (let i = 1; i <= 6; i++)
    d.update(
      motion({ speeds: {}, hipY: 0.65, shoulderY: 0.4, headY: 0.24 }),
      i * 0.05,
    );
  for (let i = 7; i <= 12; i++)
    events.push(
      ...d.update(
        motion({
          speeds: {},
          hipY: 0.48,
          shoulderY: 0.23,
          headY: 0.07,
          ankleY: 0.83,
        }),
        i * 0.05,
      ),
    );
  for (let i = 13; i <= 18; i++)
    events.push(
      ...d.update(
        motion({
          speeds: {},
          hipY: 0.55,
          shoulderY: 0.3,
          headY: 0.14,
          ankleY: 0.9,
        }),
        i * 0.05,
      ),
    );
  assert.equal(events.filter((e) => e.key === "jump").length, 1);
  d.reset();
  for (let i = 0; i < 10; i++)
    assert.equal(
      d.update(motion({ speeds: {}, cameraShift: true }), i * 0.05).length,
      0,
    );
});

test('difficulty: fast small hand motions and shallow hip bobbing cannot farm boosts', () => {
  const d = new BonusDetector();
  let events=[];
  for(let i=0;i<100;i++) events.push(...d.update(motion({
    speeds: {13:2,14:2,15:4,16:4}, ranges: {13:.1,14:.1,15:.15,16:.15},
    hipY: .55 + (1+Math.sin(i*.4))*.02,
  }),i*.05));
  assert.equal(events.length,0);
});
