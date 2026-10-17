import { Camera, cameraError } from "./lib/camera.mjs";
import { PoseTracker, poseQuality } from "./lib/pose.mjs";
import { MovementTracker } from "./lib/movement.mjs";
import { GameEngine } from "./lib/engine.mjs";
import { Scene } from "./lib/scene.mjs";
import { readRanking, saveScore, playerName } from "./lib/ranking.mjs";
import { flightFrame, destination } from "./lib/flight.mjs";
import { BonusDetector } from "./lib/bonuses.mjs";
import { Bgm } from "./lib/bgm.mjs";
import { RewardClient } from "./lib/reward-client.mjs";
const $ = (id) => document.getElementById(id);
const bonuses = new BonusDetector();
let bonusUntil = 0,
  missionId = "",
  scoreSaved = false;
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = {
    getItem: () => null,
    setItem: () => {
      throw Error("STORAGE_DISABLED");
    },
  };
}
const engine = new GameEngine(),
  camera = new Camera($("camera")),
  tracker = new PoseTracker(),
  movement = new MovementTracker(),
  scene = new Scene($("world"), $("camera"));
let generation = 0,
  modelReady = false,
  last = performance.now(),
  lastPose = 0,
  lastMotion = { valid: false, score: 0 },
  quality = { detected: false, knees: false },
  previousState = "title",
  torsoStable = 0,
  sound = true,
  audioActivated = false,
  audio = null,
  lastBeep = -1,
  toastUntil = 0;
const screens = [
  "title",
  "setup",
  "hud",
  "countdown",
  "pause-screen",
  "error-screen",
  "launch",
  "result",
  "ranking",
];
const bgm = new Bgm(storage, undefined, () => toast("BGMを再生できません。SOUNDを入れ直してください。"));
let rewardStorage;
try { rewardStorage = window.sessionStorage; } catch {}
const rewards = new RewardClient({ storage: rewardStorage, onChange: renderReward });
$("bgm-mode").value = bgm.mode;
function syncBgm() {
  bgm.sync(sound && audioActivated, document.hidden || engine.state === "error" || (engine.state === "paused" && engine.pauseReason !== "tracking"));
}
function showScreens() {
  syncBgm();
  const state = engine.state;
  for (const id of screens) $(id).hidden = true;
  if (state === "result") $("result").hidden = false;
  if (state === "ranking") $("ranking").hidden = false;
  if (state === "launch") $("launch").hidden = false;
  if (state === "title") $("title").hidden = false;
  if (state === "setup") $("setup").hidden = false;
  if (["charge", "countdown"].includes(state) || (state === "paused" && engine.pauseReason === "tracking")) $("hud").hidden = false;
  if (state === "countdown" || (state === "charge" && engine.elapsed < 0.6))
    $("countdown").hidden = false;
  if (state === "paused" && engine.pauseReason !== "tracking") {
    $("pause-screen").hidden = false;
    $("pause-copy").textContent =
      engine.pauseReason === "tracking"
        ? "プレイヤーを見失いました。カメラに映ってから、つづけよう。"
        : "準備ができたら、つづけよう。";
  }
  if (state === "error") $("error-screen").hidden = false;
  $("game").dataset.state = state;
  $("pause-game").hidden = !(["countdown", "charge"].includes(state) || (state === "paused" && engine.pauseReason === "tracking"));
  $("exit").hidden = !["setup", "countdown", "charge", "paused"].includes(
    state,
  );
}
function clearTracking() {
  bonuses.reset();
  lastPose = 0;
  lastMotion = { valid: false, score: 0 };
  quality = { detected: false, knees: false };
  movement.reset();
  scene.points = null;
  torsoStable = 0;
}
function home() {
  rewards.clear();
  generation++;
  camera.stop();
  tracker.close();
  modelReady = false;
  clearTracking();
  engine.reset();
  showScreens();
}
function fail(message) {
  generation++;
  camera.stop();
  tracker.close();
  modelReady = false;
  clearTracking();
  engine.state = "error";
  $("error-copy").textContent = message;
  showScreens();
}
async function start() {
  rewards.begin();
  const token = ++generation;
  engine.setup();
  clearTracking();
  bonusUntil = 0;
  lastBeep = -1;
  scene.particles = [];
  $("setup-title").textContent = "CAMERA SETUP";
  $("setup-copy").textContent = "カメラへのアクセスを許可してください";
  $("upper-body").hidden = true;
  showScreens();
  unlockAudio();
  try {
    if (!(await camera.start()) || token !== generation) return;
    $("setup-copy").textContent = "骨格認識を準備しています…";
    await tracker.init();
    if (token !== generation) return;
    modelReady = true;
    $("setup-copy").textContent = "少し下がって、頭から膝を映してね";
  } catch (error) {
    if (token !== generation) return;
    fail(
      camera.stream
        ? "骨格認識を起動できません。対応ブラウザで開き直してください。"
        : cameraError(error),
    );
  }
}
tracker.onPose = (points, timestamp) => {
  if (!["setup", "countdown", "charge", "paused"].includes(engine.state))
    return;
  lastPose = performance.now();
  quality = poseQuality(points);
  lastMotion = movement.update(points, timestamp);
  scene.points = quality.detected ? lastMotion.points : null;
  if (engine.state === "charge") {
    if (lastMotion.score > 0.65)
      scene.emit(lastMotion.points, lastMotion.intensity, lastMotion.speeds);
    const events = bonuses.update(lastMotion, engine.elapsed);
    for (const event of events) {
      engine.charge.applyBonus(event, engine.elapsed);
      $("bonus").replaceChildren(document.createTextNode(event.label));
      const detail = document.createElement("small");
      detail.textContent =
        event.key === "full" ? "3 SEC ×1.5" : event.duration ? `+${event.points} / ${event.duration} SEC ×${event.multiplier}` : `+${event.points}`;
      $("bonus").append(detail);
      bonusUntil = performance.now() + (event.key === "full" ? 3000 : event.duration ? event.duration * 1000 : 1100);
      tone(event.key === "full" ? 1100 : 750, 0.16);
    }
  }
};
tracker.onError = () => {
  if (modelReady)
    fail("骨格認識が停止しました。もう一度カメラをつないでください。");
};
camera.onDisconnect = () =>
  fail("カメラの接続が切れました。接続を確認して、もう一度お試しください。");
