import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { Bgm } from "../dist/lib/bgm.mjs";

function fixture(saved = null) {
  const media = { plays: 0, pauses: 0, play() { this.plays++; return Promise.resolve(); }, pause() { this.pauses++; } };
  const storage = { getItem: () => saved, setItem: (k, v) => { saved = v; } };
  return { media, storage, bgm: new Bgm(storage, () => media) };
}
test("BGM: silent until enabled, single tracks loop, selection persists", () => {
  const { bgm, media, storage } = fixture();
  bgm.sync(false);
  assert.equal(media.plays, 0);
  bgm.sync(true);
  assert.equal(media.loop, true);
  assert.ok(existsSync(new URL(media.src)));
  bgm.select("pulse");
  assert.match(media.src, /02-pulse/);
  assert.equal(new Bgm(storage).mode, "pulse");
  bgm.sync(false);
  assert.equal(bgm.playing, false);
});
test("BGM: rotation advances in order, suspension preserves position and prevents advance", () => {
  const { bgm, media } = fixture("rotation");
  bgm.sync(true);
  assert.equal(media.loop, false);
  for (const expected of [/02-pulse/, /03-three-notes/, /01-two-notes/]) {
    media.onended();
    assert.match(media.src, expected);
    assert.ok(existsSync(new URL(media.src)));
  }
  media.currentTime = 5;
  bgm.sync(true, true);
  const src = media.src;
  media.onended();
  assert.equal(media.src, src);
  bgm.sync(true, false);
  assert.equal(media.currentTime, 5);
  assert.equal(bgm.playing, true);
});
test("BGM: denied playback can retry and unavailable storage is harmless", async () => {
  let failures = 0;
  const media = { play: () => Promise.reject(Error("denied")), pause() {} };
  const bgm = new Bgm({ getItem() { throw Error(); }, setItem() { throw Error(); } }, () => media, () => failures++);
  bgm.select("three-notes");
  bgm.sync(true);
  await Promise.resolve();
  assert.equal(failures, 1);
  assert.equal(bgm.playing, false);
  media.play = () => Promise.resolve();
  bgm.sync(true);
  assert.equal(bgm.playing, true);
});
