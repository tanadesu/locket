import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";

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
export function createRewardService({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  // This cache only coalesces local requests. Durable idempotency belongs to admin.
  const records = new Map();
  function config() {
    if (!httpsUrl(env.ZERO_ARCADE_API_URL, "/api/arcade/rewards") || !env.ZERO_ARCADE_API_KEY || /\s/.test(env.ZERO_ARCADE_API_KEY))
      throw new RewardError("NOT_CONFIGURED");
  }
  function sign(payload) {
    return createHmac("sha256", env.ZERO_ARCADE_API_KEY)
      .update(`power-charge:reward-session:v1:${payload}`).digest("base64url");
  }
  function verify(sessionId) {
    if (typeof sessionId !== "string" || sessionId.length > 1024) throw new RewardError("INVALID_SESSION", 400);
    const [version, payload, signature, extra] = sessionId.split(".");
    if (version !== "v1" || !payload || !/^[A-Za-z0-9_-]{43}$/.test(signature || "") || extra !== undefined)
      throw new RewardError("INVALID_SESSION", 400);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) throw new RewardError("INVALID_SESSION", 400);
    let row;
    try { row = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new RewardError("INVALID_SESSION", 400); }
    if (!row || !/^locket:[0-9a-f-]{36}$/.test(row.playId) || !Number.isSafeInteger(row.startedAt) || !Number.isSafeInteger(row.expiresAt) || row.expiresAt - row.startedAt !== TTL * 1000)
      throw new RewardError("INVALID_SESSION", 400);
    if (row.expiresAt <= now()) throw new RewardError("SESSION_EXPIRED", 410);
    if (now() - row.startedAt < MIN_PLAY_MS) throw new RewardError("TOO_EARLY", 409);
    return row;
  }
  async function start() {
    config();
    const startedAt = now();
    const payload = Buffer.from(JSON.stringify({ playId: `locket:${randomUUID()}`, startedAt, expiresAt: startedAt + TTL * 1000 })).toString("base64url");
    return { sessionId: `v1.${payload}.${sign(payload)}` };
  }
  async function issue(row, points) {
    let response;
    try {
      response = await fetcher(env.ZERO_ARCADE_API_URL, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${env.ZERO_ARCADE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ playId: row.playId, points }),
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
    return { coins: data.coins, qrImageDataUrl: data.coins > 0 ? data.qrImageDataUrl : null, expiresAt: data.coins > 0 ? data.expiresAt : null };
  }
  function reward({ sessionId, points } = {}) {
    config();
    const row = verify(sessionId);
    if (!Number.isInteger(points) || points < 0 || points > 9999) throw new RewardError("INVALID_POINTS", 400);
    for (const [key, record] of records) if (record.expiresAt <= now()) records.delete(key);
    let record = records.get(row.playId);
    if (record && record.points !== points) throw new RewardError("SCORE_CONFLICT", 409);
    if (record?.result) return Promise.resolve(record.result);
    if (record?.promise) return record.promise;
    if (!record) {
      // Bound process memory. Eviction never replaces the signed playId;
      // retries still reach admin with the original idempotency key.
      if (records.size >= 1000) records.delete(records.keys().next().value);
      record = { points, expiresAt: row.expiresAt, result: null, promise: null };
      records.set(row.playId, record);
    }
    record.promise = issue(row, record.points).then(result => {
      record.result = result;
      return result;
    }).finally(() => { record.promise = null; });
    return record.promise;
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