function unlockAudio() {
  if (!sound) return;
  audioActivated = true;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch {}
  syncBgm();
}
function tone(frequency = 600, duration = 0.1) {
  if (!sound || !audio) return;
  try {
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.connect(g);
    g.connect(audio.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(frequency, audio.currentTime);
    g.gain.setValueAtTime(0.06, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    o.start();
    o.stop(audio.currentTime + duration);
  } catch {}
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  toastUntil = performance.now() + 4000;
}
function tick(now) {
  const dt = Math.max(0, (now - last) / 1000);
  last = now;
  if (
    modelReady &&
    ["setup", "countdown", "charge", "paused"].includes(engine.state)
  )
    tracker.sample($("camera"), now);
  const fresh = now - lastPose < 350;
  const q = fresh ? quality : { detected: false, knees: false };
  const motion = fresh ? lastMotion : { valid: false, score: 0 };
  if (!fresh) scene.points = null;
  engine.step(dt, motion, q);
  if (previousState !== engine.state) {
    if (engine.state === "charge") {
      movement.reset();
      lastMotion = { valid: false, score: 0 };
      tone(900, 0.22);
    }
    if (engine.state === "launch") {
      camera.stop();
      clearTracking();
    }
    if (engine.state === "result") prepareResult();
    showScreens();
    previousState = engine.state;
  }
  if (engine.state === "setup") {
    torsoStable = q.detected ? torsoStable + Math.min(dt, 0.1) : 0;
    if (modelReady) {
      $("setup-title").textContent = q.detected
        ? "PLAYER DETECTED"
        : "FIND YOUR POSITION";
      $("setup-copy").textContent = q.detected
        ? q.knees
          ? "その位置でOK！ まもなくスタート"
          : "そのまま少し下がってください"
        : "カメラの中央に立ってね";
    }
    $("recognition-label").textContent = q.detected
      ? "PLAYER DETECTED"
      : "LOOKING FOR PLAYER";
    $("recognition-fill").style.width =
      `${Math.min(100, (engine.stable / 1.5) * 100)}%`;
    $("upper-body").hidden = !(torsoStable > 1.5 && !q.knees);
  }
  if (["charge", "countdown"].includes(engine.state) || (engine.state === "paused" && engine.pauseReason === "tracking")) {
    $("time").textContent = `00:${String(engine.remaining).padStart(2, "0")}`;
    $("power").textContent = Math.floor(engine.charge.power).toLocaleString(
      "en-US",
    );
    $("combo").textContent = engine.charge.combo;
    $("power-fill").style.width = `${engine.charge.fraction * 100}%`;
    $("power-meter").setAttribute(
      "aria-valuenow",
      Math.floor(engine.charge.power),
    );
    $("game").style.setProperty("--energy", engine.charge.fraction);
    $("multiplier").textContent =
      `×${((1 + Math.min(engine.charge.combo, 40) * 0.01) * engine.charge.getBoost(engine.elapsed).multiplier).toFixed(2)}`;
    $("bonus").style.opacity = now < bonusUntil ? "1" : "0";
    $("tracking-notice").hidden = q.detected || engine.state === "countdown";
    $("tracking-notice").textContent = engine.state === "paused"
      ? "タイマー停止中 — カメラに戻ると自動で再開"
      : "カメラに映ってね — 5秒見失うとタイマー停止";
    $("motion-dot").parentElement.classList.toggle(
      "active",
      motion.score > 0.65,
    );
    $("power-status").textContent =
      engine.charge.power >= 9500
        ? "POWER OVERLOAD!!"
        : engine.charge.getBoost(engine.elapsed).multiplier > 1
          ? `${engine.charge.getBoost(engine.elapsed).label} ×${engine.charge.getBoost(engine.elapsed).multiplier}`
          : [
            "CHARGING SYSTEM",
            "ENERGY RISING",
            "HIGH ENERGY",
            "READY FOR DEEP SPACE",
          ][Math.min(3, engine.charge.tier)];
    $("countdown").hidden = !(
      engine.state === "countdown" || engine.elapsed < 0.6
    );
    $("countdown-number").textContent =
      engine.state === "countdown" ? Math.ceil(engine.countdown) : "GO!";
    $("countdown-label").textContent =
      engine.state === "countdown" ? "READY" : "POWER CHARGE";
    const beat =
      engine.state === "countdown"
        ? Math.ceil(engine.countdown) + 100
        : engine.remaining;
    if (
      beat !== lastBeep &&
      (engine.state === "countdown" || engine.remaining <= 10)
    ) {
      tone(engine.remaining <= 3 ? 850 : 600, 0.12);
      lastBeep = beat;
    }
    $("last-seconds").hidden = !(
      engine.state === "charge" && engine.remaining <= 10
    );
    $("last-seconds").textContent = engine.remaining;
    $("last-seconds").classList.toggle("final", engine.remaining <= 3);
  }
  if (engine.state === "launch") {
    const f = flightFrame(engine.charge.power, engine.launchTime);
    $("launch-label").textContent =
      f.phase === "complete"
        ? "CHARGE COMPLETE"
        : f.phase === "transfer"
          ? "ENERGY TRANSFER..."
          : f.phase === "countdown"
            ? "LAUNCH SEQUENCE"
            : f.phase === "ignition"
              ? "IGNITION"
              : "FLIGHT IN PROGRESS";
    $("launch-power").textContent = Math.floor(
      engine.charge.power,
    ).toLocaleString("en-US");
    $("ignition-count").textContent =
      f.count || (f.phase === "ignition" ? "IGNITION" : "");
    $("flight-caption").textContent =
      f.progress > 0 ? "FLIGHT DISTANCE" : "ENERGY TRANSFER...";
    $("flight-distance").replaceChildren(
      document.createTextNode(f.distance.toLocaleString("en-US") + " "),
    );
    const unit = document.createElement("small");
    unit.textContent = "km";
    $("flight-distance").append(unit);
    $("flight-destination").textContent =
      f.progress > 0.96 ? f.target.name : "TARGET / " + f.target.name;
    $("transfer-fill").style.width = `${(1 - f.transfer) * 100}%`;
    const beat = f.count || (f.phase === "ignition" ? 200 : 0);
    if (beat && beat !== lastBeep) {
      tone(beat === 200 ? 100 : 500, beat === 200 ? 0.7 : 0.15);
      lastBeep = beat;
    }
  }
  scene.draw(engine, now / 1000, Math.min(dt, 0.05));
  if (toastUntil && now > toastUntil) {
    $("toast").hidden = true;
    toastUntil = 0;
  }
  requestAnimationFrame(tick);
}
function renderRanking(id, rows, highlight = "") {
  const list = $(id);
  list.replaceChildren();
  if (!rows.length) {
    const item = document.createElement("li");
    item.className = "empty-message";
    item.textContent = "最初のミッションを記録しよう。";
    list.append(item);
    return;
  }
  for (let i = 0; i < 10; i++) {
    const row = rows[i],
      item = document.createElement("li"),
      name = document.createElement("span"),
      power = document.createElement("b");
    if (row) {
      name.textContent = row.name;
      power.textContent = row.power.toLocaleString("en-US");
      if (row.id === highlight) item.className = "current";
    } else {
      item.className = "empty";
      name.textContent = "—";
      power.textContent = "—";
    }
    item.append(name, power);
    list.append(item);
  }
}
function renderReward(result) {
  $("reward-qr").hidden = true;
  $("reward-qr").removeAttribute("src");
  $("reward-coins").textContent = "—";
  $("reward-expires").textContent = "";
  $("reward-retry").hidden = true;
  $("reward-retry").disabled = result.status === "loading";
  if (result.status === "loading") $("reward-message").textContent = "ユニコインを確認しています…";
  else if (result.status === "error") {
    $("reward-message").textContent = result.message;
    $("reward-retry").hidden = !result.retryable;
  } else {
    $("reward-coins").textContent = result.coins.toLocaleString("ja-JP");
    const expired = result.coins > 0 && result.expiresAt * 1000 <= Date.now();
    $("reward-message").textContent = result.coins === 0 ? "今回は0枚です。QRは発行されません。"
      : expired ? "このQRの有効期限は終了しました。" : "ZERO ARCADEのウォレット → スキャンで受け取る";
    if (result.coins > 0) {
      $("reward-expires").textContent = `有効期限：${new Date(result.expiresAt * 1000).toLocaleString("ja-JP")}`;
      if (!expired) {
        $("reward-qr").src = result.qrImageDataUrl;
        $("reward-qr").hidden = false;
      }
    }
  }
}
$("reward-retry").onclick = () => rewards.retry();
$("reward-qr").onerror = () => renderReward({ status: "error", message: "QR画像を表示できませんでした。再試行してください。", retryable: true });
function prepareResult(restored = false) {
  const target = destination(engine.charge.power);
  missionId = restored ? rewards.snapshot.missionId :
    globalThis.crypto?.randomUUID?.() ||
    String(Date.now()) + "-" + Math.random();
  scoreSaved = false;
  $("result-destination").textContent = target.name;
  $("result-destination").classList.toggle("long", target.name.length > 12);
  $("result-ja").textContent =
    target.ja + (target.name === "BEYOND SOLAR SYSTEM" ? "！" : "に到達！");
  $("result-power").textContent = Math.floor(
    engine.charge.power,
  ).toLocaleString("en-US");
  $("result-rank").textContent = target.rank;
  $("result-distance").textContent = target.distance.toLocaleString("en-US");
  $("player-name").value = "";
  $("player-name").disabled = false;
  $("save-score").disabled = false;
  $("skip-name").disabled = false;
  $("save-message").textContent = "スキップすると「PLAYER」で記録します。";
  renderRanking("result-ranks", readRanking(storage));
  tone(1100, 0.4);
  rewards.finish(Math.floor(engine.charge.power), missionId);
}
function record(name) {
  if (scoreSaved || engine.state !== "result") return;
  const result = saveScore(storage, {
    id: missionId,
    name,
    power: engine.charge.power,
  });
  scoreSaved = true;
  $("player-name").value = playerName(name);
  $("player-name").disabled = true;
  $("save-score").disabled = true;
  $("skip-name").disabled = true;
  $("save-message").textContent = result.saved
    ? result.rank
      ? `記録しました — LOCAL #${result.rank}`
      : "記録完了。TOP10を目指してまた遊ぼう。"
    : "このブラウザでは保存できませんでした。今回の結果は表示できます。";
  renderRanking("result-ranks", result.rows, missionId);
}
$("score-form").onsubmit = (event) => {
  event.preventDefault();
  record($("player-name").value);
};
$("player-name").addEventListener("input", (event) => {
  if (event.isComposing) return;
  if (!$("player-name").value.trim()) return;
  const selection = $("player-name").selectionStart;
  const name = playerName($("player-name").value);
  if (name !== $("player-name").value) {
    $("player-name").value = name;
    $("player-name").setSelectionRange(selection, selection);
  }
});
$("skip-name").onclick = () => record("PLAYER");
$("replay").onclick = start;
$("result-home").onclick = home;
$("show-ranking").onclick = () => {
  renderRanking("title-ranks", readRanking(storage));
  engine.state = "ranking";
  showScreens();
};
$("ranking-back").onclick = home;
$("start").onclick = start;
$("retry").onclick = start;
$("error-back").onclick = home;
$("quit").onclick = home;
$("upper-body").onclick = () => engine.allowUpperBody();
$("pause-game").onclick = () => {
  engine.pause("manual");
  showScreens();
};
$("exit").onclick = () => {
  if (engine.state === "setup") home();
  else if (engine.state === "paused" && engine.pauseReason !== "tracking") home();
  else {
    engine.pause();
    showScreens();
  }
};
$("resume").onclick = () => {
  if (!quality.detected || performance.now() - lastPose > 350) {
    toast("カメラに頭と上半身を映してね");
    return;
  }
  movement.reset();
  lastMotion = { valid: false, score: 0 };
  engine.resume();
  showScreens();
};
$("sound").onclick = () => {
  sound = !sound;
  $("sound").innerHTML = `SOUND <b>${sound ? "ON" : "OFF"}</b>`;
  $("sound").setAttribute("aria-pressed", sound);
  $("sound").setAttribute(
    "aria-label",
    `サウンドを${sound ? "オフ" : "オン"}にする`,
  );
  unlockAudio();
  tone();
  syncBgm();
};
$("bgm-mode").onchange = () => {
  bgm.select($("bgm-mode").value);
  if (!sound) $("sound").onclick();
  else unlockAudio();
};
// Click also covers keyboard activation of buttons; avoid autoplay before a gesture.
document.addEventListener("click", unlockAudio);
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("game").requestFullscreen();
  } catch {
    toast("このブラウザでは全画面表示に対応していません。");
  }
};
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    ["charge", "countdown"].includes(engine.state)
  ) {
    engine.pause();
    showScreens();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (engine.state === "setup") home();
    else engine.pause("hidden");
    showScreens();
  }
  last = performance.now();
  syncBgm();
});
window.addEventListener("pagehide", () => {
  generation++;
  camera.stop();
  tracker.close();
  audio?.close();
  bgm.sync(false);
});
const restoredReward = rewards.restore();
if (restoredReward) {
  engine.charge.power = restoredReward.points;
  engine.state = "result";
  previousState = "result";
  prepareResult(true);
}
showScreens();
requestAnimationFrame(tick);
