import test from "node:test";
import assert from "node:assert/strict";
import { destination, flightFrame, DESTINATIONS } from "../dist/lib/flight.mjs";
import { GameEngine } from "../dist/lib/engine.mjs";
test("STEP 7: every power threshold reaches the requested destination", () => {
  for (let i = 0; i < DESTINATIONS.length; i++) {
    const d = DESTINATIONS[i];
    assert.equal(destination(d.min).name, d.name);
    if (i > 0)
      assert.equal(destination(d.min - 1).name, DESTINATIONS[i - 1].name);
  }
  assert.equal(destination(8420).name, "MARS");
  assert.equal(destination(8420).distance, 225000000);
});
test("STEP 7: transfer and 3–2–1 precede ignition; flight advances continuously", () => {
  assert.equal(flightFrame(8420, 0.5).phase, "complete");
  assert.equal(flightFrame(8420, 1.5).phase, "transfer");
  assert.equal(flightFrame(8420, 2).count, 3);
  assert.equal(flightFrame(8420, 3).count, 2);
  assert.equal(flightFrame(8420, 4).count, 1);
  assert.equal(flightFrame(8420, 5).phase, "ignition");
  let last = 0;
  for (let t = 5; t <= 10; t += 0.1) {
    const f = flightFrame(8420, t);
    assert.ok(f.distance >= last);
    last = f.distance;
  }
  assert.equal(flightFrame(8420, 10).distance, 225000000);
  assert.equal(flightFrame(8420, 10).travel, 3.1);
});
test("STEP 7: result appears after ten launch seconds", () => {
  const e = new GameEngine();
  e.state = "launch";
  e.launchTime = 0;
  e.step(9.9, {}, {});
  assert.equal(e.state, "launch");
  e.step(0.11, {}, {});
  assert.equal(e.state, "result");
});
