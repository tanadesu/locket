import test from "node:test";
import assert from "node:assert/strict";
import { readRanking, saveScore, playerName } from "../dist/lib/ranking.mjs";
const memory = () => ({
  value: null,
  getItem() {
    return this.value;
  },
  setItem(k, v) {
    this.value = v;
  },
});
test("STEP 8: top ten sorted, persisted, reloadable, and not duplicated", () => {
  const s = memory();
  for (let i = 0; i < 12; i++)
    saveScore(s, {
      id: String(i),
      name: "PLAYER" + i,
      power: i * 700,
      date: i,
    });
  const rows = readRanking(s);
  assert.equal(rows.length, 10);
  assert.equal(rows[0].power, 7700);
  assert.equal(rows[9].power, 1400);
  assert.ok(saveScore(s, rows[0]).duplicate);
  assert.equal(readRanking(s).length, 10);
});
test("STEP 8: names limited to eight visible characters; skipping uses PLAYER", () => {
  assert.equal(playerName("ABCDEFGHIJK"), "ABCDEFGH");
  assert.equal(playerName(""), "PLAYER");
  assert.equal(playerName("🚀🚀🚀🚀🚀🚀🚀🚀🚀"), "🚀🚀🚀🚀🚀🚀🚀🚀");
  assert.equal(playerName("A\u202eB"), "AB");
});
test("STEP 8: corrupt or disabled storage handled without blocking game", () => {
  const s = memory();
  s.value = "{invalid";
  assert.deepEqual(readRanking(s), []);
  s.setItem = () => {
    throw Error("quota");
  };
  assert.equal(saveScore(s, { id: "x", name: "P", power: 10 }).saved, false);
  assert.throws(() => saveScore(s, { id: "bad", name: "P", power: NaN }));
});
