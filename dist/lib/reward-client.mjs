const KEY = "power-charge.reward-result.v1";
const MESSAGES = {
  NOT_CONFIGURED: "ユニコイン連携の設定待ちです。ゲーム結果は記録できます。",
  STORE_NOT_CONFIGURED: "ユニコイン連携の保存先設定待ちです。",
  NO_SESSION: "報酬用セッションを開始できませんでした。ゲーム結果は有効です。",
  SESSION_EXPIRED: "受け取り情報の保存期限が切れました。スタッフにお知らせください。",
  TOO_EARLY: "終了確認中です。少し待って再試行してください。",
  PROCESSING: "QRを発行中です。少し待って再試行してください。",
  ADMIN_AUTH: "連携キーを確認する必要があります。スタッフにお知らせください。",
  ADMIN_DISABLED: "運営側で報酬発行が停止されています。",
  ADMIN_REVIEW: "付与数を確認中です。",
  SCORE_CONFLICT: "このプレイの結果が一致しません。スタッフにお知らせください。",
  ADMIN_CONFLICT: "報酬の記録を確認する必要があります。スタッフにお知らせください。",
};
export class RewardClient {
  constructor({ storage, fetcher = (...args) => fetch(...args), onChange = () => {} } = {}) {
    this.storage = storage; this.fetcher = fetcher; this.onChange = onChange;
    this.generation = 0; this.snapshot = null; this.pending = null; this.busy = false;
  }
  save() { try { this.storage?.setItem(KEY, JSON.stringify(this.snapshot)); } catch {} }
  restore() {
    try {
      const row = JSON.parse(this.storage?.getItem(KEY) || "null");
      if (row && Number.isInteger(row.points) && row.points >= 0 && row.points <= 9999 &&
          /^[a-f0-9]{64}$/.test(row.sessionId) && typeof row.missionId === "string" && row.missionId.length < 100 &&
          Number.isFinite(row.savedAt) && Date.now() - row.savedAt < 48 * 3600000) {
        this.snapshot = Object.freeze(row);
        this.pending = Promise.resolve({ sessionId: row.sessionId });
        return this.snapshot;
      }
    } catch {}
    return null;
  }
  clear() {
    this.generation++; this.snapshot = null; this.pending = null; this.busy = false;
    try { this.storage?.removeItem(KEY); } catch {}
  }
  async post(path, body) {
    const response = await this.fetcher(path, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    let data;
    try { data = await response.json(); } catch { throw Error("UNAVAILABLE"); }
    if (!response.ok || data.error) throw Error(data.error || "UNAVAILABLE");
    return data;
  }
  begin() {
    this.clear();
    this.pending = this.post("/api/session/start", {}).then(data => {
      if (!/^[a-f0-9]{64}$/.test(data.sessionId)) throw Error("NO_SESSION");
      return data;
    }).catch(error => ({ error: error.message }));
  }
  async finish(points, missionId) {
    if (!this.snapshot) this.snapshot = Object.freeze({ points, missionId, savedAt: Date.now(), sessionId: null });
    return this.retry();
  }
  async retry() {
    if (this.busy || !this.snapshot) return;
    const generation = this.generation;
    this.busy = true;
    this.onChange({ status: "loading" });
    try {
      const session = await this.pending;
      if (generation !== this.generation) return;
      if (!session?.sessionId) throw Error(session?.error || "NO_SESSION");
      if (!this.snapshot.sessionId) {
        this.snapshot = Object.freeze({ ...this.snapshot, sessionId: session.sessionId });
        this.save();
      }
      const data = await this.post("/api/reward", { sessionId: this.snapshot.sessionId, points: this.snapshot.points });
      if (generation !== this.generation) return;
      if (!Number.isSafeInteger(data.coins) || data.coins < 0 || (data.coins > 0 &&
        (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.qrImageDataUrl) || !Number.isSafeInteger(data.expiresAt)))) throw Error("UNAVAILABLE");
      this.onChange({ status: "success", ...data });
    } catch (error) {
      if (generation !== this.generation) return;
      this.onChange({ status: "error", message: MESSAGES[error.message] || "QRを取得できませんでした。ゲーム結果は有効です。時間をおいて再試行してください。", retryable: !!this.snapshot?.sessionId && !["SESSION_EXPIRED", "SCORE_CONFLICT", "ADMIN_CONFLICT"].includes(error.message) });
    } finally { if (generation === this.generation) this.busy = false; }
  }
}
