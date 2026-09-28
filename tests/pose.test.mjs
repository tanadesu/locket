import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { poseQuality, BONES } from "../dist/lib/pose.mjs";
import { pose } from "./fixtures.mjs";
test("STEP 2: detects torso and distinguishes knees/full body", () => {
  const p = pose();
  assert.deepEqual(poseQuality(p), { detected: true, full: true, knees: true });
  p[27].visibility = 0;
  assert.equal(poseQuality(p).full, false);
  assert.equal(poseQuality(p).detected, true);
  p[25].y = 1.2;
  assert.equal(poseQuality(p).knees, false);
  p[11].visibility = 0.1;
  assert.equal(poseQuality(p).detected, false);
  assert.equal(poseQuality(null).detected, false);
  assert.ok(BONES.some((b) => b.includes(28)));
});
test("STEP 2: vendored WASM and model are actual binary assets", () => {
  for (const name of ["vision_wasm_internal", "vision_wasm_nosimd_internal"]) {
    const bytes = readFileSync(`dist/vendor/mediapipe/wasm/${name}.wasm`);
    assert.equal(bytes.subarray(0, 4).toString("hex"), "0061736d");
    assert.ok(bytes.length > 1000000);
  }
  assert.ok(
    readFileSync("dist/vendor/mediapipe/pose_landmarker_lite.task").length >
      5000000,
  );
});

test("STEP 2: cancelling model startup settles its promise and permits a clean retry", async () => {
  const { PoseTracker } = await import("../dist/lib/pose.mjs");
  const workers = [];
  globalThis.Worker = class {
    constructor() {
      workers.push(this);
    }
    postMessage() {}
    terminate() {
      this.terminated = true;
    }
  };
  const tracker = new PoseTracker();
  const pending = tracker.init();
  tracker.close();
  await assert.rejects(pending, /MODEL_CANCELLED/);
  assert.ok(workers[0].terminated);
  const retry = tracker.init();
  workers[1].onmessage({ data: { type: "ready" } });
  await retry;
  assert.equal(tracker.worker, workers[1]);
  tracker.close();
});
