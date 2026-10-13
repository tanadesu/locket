import test from "node:test";
import assert from "node:assert/strict";
import { createRewardService, MIN_PLAY_MS, apiHandler } from "../server/rewards.mjs";
import { MemoryStore, RedisStore } from "../server/reward-store.mjs";
import { RewardClient } from "../dist/lib/reward-client.mjs";

const env = { ZERO_ARCADE_API_URL: "https://admin.example.test/api/arcade/rewards", ZERO_ARCADE_API_KEY: "test-only-not-a-real-key" };
const payload = { coins: 3000, qrImageDataUrl: "data:image/png;base64,aGVsbG8=", expiresAt: 1900000000 };
const ok = data => ({ ok: true, json: async () => data });
function fixture(fetcher = async () => ok(payload)) {
  let time = 100000;
  const now = () => time;
  const store = new MemoryStore(now);
  return { store, now, advance: (dt = MIN_PLAY_MS) => time += dt, service: createRewardService({ env, store, now, fetcher }) };
}
test("rewards: server-issued identity, minimum time, exact points, cached retry and conflict", async () => {
  const calls = [];
  const f = fixture(async (url, init) => { calls.push({ url, init }); return ok(payload); });
  const { sessionId } = await f.service.start();
  assert.match(sessionId, /^[a-f0-9]{64}$/);
  await assert.rejects(f.service.reward({ sessionId, points: 2500 }), /TOO_EARLY/);
  f.advance();
  const result = await f.service.reward({ sessionId, points: 2500 });
  assert.deepEqual(result, payload);
  assert.deepEqual(await f.service.reward({ sessionId, points: 2500 }), payload);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.points, 2500);
  assert.match(body.playId, /^locket:/);
  assert.deepEqual(Object.keys(body).sort(), ["playId", "points"]);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${env.ZERO_ARCADE_API_KEY}`);
  assert.equal(calls[0].init.redirect, "error");
  await assert.rejects(f.service.reward({ sessionId, points: 9999 }), /SCORE_CONFLICT/);
  for (const points of [-1, 10000, 0.5, "2500", null]) assert.throws(() => f.service.reward({ sessionId, points }), /INVALID_POINTS/);
  assert.throws(() => f.service.reward({ sessionId: "invented", points: 1 }), /INVALID_SESSION/);
});
test("rewards: failed/ambiguous upstream preserves immutable points across server instances", async () => {
  const sent = [];
  const f = fixture(async (url, init) => { sent.push(init.body); throw Error("private details"); });
  const { sessionId } = await f.service.start(); f.advance();
  await assert.rejects(f.service.reward({ sessionId, points: 9999 }), /UPSTREAM_UNAVAILABLE/);
  const nextInstance = createRewardService({ env, store: f.store, now: f.now, fetcher: async (url, init) => { sent.push(init.body); return ok(payload); } });
  await assert.rejects(nextInstance.reward({ sessionId, points: 1 }), /SCORE_CONFLICT/);
  await nextInstance.reward({ sessionId, points: 9999 });
  assert.equal(sent[0], sent[1]);
});
test("rewards: simultaneous requests coalesce and cross-instance lock prevents double send", async () => {
  let release, calls = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const f = fixture(async () => { calls++; await waiting; return ok(payload); });
  const { sessionId } = await f.service.start(); f.advance();
  const input = { sessionId, points: 2500 };
  const one = f.service.reward(input), two = f.service.reward(input);
  assert.equal(one, two);
  const other = createRewardService({ env, store: f.store, now: f.now });
  await assert.rejects(other.reward(input), /PROCESSING/);
  release();
  await Promise.all([one, two]);
  assert.equal(calls, 1);
  assert.deepEqual(await other.reward(input), payload);
});
test("rewards: zero coins has no QR; malformed responses and expired sessions fail safely", async () => {
  const f = fixture(async () => ok({ coins: 0, qrImageDataUrl: "ignore me" }));
  const { sessionId } = await f.service.start(); f.advance();
  assert.deepEqual(await f.service.reward({ sessionId, points: 0 }), { coins: 0, qrImageDataUrl: null, expiresAt: null });
  f.advance(48 * 3600000);
  await assert.rejects(f.service.reward({ sessionId, points: 0 }), /SESSION_EXPIRED/);
  const bad = fixture(async () => ok({ ...payload, qrImageDataUrl: "https://example.test/qr" }));
  const session = await bad.service.start(); bad.advance();
  await assert.rejects(bad.service.reward({ ...session, points: 1 }), /INVALID_RESPONSE/);
});
test("rewards: Vercel cannot silently use process memory; missing config stays disabled", async () => {
  await assert.rejects(createRewardService({ env: {} }).start(), /NOT_CONFIGURED/);
  await assert.rejects(createRewardService({ env: { ...env, VERCEL: "1" } }).start(), /STORE_NOT_CONFIGURED/);
  await assert.rejects(createRewardService({ env: { ...env, ZERO_ARCADE_API_URL: "http://admin.example.test/api/arcade/rewards" } }).start(), /NOT_CONFIGURED/);
});
test("API: method/origin/JSON guards, no-store, and sanitized failure", async () => {
  const backend = { start: async () => { throw Error(env.ZERO_ARCADE_API_KEY); } };
  const handler = apiHandler("start", backend);
  async function run(patch = {}) {
    const req = { method: "POST", body: {}, headers: { host: "game.example.test", origin: "https://game.example.test", "content-type": "application/json" }, ...patch };
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s; } };
    await handler(req, res); return res;
  }
  assert.equal((await run({ method: "GET" })).statusCode, 405);
  assert.equal((await run({ headers: { host: "game.example.test", origin: "https://evil.test", "content-type": "application/json" } })).statusCode, 403);
  assert.equal((await run({ body: "{" })).statusCode, 400);
  const res = await run();
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.statusCode, 503);
  assert.ok(!res.body.includes(env.ZERO_ARCADE_API_KEY));
});
test("Redis adapter uses expiring atomic locks and compare-and-delete release", async () => {
  const calls = [];
  const store = new RedisStore("https://redis.example.test", "test-token", async (url, init) => { calls.push(JSON.parse(init.body)); return ok({ result: "OK" }); });
  assert.equal(await store.lock("session", "owner"), true);
  await store.unlock("session", "owner");
  assert.deepEqual(calls[0], ["SET", "session:lock", "owner", "NX", "EX", 60]);
  assert.equal(calls[1][0], "EVAL");
  assert.match(calls[1][1], /ARGV\[1\]/);
});
function browserStorage() {
  const values = new Map();
  return { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
}
test("client: retry and page reload keep same identity/points, never round into coins", async () => {
  const storage = browserStorage(), bodies = [], changes = [];
  let attempt = 0;
  const fetcher = async (url, init) => {
    if (url.endsWith("start")) return ok({ sessionId: "a".repeat(64) });
    bodies.push(JSON.parse(init.body));
    if (++attempt === 1) throw Error("offline");
    return ok(payload);
  };
  const client = new RewardClient({ storage, fetcher, onChange: s => changes.push(s) });
  client.begin(); await client.finish(2499, "mission");
  assert.equal(changes.at(-1).status, "error");
  await client.finish(9999, "changed");
  const reloaded = new RewardClient({ storage, fetcher });
  assert.equal(reloaded.restore().points, 2499);
  await reloaded.retry();
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
});
test("client: previous player response cannot appear for next player; missing session never issued late", async () => {
  let release;
  const changes = [];
  const client = new RewardClient({ fetcher: async url => url.endsWith("start") ? ok({ sessionId: "a".repeat(64) }) : new Promise(resolve => { release = () => resolve(ok(payload)); }), onChange: s => changes.push(s) });
  client.begin(); const old = client.finish(2500, "old");
  while (!release) await Promise.resolve();
  client.begin(); release(); await old;
  assert.ok(!changes.some(s => s.status === "success"));
  const offline = new RewardClient({ fetcher: async () => { throw Error("offline"); }, onChange: s => changes.push(s) });
  offline.begin(); await offline.finish(10, "offline");
  assert.equal(changes.at(-1).retryable, false);
});
