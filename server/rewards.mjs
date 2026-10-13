import { randomBytes, randomUUID, createHash } from "node:crypto";
import { MemoryStore, RedisStore } from "./reward-store.mjs";

export const MIN_PLAY_MS = 58000; // 3s countdown + 45s charge + 10s launch.
const TTL = 48 * 60 * 60;
export class RewardError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}
function httpsUrl(value, path) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && (!path || u.pathname === path);
  } catch { return false; }
}
export function createRewardService({ env = process.env, store, fetcher = fetch, now = Date.now } = {}) {
  let selectedStore = store;
  const inFlight = new Map();
  function config() {
    if (!httpsUrl(env.ZERO_ARCADE_API_URL, "/api/arcade/rewards") || !env.ZERO_ARCADE_API_KEY || /\s/.test(env.ZERO_ARCADE_API_KEY))
      throw new RewardError("NOT_CONFIGURED");
    if (!selectedStore) {
      if (httpsUrl(env.UPSTASH_REDIS_REST_URL) && env.UPSTASH_REDIS_REST_TOKEN)
        selectedStore = new RedisStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN, fetcher);
      else if (env.VERCEL || env.NODE_ENV === "production") throw new RewardError("STORE_NOT_CONFIGURED");
      else selectedStore = new MemoryStore(now);
    }
    return selectedStore;
  }
  function keyFor(id) {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) throw new RewardError("INVALID_SESSION", 400);
    return `zero-arcade:locket:v1:${createHash("sha256").update(id).digest("hex")}`;
  }
  async function start() {
    const db = config();
    const sessionId = randomBytes(32).toString("hex");
    await db.set(keyFor(sessionId), { playId: `locket:${randomUUID()}`, startedAt: now(), expiresAt: now() + TTL * 1000, points: null, result: null }, TTL);
    return { sessionId };
  }
  async function issue(db, key, points) {
    const token = randomUUID();
    if (!await db.lock(key, token)) throw new RewardError("PROCESSING", 202);
    try {
      const row = await db.get(key);
      if (!row || row.expiresAt <= now()) throw new RewardError("SESSION_EXPIRED", 410);
      if (now() - row.startedAt < MIN_PLAY_MS) throw new RewardError("TOO_EARLY", 409);
      if (row.points !== null && row.points !== points) throw new RewardError("SCORE_CONFLICT", 409);
      if (row.result) return row.result;
      // Freeze the first valid result DURABLY before any external request.
      row.points = points;
      const ttl = Math.max(1, Math.ceil((row.expiresAt - now()) / 1000));
      await db.set(key, row, ttl);
      let response;
      try {
        response = await fetcher(env.ZERO_ARCADE_API_URL, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
          headers: { Authorization: `Bearer ${env.ZERO_ARCADE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ playId: row.playId, points: row.points }),
        });
      } catch { throw new RewardError("UPSTREAM_UNAVAILABLE"); }
      if (!response.ok) {
        const code = { 401: "ADMIN_AUTH", 403: "ADMIN_DISABLED", 409: "ADMIN_CONFLICT", 422: "ADMIN_REVIEW" }[response.status] || "UPSTREAM_UNAVAILABLE";
        throw new RewardError(code);
      }
      let data;
      try { data = await response.json(); } catch { throw new RewardError("INVALID_RESPONSE"); }
      if (!Number.isSafeInteger(data.coins) || data.coins < 0) throw new RewardError("INVALID_RESPONSE");
      if (data.coins > 0 && (typeof data.qrImageDataUrl !== "string" || data.qrImageDataUrl.length > 1000000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.qrImageDataUrl) || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= 0))
        throw new RewardError("INVALID_RESPONSE");
      row.result = { coins: data.coins, qrImageDataUrl: data.coins > 0 ? data.qrImageDataUrl : null, expiresAt: data.coins > 0 ? data.expiresAt : null };
      await db.set(key, row, ttl);
      return row.result;
    } finally { await db.unlock(key, token).catch(() => {}); }
  }
  function reward({ sessionId, points } = {}) {
    const db = config();
    const key = keyFor(sessionId);
    if (!Number.isInteger(points) || points < 0 || points > 9999) throw new RewardError("INVALID_POINTS", 400);
    const existing = inFlight.get(key);
    if (existing) {
      if (existing.points !== points) throw new RewardError("SCORE_CONFLICT", 409);
      return existing.promise;
    }
    const promise = issue(db, key, points).finally(() => inFlight.delete(key));
    inFlight.set(key, { points, promise });
    return promise;
  }
  return { start, reward };
}

const service = createRewardService();
export function apiHandler(action, backend = service) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (req.method !== "POST") { res.setHeader("Allow", "POST"); throw new RewardError("METHOD_NOT_ALLOWED", 405); }
      if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) throw new RewardError("INVALID_REQUEST", 415);
      const origin = req.headers.origin;
      if (req.headers["sec-fetch-site"] === "cross-site" || (origin && new URL(origin).host !== req.headers.host)) throw new RewardError("ORIGIN_DENIED", 403);
      let body = req.body;
      if (body === undefined) {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 2048) throw new RewardError("INVALID_REQUEST", 413);
        }
        body = raw;
      }
      if (typeof body === "string") {
        if (Buffer.byteLength(body) > 2048) throw new RewardError("INVALID_REQUEST", 413);
        try { body = JSON.parse(body); } catch { throw new RewardError("INVALID_REQUEST", 400); }
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new RewardError("INVALID_REQUEST", 400);
      const result = action === "start" ? await backend.start() : await backend.reward(body);
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = error instanceof RewardError ? error.status : 503;
      // Never return raw errors, upstream bodies, URLs, credentials or tokens.
      res.end(JSON.stringify({ error: error instanceof RewardError ? error.code : "SERVICE_UNAVAILABLE" }));
    }
  };
}
