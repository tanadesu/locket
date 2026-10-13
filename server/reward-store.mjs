// No credentials, session tokens or QR data may be logged.
export class MemoryStore {
  constructor(now = Date.now) { this.rows = new Map(); this.locks = new Map(); this.now = now; }
  async get(key) {
    const row = this.rows.get(key);
    if (!row || row.until <= this.now()) { this.rows.delete(key); return null; }
    return structuredClone(row.value);
  }
  async set(key, value, ttl) {
    for (const [k, row] of this.rows) if (row.until <= this.now()) this.rows.delete(k);
    this.rows.set(key, { value: structuredClone(value), until: this.now() + ttl * 1000 });
  }
  async lock(key, token) {
    const old = this.locks.get(key);
    if (old && old.until > this.now()) return false;
    this.locks.set(key, { token, until: this.now() + 60000 });
    return true;
  }
  async unlock(key, token) { if (this.locks.get(key)?.token === token) this.locks.delete(key); }
}

export class RedisStore {
  constructor(url, token, fetcher = fetch) {
    this.url = url; this.token = token; this.fetcher = fetcher;
  }
  async command(...args) {
    const r = await this.fetcher(this.url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw Error("STORE_UNAVAILABLE");
    const data = await r.json();
    if (data.error) throw Error("STORE_UNAVAILABLE");
    return data.result;
  }
  async get(key) { const row = await this.command("GET", key); return row ? JSON.parse(row) : null; }
  async set(key, value, ttl) { await this.command("SET", key, JSON.stringify(value), "EX", ttl); }
  async lock(key, token) { return await this.command("SET", `${key}:lock`, token, "NX", "EX", 60) === "OK"; }
  async unlock(key, token) {
    await this.command("EVAL", "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, `${key}:lock`, token);
  }
}
