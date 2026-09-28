import { flightFrame } from "./flight.mjs";
import { BONES, visible } from "./pose.mjs";
export class Scene {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.ctx = canvas.getContext("2d");
    this.points = null;
    this.particles = [];
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  resize() {
    const ratio = devicePixelRatio || 1,
      w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    const dpr = Math.min(2, ratio);
    if (
      this.canvas.width !== Math.round(w * dpr) ||
      this.canvas.height !== Math.round(h * dpr)
    ) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
  }
  cameraRect() {
    const w = this.w,
      h = this.h;
    const portrait = h > w * 0.8;
    const setup = this.phase === "setup";
    const box = {
      x: w * (portrait ? 0.05 : setup ? 0.17 : 0.07),
      y: h * (portrait ? 0.25 : 0.2),
      w: w * (portrait ? 0.9 : setup ? 0.66 : 0.62),
      h: h * (portrait ? 0.49 : 0.55),
    };
    const r = (this.video.videoWidth || 640) / (this.video.videoHeight || 480);
    let cw = box.w,
      ch = cw / r;
    if (ch > box.h) {
      ch = box.h;
      cw = ch * r;
    }
    return {
      x: box.x + (box.w - cw) / 2,
      y: box.y + (box.h - ch) / 2,
      w: cw,
      h: ch,
    };
  }
  map(point) {
    const r = this.cameraRect();
    return { x: r.x + (1 - point.x) * r.w, y: r.y + point.y * r.h };
  }
  drawCamera() {
    if (this.video.readyState < 2 || !this.video.srcObject) return;
    const c = this.ctx,
      r = this.cameraRect();
    c.save();
    c.translate(r.x + r.w, r.y);
    c.scale(-1, 1);
    c.globalAlpha = 0.7;
    c.drawImage(this.video, 0, 0, r.w, r.h);
    c.restore();
    const fade = c.createLinearGradient(r.x, 0, r.x + r.w, 0);
    fade.addColorStop(0, "#e8eee9");
    fade.addColorStop(0.15, "#e8eee910");
    fade.addColorStop(0.8, "#e8eee910");
    fade.addColorStop(1, "#e8eee9");
    c.fillStyle = fade;
    c.fillRect(r.x, r.y, r.w, r.h);
    const v = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    v.addColorStop(0, "#e8eee9");
    v.addColorStop(0.12, "#e8eee900");
    v.addColorStop(0.8, "#e8eee900");
    v.addColorStop(1, "#e8eee9");
    c.fillStyle = v;
    c.fillRect(r.x, r.y, r.w, r.h);
  }
  skeleton() {
    if (!this.points) return;
    const c = this.ctx;
    c.save();
    c.lineWidth = Math.max(1.5, this.w / 800);
    c.strokeStyle = "#75f9eac0";
    c.shadowBlur = 8;
    c.shadowColor = "#00cbbc";
    for (const [a, b] of BONES) {
      if (!visible(this.points[a]) || !visible(this.points[b])) continue;
      const p = this.map(this.points[a]),
        q = this.map(this.points[b]);
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(q.x, q.y);
      c.stroke();
    }
    for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      if (!visible(this.points[i])) continue;
      const p = this.map(this.points[i]);
      c.beginPath();
      c.arc(
        p.x,
        p.y,
        [15, 16].includes(i) ? this.w * 0.006 : this.w * 0.0025,
        0,
        Math.PI * 2,
      );
      c.fillStyle = [15, 16].includes(i) ? "#f45a2a" : "#dcfff8";
      c.fill();
    }
    c.restore();
  }
  draw(engine, now, dt) {
    this.resize();
    const c = this.ctx,
      w = this.w,
      h = this.h;
    c.clearRect(0, 0, w, h);
    c.fillStyle = ["setup", "countdown", "charge", "paused"].includes(
      engine.state,
    )
      ? "#e8eee9"
      : "#f1eee5";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#153a4510";
    c.lineWidth = 1;
    for (let x = 0; x < w; x += w / 20) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 0; y < h; y += w / 20) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    if (["setup", "countdown", "charge", "paused"].includes(engine.state)) {
      this.drawCamera();
      this.skeleton();
    }
  }
}

