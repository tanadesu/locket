import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pose } from "./fixtures.mjs";

// DOM/media adapters only. This exercises the real app, clock, scoring and ranking;
// it deliberately does not claim browser layout or MediaPipe inference validation.
test("STEP 9: full app journey with synthetic camera/pose adapters", async () => {
  let now = 0,
    raf,
    trackStopped = false,
    poseMode = "moving";
  const handlers = {};
  const gradient = { addColorStop() {} };
  const context = new Proxy(
    {},
    {
      get: (obj, key) =>
        key in obj
          ? obj[key]
          : key === "createLinearGradient" || key === "createRadialGradient"
            ? () => gradient
            : (...args) => {
                for (const a of args)
                  if (typeof a === "number")
                    assert.ok(
                      Number.isFinite(a),
                      `Canvas ${String(key)} must receive finite coordinates`,
                    );
              },
      set: (o, k, v) => ((o[k] = v), true),
    },
  );
  const make = () => ({
    hidden: false,
    disabled: false,
    textContent: "",
    innerHTML: "",
    value: "",
    style: { setProperty() {} },
    dataset: {},
    children: [],
    classList: { toggle() {}, add() {}, remove() {} },
    parentElement: { classList: { toggle() {} } },
    attributes: {},
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    removeAttribute(k) { delete this.attributes[k]; },
    append(...c) {
      this.children.push(...c);
    },
    replaceChildren(...c) {
      this.children = [...c];
    },
    addEventListener(k, cb) {
      this["on" + k] = cb;
    },
    setSelectionRange() {},
    getContext: () => context,
    clientWidth: 1440,
    clientHeight: 810,
    videoWidth: 640,
    videoHeight: 480,
    readyState: 2,
    currentTime: 0,
    srcObject: null,
    async play() {},
  });
  const html = readFileSync("dist/index.html", "utf8"),
    ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  const nodes = Object.fromEntries(ids.map((id) => [id, make()]));
  const storage = new Map();
  globalThis.document = {
    getElementById: (id) => {
      assert.ok(nodes[id], `Missing UI element ${id}`);
      return nodes[id];
    },
    createElement: make,
    createTextNode: (text) => ({ textContent: text }),
    addEventListener: (k, cb) => (handlers[k] = cb),
  };
  globalThis.window = {
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
    },
    addEventListener: (k, cb) => (handlers[k] = cb),
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async (options) => {
          assert.equal(options.audio, false);
          return {
            getTracks: () => [
              {
                stop() {
                  trackStopped = true;
                },
              },
            ],
            getVideoTracks: () => [{ addEventListener() {} }],
          };
        },
      },
    },
  });
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.devicePixelRatio = 1;
  globalThis.requestAnimationFrame = (cb) => {
    raf = cb;
    return 1;
  };
  globalThis.performance = { now: () => now };
  globalThis.createImageBitmap = async () => ({ close() {} });
  globalThis.Worker = class {
    postMessage(data) {
      queueMicrotask(() => {
        if (data.type === "init") this.onmessage({ data: { type: "ready" } });
        else {
          const p = pose(),
            t = data.timestamp / 1000;
          const amplitude = poseMode === "moving" ? 0.15 : 0;
          p[15].y += Math.sin(t * 5) * amplitude;
          p[16].y += Math.cos(t * 5) * amplitude;
          p[13].y += Math.sin(t * 5) * amplitude * 0.6;
          p[14].y += Math.cos(t * 5) * amplitude * 0.6;
          if (poseMode === "missing") p.forEach(point => { point.visibility = 0; });
          this.onmessage({
            data: { type: "pose", points: p, timestamp: data.timestamp },
          });
        }
      });
    }
    terminate() {}
  };
  let musicPlays = 0;
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: "NOT_CONFIGURED" }) });
  globalThis.Audio = class {
    play() { musicPlays++; return Promise.resolve(); }
    pause() {}
  };
  await import("../dist/game.js");
  assert.equal(musicPlays, 0, "No autoplay before a user gesture");
  handlers.click();
  assert.equal(musicPlays, 1, "Sound defaults on at first interaction");
  nodes.sound.onclick();
  assert.equal(nodes.sound.attributes["aria-pressed"], false);
  handlers.click();
  assert.equal(musicPlays, 1, "A muted click must not restart music");
  nodes.sound.onclick();
  assert.equal(musicPlays, 2, "Sound can be enabled again");
  async function frames(n) {
    for (let i = 0; i < n; i++) {
      now += 1000 / 60;
      nodes.camera.currentTime = now / 1000;
      raf(now);
      await Promise.resolve();
      await Promise.resolve();
    }
  }
  assert.equal(nodes.game.dataset.state, "title");
  nodes["show-ranking"].onclick();
  assert.equal(nodes.game.dataset.state, "ranking");
  nodes["ranking-back"].onclick();
  await nodes.start.onclick();
  await frames(290);
  assert.equal(nodes.game.dataset.state, "charge");
  await frames(300);
  assert.ok(Number(nodes.power.textContent.replaceAll(",", "")) > 100);
  assert.ok(Number(nodes["power-meter"].attributes["aria-valuenow"]) > 100);
  nodes.exit.onclick();
  assert.equal(nodes.game.dataset.state, "paused");
  const pausedTime = nodes.time.textContent;
  await frames(180);
  assert.equal(nodes.time.textContent, pausedTime);
  nodes.resume.onclick();
  assert.equal(nodes.game.dataset.state, "charge");
  await frames(1800);
  assert.equal(nodes.game.dataset.state, "charge");
  assert.equal(nodes["last-seconds"].hidden, false);
  await frames(650);
  assert.equal(nodes.game.dataset.state, "launch");
  assert.equal(trackStopped, true);
  await frames(650);
  assert.equal(nodes.game.dataset.state, "result");
  assert.equal(nodes.result.hidden, false);
  assert.equal(nodes["reward-qr"].hidden, true);
  assert.match(nodes["reward-message"].textContent, /設定待ち/);
  assert.ok(
    Number(nodes["result-power"].textContent.replaceAll(",", "")) > 1000,
  );
  nodes["player-name"].value = "テスト🚀";
  nodes["score-form"].onsubmit({ preventDefault() {} });
  assert.equal(nodes["save-score"].disabled, true);
  assert.equal(storage.size, 1);
  nodes["skip-name"].onclick();
  assert.equal(JSON.parse([...storage.values()][0]).length, 1);
  await nodes.replay.onclick();
  assert.equal(nodes.game.dataset.state, "setup");
  await frames(290);
  poseMode = "missing";
  await frames(240);
  assert.equal(nodes.game.dataset.state, "charge", "Tracking grace lasts more than 4 seconds");
  await frames(100);
  assert.equal(nodes.game.dataset.state, "paused");
  assert.equal(nodes["pause-screen"].hidden, true, "No modal obscures the camera");
  assert.equal(nodes.hud.hidden, false);
  assert.ok(nodes.camera.srcObject, "Camera stream stays connected");
  const trackingTime = nodes.time.textContent;
  await frames(120);
  assert.equal(nodes.time.textContent, trackingTime);
  poseMode = "moving";
  await frames(30);
  assert.equal(nodes.game.dataset.state, "charge", "Tracking recovery resumes automatically");
  assert.equal(nodes["tracking-notice"].hidden, true);
  nodes.exit.onclick();
  nodes.quit.onclick();
  assert.equal(nodes.game.dataset.state, "title");
  let issuedCoins = 3000;
  globalThis.fetch = async url => ({ ok: true, json: async () => url.endsWith("start")
    ? { sessionId: "a".repeat(64) }
    : { coins: issuedCoins, qrImageDataUrl: "data:image/png;base64,aGVsbG8=", expiresAt: Math.floor(Date.now() / 1000) + 86400 } });
  for (const coins of [3000, 0]) {
    issuedCoins = coins;
    await nodes.start.onclick();
    await frames(3800);
    assert.equal(nodes.game.dataset.state, "result");
    assert.equal(nodes["reward-coins"].textContent, coins.toLocaleString("ja-JP"));
    assert.equal(nodes["reward-qr"].hidden, coins === 0);
    if (coins > 0) assert.match(nodes["reward-qr"].src, /^data:image\/png;base64,/);
    nodes["result-home"].onclick();
  }
  handlers.pagehide();
});
