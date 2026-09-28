import test from "node:test";
import assert from "node:assert/strict";
import { Camera } from "../dist/lib/camera.mjs";
const fixture = () => {
  const track = {
    stopped: false,
    stop() {
      this.stopped = true;
    },
    addEventListener() {},
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = { srcObject: null, async play() {} };
  return { track, stream, video };
};
test("STEP 1: camera requests video only; stop releases tracks", async () => {
  const f = fixture();
  let constraints;
  const camera = new Camera(f.video, {
    getUserMedia: async (c) => {
      constraints = c;
      return f.stream;
    },
  });
  assert.equal(await camera.start(), true);
  assert.equal(constraints.audio, false);
  assert.equal(f.video.srcObject, f.stream);
  camera.stop();
  assert.ok(f.track.stopped);
  assert.equal(f.video.srcObject, null);
});
test("STEP 1: cancelling a pending permission request cleans up late stream", async () => {
  const f = fixture();
  let resolve;
  const camera = new Camera(f.video, {
    getUserMedia: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = camera.start();
  camera.stop();
  resolve(f.stream);
  assert.equal(await pending, false);
  assert.ok(f.track.stopped);
});
test("STEP 1: video playback failure releases camera", async () => {
  const f = fixture();
  f.video.play = async () => {
    throw Error("play failed");
  };
  const camera = new Camera(f.video, { getUserMedia: async () => f.stream });
  await assert.rejects(camera.start());
  assert.ok(f.track.stopped);
});
