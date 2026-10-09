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
          this.onmessage({
            data: { type: "pose", points: p, timestamp: data.timestamp },
          });
        }
      });
    }
    terminate() {}
  };
  await import("../dist/game.js");
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
  nodes.exit.onclick();
  assert.equal(nodes.game.dataset.state, "title");
  handlers.pagehide();
});