// Procedural game sprites remain crisp on exhibition screens; no image requests during play.
function path(c, points, fill, stroke) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}
function circle(c, x, y, r, color) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}
export function drawRocket(c, x, y, scale, angle, thrust, time) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(scale, scale);
  c.lineWidth = 1.4;
  if (thrust > 0) {
    const flame =
      90 + thrust * 110 + (Math.sin(time * 31) + Math.cos(time * 23)) * 12;
    const glow = c.createRadialGradient(0, 100, 4, 0, 145, 115);
    glow.addColorStop(0, "#ffa14be0");
    glow.addColorStop(1, "#ff771900");
    c.fillStyle = glow;
    c.fillRect(-130, 20, 260, 260);
    path(
      c,
      [
        [-18, 83],
        [-21, 118],
        [-12, 150],
        [-5, flame],
        [4, flame + 23],
        [17, 137],
        [21, 105],
        [18, 83],
      ],
      "#fc7934",
    );
    path(
      c,
      [
        [-11, 85],
        [-12, 124],
        [0, flame * 0.83],
        [11, 125],
        [12, 85],
      ],
      "#ffeeba",
    );
    path(
      c,
      [
        [-5, 85],
        [0, flame * 0.66],
        [6, 85],
      ],
      "#ffffff",
    );
  }
  // Fin silhouettes, nozzle, tapered body and distinct orange nose.
  path(
    c,
    [
      [-25, 24],
      [-58, 69],
      [-58, 102],
      [-20, 76],
    ],
    "#ef542c",
    "#123442",
  );
  path(
    c,
    [
      [25, 24],
      [58, 69],
      [58, 102],
      [20, 76],
    ],
    "#c94025",
    "#123442",
  );
  path(
    c,
    [
      [-19, 70],
      [-23, 89],
      [23, 89],
      [19, 70],
    ],
    "#132e38",
  );
  const body = c.createLinearGradient(-30, 0, 30, 0);
  body.addColorStop(0, "#c3cecb");
  body.addColorStop(0.35, "#fffff3");
  body.addColorStop(0.7, "#f6f3e9");
  body.addColorStop(1, "#99afac");
  c.beginPath();
  c.moveTo(0, -128);
  c.bezierCurveTo(-17, -115, -30, -75, -30, -45);
  c.lineTo(-27, 68);
  c.quadraticCurveTo(0, 82, 27, 68);
  c.lineTo(30, -45);
  c.bezierCurveTo(30, -75, 17, -115, 0, -128);
  c.fillStyle = body;
  c.fill();
  c.strokeStyle = "#153d46";
  c.stroke();
  c.beginPath();
  c.moveTo(0, -128);
  c.bezierCurveTo(-15, -112, -25, -86, -27, -67);
  c.quadraticCurveTo(0, -59, 27, -67);
  c.bezierCurveTo(25, -86, 15, -112, 0, -128);
  c.fillStyle = "#f45a2a";
  c.fill();
  c.stroke();
  c.fillStyle = "#f45a2a";
  c.fillRect(-29, 26, 58, 16);
  c.fillStyle = "#172f3c";
  c.fillRect(-28, 48, 56, 5);
  circle(c, 0, -29, 18, "#173846");
  circle(c, 0, -29, 13, "#77dddb");
  circle(c, -4, -34, 5, "#efffff90");
  path(
    c,
    [
      [0, 25],
      [-5, 70],
      [0, 94],
      [5, 70],
    ],
    "#f26736",
    "#153442",
  );
  c.save();
  c.rotate(Math.PI / 2);
  c.fillStyle = "#264652";
  c.font = "bold 10px monospace";
  c.fillText("PC–01", -5, -10);
  c.restore();
  c.strokeStyle = "#fff9";
  c.beginPath();
  c.moveTo(-19, -58);
  c.lineTo(-19, 20);
  c.stroke();
  c.restore();
}
function planet(c, x, y, r, type) {
  const palettes = {
    moon: ["#efead2", "#8a9f9c"],
    mars: ["#f5a671", "#b14f34"],
    jupiter: ["#eacc95", "#ad714b"],
    earth: ["#7be2d1", "#176b7b"],
  };
  const [light, dark] = palettes[type] || palettes.earth;
  const gradient = c.createRadialGradient(
    x - r * 0.4,
    y - r * 0.4,
    r * 0.05,
    x,
    y,
    r,
  );
  gradient.addColorStop(0, light);
  gradient.addColorStop(1, dark);
  circle(c, x, y, r, gradient);
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.clip();
  if (type === "jupiter") {
    for (let i = -4; i < 5; i++) {
      c.fillStyle = i % 2 ? "#99604770" : "#fff0c060";
      c.beginPath();
      c.ellipse(x, y + i * r * 0.22, r * 1.1, r * 0.09, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#b4603b";
    c.beginPath();
    c.ellipse(
      x + r * 0.32,
      y + r * 0.23,
      r * 0.25,
      r * 0.12,
      -0.1,
      0,
      Math.PI * 2,
    );
    c.fill();
  } else if (type === "earth") {
    path(
      c,
      [
        [x - r * 0.6, y - r * 0.4],
        [x - r * 0.3, y - r * 0.65],
        [x + r * 0.12, y - r * 0.3],
        [x, y],
        [x - r * 0.12, y + r * 0.42],
        [x - r * 0.32, y + r * 0.54],
        [x - r * 0.45, y + r * 0.1],
      ],
      "#91c99b",
    );
    path(
      c,
      [
        [x + r * 0.35, y - r * 0.3],
        [x + r * 0.9, y - r * 0.25],
        [x + r * 0.75, y + r * 0.25],
        [x + r * 0.45, y + r * 0.55],
        [x + r * 0.2, y + r * 0.2],
      ],
      "#aed4a1",
    );
    c.strokeStyle = "#ffffff70";
    c.lineWidth = r * 0.065;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(
        x - r * 0.1,
        y + r * (i * 0.38 - 0.35),
        r * 0.9,
        r * 0.17,
        -0.2,
        Math.PI,
        Math.PI * 1.8,
      );
      c.stroke();
    }
  } else {
    for (let i = 0; i < 11; i++) {
      const px = x + Math.sin(i * 24) * r * 0.72,
        py = y + Math.cos(i * 13) * r * 0.7;
      circle(
        c,
        px,
        py,
        r * (0.05 + (i % 3) * 0.035),
        type === "moon" ? "#6d838440" : "#87462c36",
      );
    }
  }
  c.restore();
  c.strokeStyle = "#fff5";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
}
const baseDraw = Scene.prototype.draw;
Scene.prototype.emit = function (points, intensity, speeds = {}) {
  if (!points || this.reduced) return;
  for (const i of [15, 16, 13, 14, 23, 24, 25, 26]) {
    if (
      !visible(points[i]) ||
      !(speeds[i] > 0.15) ||
      Math.random() > intensity * 0.65
    )
      continue;
    const pos = this.map(points[i]);
    this.particles.push({
      x: pos.x,
      y: pos.y,
      ox: pos.x,
      oy: pos.y,
      age: 0,
      life: 0.6 + Math.random() * 0.5,
      size: 2 + Math.random() * 4,
      bend: (Math.random() - 0.5) * this.h * 0.3,
    });
  }
  if (this.particles.length > 180)
    this.particles.splice(0, this.particles.length - 180);
};
Scene.prototype.drawParticles = function (dt, power) {
  const c = this.ctx,
    w = this.w,
    h = this.h,
    destination = { x: w * 0.81, y: h * 0.51 };
  for (const p of this.particles) {
    p.age += dt;
    const t = Math.min(1, p.age / p.life),
      e = t * t;
    p.x = p.ox + (destination.x - p.ox) * e;
    p.y = p.oy + (destination.y - p.oy) * e + Math.sin(t * Math.PI) * p.bend;
    c.globalAlpha = Math.sin(t * Math.PI);
    circle(
      c,
      p.x,
      p.y,
      p.size * (1 - t * 0.6),
      power > 0.75 ? "#ffad43" : "#12b9bd",
    );
  }
  c.globalAlpha = 1;
  this.particles = this.particles.filter((p) => p.age < p.life);
};
Scene.prototype.draw = function (engine, time, dt) {
  this.phase = engine.state;
  if (["launch", "result"].includes(engine.state)) {
    this.resize();
    this.drawFlight(engine, time);
    return;
  }
  baseDraw.call(this, engine, time, dt);
  const c = this.ctx,
    w = this.w,
    h = this.h,
    title = ["title", "ranking", "error"].includes(engine.state),
    portrait = h > w * 0.8;
  const x = w * (title ? 0.87 : 0.8),
    y = h * (title ? 0.44 : 0.49),
    scale = w / (title ? 1450 : 1150);
  if (title) {
    c.save();
    c.strokeStyle = "#173b4520";
    c.lineWidth = 1;
    c.setLineDash([3, 7]);
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(x, y, h * (0.21 + i * 0.06), 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    c.fillStyle = "#bdd0c82c";
    c.beginPath();
    c.arc(x, y, h * 0.3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#21475230";
    c.beginPath();
    c.moveTo(x, h * 0.16);
    c.lineTo(x, h * 0.78);
    c.stroke();
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.moveTo(w * 0.92, h * (0.22 + i * 0.05));
      c.lineTo(w * 0.93, h * (0.22 + i * 0.05));
      c.stroke();
    }
    c.save();
    c.translate(x, y);
    c.rotate(-0.2);
    c.fillStyle = "#153a4510";
    c.beginPath();
    c.ellipse(10, 155, 95, 14, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  if (!title && engine.charge.power > 2500) {
    const amount = engine.charge.fraction;
    const glow = c.createRadialGradient(x, y, 5, x, y, w * 0.34);
    glow.addColorStop(0, `rgba(0,203,215,${amount * 0.22})`);
    glow.addColorStop(1, "#00cbd700");
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    if (amount > 0.75) {
      c.save();
      c.strokeStyle = `rgba(0,179,185,${amount * 0.5})`;
      c.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc(
          x,
          y,
          h * (0.2 + k * 0.055) + Math.sin(time * 1.2 + k) * 4,
          -1.7,
          0.8,
        );
        c.stroke();
      }
      c.restore();
    }
  }
  if ((!portrait || title) && engine.state !== "setup") {
    drawRocket(
      c,
      x,
      y + (this.reduced ? 0 : Math.sin(time * 1.2) * 4),
      scale,
      title ? -0.14 : 0,
      0,
      time,
    );
    c.strokeStyle = "#163c4540";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - w * 0.07, y + scale * 105);
    c.lineTo(x + w * 0.07, y + scale * 105);
    c.stroke();
    if (!title) {
      c.fillStyle = "#183c46";
      c.font = `700 ${w * 0.009}px monospace`;
      c.textAlign = "center";
      c.fillText("PC—01 / ENERGY RECEIVER", x, y + scale * 128);
      c.textAlign = "start";
    }
  }
  this.drawParticles(dt, engine.charge.fraction);
};
Scene.prototype.drawFlight = function (engine, time) {
  const c = this.ctx,
    w = this.w,
    h = this.h,
    result = engine.state === "result";
  const f = flightFrame(engine.charge.power, result ? 10 : engine.launchTime);
  const sky = Math.max(0, 1 - f.travel / 0.9),
    g = c.createLinearGradient(0, 0, w * 0.5, h);
  g.addColorStop(0, `rgb(${10 + sky * 13},${31 + sky * 32},${41 + sky * 36})`);
  g.addColorStop(1, `rgb(${19 + sky * 20},${54 + sky * 53},${62 + sky * 51})`);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const move = f.travel * h * 1.35;
  for (let i = 0; i < 110; i++) {
    const sx = ((((Math.sin(i * 127.1) * 43758.5453) % 1) + 1) % 1) * w;
    const sy =
      (((i * 73.17 + move * (0.15 + (i % 5) * 0.06)) % (h * 1.1)) + h * 1.1) %
      (h * 1.1);
    const len =
      this.reduced || result
        ? 1
        : Math.max(
            1,
            Math.sin(f.progress * Math.PI) * h * 0.03 * (1 + (i % 3)),
          );
    c.strokeStyle = `rgba(197,247,230,${0.18 + (i % 4) * 0.15})`;
    c.lineWidth = i % 3 === 0 ? 2 : 1;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx, sy + len);
    c.stroke();
  }
  const earthY = h * 1.3 + move;
  if (earthY - h * 0.64 < h * 1.8) {
    planet(c, w * 0.47, earthY, h * 0.64, "earth");
    c.strokeStyle = "#96eee75a";
    c.lineWidth = h * 0.025;
    c.beginPath();
    c.arc(w * 0.47, earthY, h * 0.68, Math.PI, Math.PI * 2);
    c.stroke();
  }
  // Each planet has a fixed world position; the camera scrolls through the same continuous scene.
  const worlds = [
    { at: 2.1, x: 0.23, r: 0.17, type: "moon", name: "MOON" },
    { at: 3.1, x: 0.76, r: 0.22, type: "mars", name: "MARS" },
    { at: 4.1, x: 0.25, r: 0.31, type: "jupiter", name: "JUPITER" },
  ];
  for (const p of worlds) {
    const py = h * 0.45 + (f.travel - p.at) * h * 1.35;
    if (py > -h * 0.5 && py < h * 1.5) {
      planet(c, w * p.x, py, h * p.r, p.type);
      c.fillStyle = "#d9f1e0a0";
      c.font = `${w * 0.01}px monospace`;
      c.fillText(p.name, w * p.x - h * p.r, py + h * p.r + h * 0.045);
    }
  }
  if (f.travel > 4.2) {
    c.save();
    c.strokeStyle = "#a7f2d226";
    c.lineWidth = 1;
    for (let k = 1; k < 8; k++) {
      c.beginPath();
      c.ellipse(
        w * 0.6,
        h * 0.48,
        k * w * 0.105,
        k * h * 0.16,
        -0.3,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
    c.restore();
  }
  if (!result) {
    const flight = f.progress > 0;
    const x =
      w *
      (0.58 +
        f.progress * 0.05 +
        (this.reduced ? 0 : Math.sin(f.progress * 4) * 0.04));
    const y = h * (0.55 - f.progress * 0.19);
    const shake =
      !this.reduced && f.phase === "countdown" ? Math.sin(time * 63) * 2 : 0;
    const scale = (w / (h > w * 0.8 ? 800 : 1150)) * (1 - f.progress * 0.24);
    if (f.phase === "transfer" || f.phase === "countdown") {
      c.save();
      const amount = 1 - f.transfer;
      c.strokeStyle = "#ffba60";
      c.lineWidth = w * 0.003;
      for (let i = 0; i < 5; i++) {
        const startX = w * (0.1 + i * 0.17),
          t = (time * 1.2 + i * 0.2) % 1;
        c.globalAlpha = Math.sin(t * Math.PI);
        c.beginPath();
        c.moveTo(startX + (x - startX) * t, h * 0.88 + (y - h * 0.88) * t);
        c.lineTo(
          startX + (x - startX) * Math.min(1, t + 0.12),
          h * 0.88 + (y - h * 0.88) * Math.min(1, t + 0.12),
        );
        c.stroke();
      }
      c.restore();
    }
    drawRocket(
      c,
      x + shake,
      y,
      scale,
      flight ? 0.12 * Math.sin(f.progress * 3) : 0,
      flight ? 0.8 : 0,
      this.reduced ? 0 : time,
    );
    if (!flight) {
      c.strokeStyle = "#d3e4ce80";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x - w * 0.1, y + scale * 109);
      c.lineTo(x + w * 0.1, y + scale * 109);
      c.stroke();
    }
  } else {
    // A quiet orbit remains behind the result rather than replaying the launch.
    drawRocket(c, w * 0.84, h * 0.31, w / 2200, -0.4, 0, time);
  }
};
