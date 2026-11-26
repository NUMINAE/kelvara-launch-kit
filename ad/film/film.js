// Kelvara launch, 10 s token-launch ad. Pure function of time: window.seek(t) paints frame t.
// 120 bpm, 20 beats (beats.json from audio/score.py). Plan: docs/shotlist.md.
// Concept project by Numinae: an invented brand, every figure simulated.
import * as M from './lib/motion.js';
import * as G from './lib/gl.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rise, shot, grain } from './lib/kit.js';
const { THREE } = G;
const { W, H, FORMAT, E, prog, clamp, lerp, springU, springKeys, SPRING, font, layout, text, rrect, mulberry32 } = M;
const P = FORMAT.portrait;
const C = { bg: '#0b0c0e', bg2: '#111215', ink: '#f2efe8', mut: '#9a9ca1', acc: '#ffb224', accInk: '#141005', line: 'rgba(255,255,255,0.12)' };

// Every accent: [beat, label, sfx, opts]. sfx.mjs voices each one.
const HITS = [
  [0, 'Machines', 'blip', { pitch: 'A5' }], [1, 'pay', 'blip', { pitch: 'C6' }], [2, 'machines.', 'pop', { pitch: 'E6' }],
  [4, 'dive into the node', 'swell', { len: 0.8 }], [4, 'drone', 'thud', { pitch: 70, to: 45 }],
  [4.5, 'tag 1', 'type', { len: 0.45, n: 9 }], [5.5, 'whip to charger', 'whoosh', { len: 0.4, from: 900, to: 3200, pan: 0.3 }],
  [6, 'tag 2', 'type', { len: 0.4, n: 8 }], [7, 'whip to robot', 'whoosh', { len: 0.4, from: 900, to: 3200, pan: -0.3 }],
  [7.5, 'tag 3', 'type', { len: 0.35, n: 7 }], [7.85, 'amber line', 'whoosh', { len: 0.3, from: 3000, to: 700 }],
  [8, 'phone lands', 'thud'], [9, 'tap Pay', 'click'], [10.5, 'tap Approve', 'click'], [11, 'allocated', 'bell', { pitch: 'E6' }],
  [12, 'tap Claim now', 'click'], [12.5, 'tap Claim', 'click'], [13, 'tap Approve', 'click'], [13.5, 'claimed', 'coins'],
  [13.75, 'tile 1', 'tick'], [14, 'tile 2', 'tick'], [14.25, 'tile 3', 'tick'], [14.5, 'tile 4', 'tick'],
  [16, 'end card', 'impact'], [16, 'wordmark', 'bell', { pitch: 'A6' }], [17.5, 'presale pill', 'pop', { pitch: 'E6' }],
];

const IMAGES = {};
for (const n of ['drone', 'charger', 'robot']) IMAGES[n] = `assets/img/${n}-${P ? 'tall' : 'wide'}.png`;
const APP = ['01-buy', '02-approve-pay', '03-progress-pay', '04-receipt-pay', '05-claim', '06-approve-claim', '07-progress-claim', '08-receipt-claim'];
APP.forEach((n) => { IMAGES['app_' + n] = `assets/miniapp/${n}.png`; });
// when each captured Mini App state comes on screen, and where/when each tap lands (assets/miniapp/taps.json)
const APP_AT = [8, 9.15, 10.62, 11, 12.12, 12.62, 13.12, 13.5];
let TAPS = [];
let LAT = null, PHONE = null, IMG = null;

// ---------------------------------------------------------------- background
function bg(ctx, glowX = 0.75, glowY = 0.45, a = 0.07) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * glowX, H * glowY, 0, W * glowX, H * glowY, Math.max(W, H) * 0.6);
  g.addColorStop(0, `rgba(255,178,36,${a})`); g.addColorStop(1, 'rgba(255,178,36,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- S1 the lattice (three.js)
function dotTexture(soft) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(soft, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function latticeSet() {
  const scene = new THREE.Scene(), cam = G.camera(38, 0.05, 100);
  scene.fog = new THREE.Fog(0x0b0c0e, 6.6, 12.2);
  const g = new THREE.Group(); scene.add(g);
  const N = 280, R = 2.6, pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * 2.399963;
    const rad = R * (i % 6 === 0 ? 0.58 : i % 11 === 0 ? 0.8 : 1);
    pts.push(new THREE.Vector3(Math.cos(a) * r * rad, y * rad, Math.sin(a) * r * rad));
  }
  const adj = pts.map(() => []), edges = [];
  pts.forEach((p, i) => {
    pts.map((q, j) => [p.distanceToSquared(q), j]).sort((a, b) => a[0] - b[0]).slice(1, 4).forEach(([, j]) => {
      if (!adj[i].includes(j)) { adj[i].push(j); adj[j].push(i); edges.push([i, j]); }
    });
  });
  const lineMat = new THREE.LineBasicMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.17 });
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges.flatMap(([a, b]) => [pts[a], pts[b]])), lineMat));
  const tex = dotTexture(0.45), glow = dotTexture(0.08);
  const nodeMat = new THREE.PointsMaterial({ color: 0xf2efe8, size: 0.075, map: tex, transparent: true, depthWrite: false });
  g.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), nodeMat));
  const hubIdx = pts.map((_, i) => i).filter((i) => i % 17 === 0);
  const hubMat = new THREE.PointsMaterial({ color: 0xffb224, size: 0.2, map: tex, transparent: true, depthWrite: false });
  g.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(hubIdx.map((i) => pts[i])), hubMat));
  // payments: each pulse walks a seeded path through the graph; position is closed-form in t
  const P_N = 90, rnd = mulberry32(4242);
  const walks = Array.from({ length: P_N }, () => {
    let a = Math.floor(rnd() * N), prev = -1; const w = [a];
    for (let k = 0; k < 60; k++) { const opts = adj[a].filter((n) => n !== prev); const nx = opts.length ? opts[Math.floor(rnd() * opts.length)] : prev; prev = a; a = nx; w.push(a); }
    return { w, v: 0.5 + rnd() * 0.9, ph: rnd() * 3 };
  });
  const layer = (size, opacity) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P_N * 3), 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffb224, size, map: glow, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })));
    return geo.attributes.position;
  };
  const ps = P ? 0.72 : 1;
  const layers = [[layer(0.26 * ps, 0.9), 0], [layer(0.17 * ps, 0.55), 0.1], [layer(0.11 * ps, 0.3), 0.2]];
  const v = new THREE.Vector3();
  const base = P ? new THREE.Vector3(0.1, -1.45, 0) : new THREE.Vector3(2.7, -0.1, 0);
  const scale = P ? 0.56 : 1;
  const target = new THREE.Vector3();
  const pose = (t) => { g.position.copy(base); g.scale.setScalar(scale); g.rotation.set(0.25, t * 0.07 + 0.4, 0); g.updateMatrixWorld(true); };
  // the hub the camera dives into: the one nearest the camera at the dive
  pose(M.TS(3.6));
  let dive = hubIdx[0], best = -1e9;
  hubIdx.forEach((i) => { v.copy(pts[i]).applyMatrix4(g.matrixWorld); const s = v.z - Math.abs(v.x - base.x) * 0.6 - Math.abs(v.y - base.y) * 0.6; if (s > best) { best = s; dive = i; } });
  return {
    scene, camera: cam, bloom: 0.38, bloomThreshold: 0.55, bloomRadius: 0.4,
    hub(t) { pose(t); return target.copy(pts[dive]).applyMatrix4(g.matrixWorld); },
    update(t, u) {
      pose(t);
      // lights come on along a wave on frame 0 (nodes fade up from the first hub outward)
      const on = E.outCubic(prog(u, -0.4, 1.2));
      lineMat.opacity = 0.05 + 0.12 * on; nodeMat.opacity = 0.3 + 0.7 * on;
      for (let i = 0; i < P_N; i++) {
        const p = walks[i], s = Math.max(0, t * p.v + p.ph), k = Math.floor(s) % 60, f = s - Math.floor(s);
        const a = p.w[k], b = p.w[k + 1];
        for (const [attr, lag] of layers) { v.lerpVectors(pts[a], pts[b], Math.max(0, f - lag)); attr.setXYZ(i, v.x, v.y, v.z); }
      }
      layers.forEach(([attr]) => { attr.needsUpdate = true; });
      // camera: slow log-space push, then the dive into the hub (b3.0-4.0)
      const d = 9 * (7.2 / 9) ** prog(u, 0, 3);
      const from = new THREE.Vector3(P ? 0 : 0.4, 0, d);
      const hub = this.hub(t).clone();
      const k = E.inExpo(prog(u, 3.0, 4.0));
      const to = hub.clone().add(new THREE.Vector3(0, 0, 0.18));
      cam.position.lerpVectors(from, to, k);
      const look = new THREE.Vector3(P ? 0 : 0.4, 0, 0).lerp(hub, E.inOutCubic(prog(u, 2.6, 3.6)));
      cam.lookAt(look);
    },
  };
}

function headline(ctx, u) {
  const s = FORMAT.safe, size = FORMAT.pick({ '16x9': 150, '9x16': 156 });
  const x = s.x, y0 = P ? s.y + size * 0.9 : H * 0.5 - size * 0.55;
  const words = [['Machines', 0, C.ink], ['pay', 1, C.ink], ['machines.', 2, C.acc]];
  words.forEach(([w, b, col], i) => {
    rise(ctx, w, x, y0 + i * size * 0.98, u, b - (i === 0 ? 0.3 : 0.1), { size, weight: 800, color: col, track: -0.035, cfg: SPRING.snappy, stagger: 0.022, out: 3.25 + i * 0.06, outLen: 0.4 });
  });
  const a = E.outCubic(prog(u, 2.4, 2.9)) * (1 - prog(u, 3.2, 3.5));
  if (a > 0) {
    ctx.globalAlpha = a;
    text(ctx, 'THE SETTLEMENT NETWORK FOR AUTONOMOUS DEVICES', x, y0 + size * 2.98 + 56, font(P ? 25 : 24, 500, 'UI'), C.mut, 'left', 2);
    ctx.globalAlpha = 1;
  }
}

function sceneLattice(ctx, u, t) {
  bg(ctx, P ? 0.5 : 0.75, P ? 0.66 : 0.45, 0.07 + 0.05 * prog(u, 2.5, 4));
  G.renderSet(ctx, LAT, t, u);
  // the dive: the hub's glow opens into the next shot
  const k = E.inExpo(prog(u, 3.35, 4.0));
  if (k > 0) {
    const p = LAT.hub(t).clone().project(LAT.camera);
    const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H, r = 40 + k * Math.hypot(W, H) * 0.75;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,214,140,${0.9 * k})`); g.addColorStop(0.35, `rgba(255,178,36,${0.75 * k})`); g.addColorStop(1, 'rgba(255,178,36,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  headline(ctx, u);
}

// ---------------------------------------------------------------- S2 machines (Flux 2 stills)
const SHOTS = {
  drone: { wide: { fx: 0.5, fy: 0.62 }, tall: { fx: 0.5, fy: 0.62 }, tag: ['DRONE-12', 'CHARGER-04', '0.42 USDT', '388 ms'] },
  charger: { wide: { fx: 0.42, fy: 0.55 }, tall: { fx: 0.45, fy: 0.55 }, tag: ['VAN-31', 'GATE-07', '1.10 USDT', '402 ms'] },
  robot: { wide: { fx: 0.55, fy: 0.55 }, tall: { fx: 0.62, fy: 0.6 }, tag: ['ROVER-05', 'DOCK-11', '0.08 USDT', '371 ms'] },
};
function still(ctx, name, u, u0, u1, dx = 0) {
  const o = SHOTS[name][P ? 'tall' : 'wide'];
  ctx.save(); ctx.translate(dx, 0);
  if (name === 'drone') {
    // match cut: opens tight on the glowing pad (where the hub landed) and settles out
    const k = springU(u, 4, SPRING.gentle);
    M.cover(ctx, IMG.drone, 0, 0, W, H, { fx: o.fx, fy: lerp(0.78, o.fy, k), zoom: lerp(1.9, 1.1, k) * (1 + 0.04 * prog(u, 4, 5.6)) });
  } else {
    shot(ctx, IMG[name], 0, 0, W, H, u, u0, u1, { z0: 1.06, z1: 1.16, fx: o.fx, fy: o.fy, dx: 0.02 });
  }
  // grade: lift the blacks toward the film's graphite, keep the amber
  ctx.fillStyle = 'rgba(11,12,14,0.18)'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
function tag(ctx, name, u, u0, u1) {
  const [a, b, amt, ms] = SHOTS[name].tag;
  const str = `${a}  →  ${b}   ·   ${amt}   ·   ${ms}`;
  const n = Math.floor(clamp(prog(u, u0, u0 + 0.45)) * str.length);
  if (n <= 0) return;
  const out = E.inCubic(prog(u, u1 - 0.15, u1));
  const sz = FORMAT.pick({ '16x9': 30, '9x16': 30 });
  const f = font(sz, 500, 'UI');
  ctx.font = f;
  const full = ctx.measureText(str).width;
  const padX = 30, h = sz * 2.3, w = full + padX * 2 + 34;
  const s = FORMAT.safe;
  const x = P ? (W - w) / 2 : s.x, y = P ? s.y + s.h - h : H - s.y - h - 10;
  ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(0, out * 30);
  ctx.fillStyle = 'rgba(11,12,14,0.78)'; rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,178,36,0.45)'; ctx.lineWidth = 2; rrect(ctx, x + 1, y + 1, w - 2, h - 2, h / 2 - 1); ctx.stroke();
  ctx.fillStyle = C.acc; ctx.beginPath(); ctx.arc(x + padX + 6, y + h / 2, 7, 0, 7); ctx.fill();
  text(ctx, str.slice(0, n), x + padX + 30, y + h / 2 + sz * 0.36, f, C.ink);
  // the payment itself: a dot runs the pill once the text is typed
  const r = prog(u, u0 + 0.45, u0 + 1.15);
  if (r > 0 && r < 1) {
    const px = x + 20 + (w - 40) * E.inOutCubic(r);
    const g = ctx.createRadialGradient(px, y + h, 0, px, y + h, 26);
    g.addColorStop(0, 'rgba(255,190,70,1)'); g.addColorStop(1, 'rgba(255,178,36,0)');
    ctx.fillStyle = g; ctx.fillRect(px - 30, y + h - 30, 60, 60);
  }
  ctx.restore();
}
function sceneMachines(ctx, u) {
  // drone b4-5.5, whip, charger b5.5-7, whip, robot b7-8 (a whip keeps both shots on screen)
  const w1 = E.inOutCubic(prog(u, 5.3, 5.7)), w2 = E.inOutCubic(prog(u, 6.8, 7.2));
  if (u < 5.7) still(ctx, 'drone', u, 4, 5.7, -w1 * W);
  if (u > 5.3 && u < 7.2) still(ctx, 'charger', u, 5.3, 7.2, (1 - w1) * W - w2 * W);
  if (u > 6.8) still(ctx, 'robot', u, 6.8, 8.2, (1 - w2) * W);
  if (u < 5.45) tag(ctx, 'drone', u, 4.45, 5.4);
  if (u > 5.6 && u < 6.95) tag(ctx, 'charger', u, 5.95, 6.9);
  if (u > 7.1) tag(ctx, 'robot', u, 7.4, 7.95);
  // b7.8-8: the robot's amber band stretches into a line that wipes to the phone
  const k = E.inOutCubic(prog(u, 7.75, 8.0));
  if (k > 0) {
    const y = H * (P ? 0.6 : 0.6), th = lerp(6, H * 1.4, E.inExpo(prog(u, 7.88, 8.0)));
    ctx.fillStyle = C.acc; ctx.fillRect(W / 2 - (W / 2) * k, y - th / 2, W * k, th);
  }
}

// ---------------------------------------------------------------- S3 the Mini App on a phone
function drawScreen(c, w, h, u) {
  let i = 0; APP_AT.forEach((b, k) => { if (u >= b) i = k; });
  c.drawImage(IMG['app_' + APP[i]], 0, 0, w, h);
  const xf = prog(u, APP_AT[i + 1] - 0.12 ?? 99, APP_AT[i + 1] ?? 99);
  if (i + 1 < APP.length && u > APP_AT[i + 1] - 0.12) { c.globalAlpha = xf; c.drawImage(IMG['app_' + APP[i + 1]], 0, 0, w, h); c.globalAlpha = 1; }
  // touch: a fingertip arrives, presses, and leaves a ring
  TAPS.forEach(([b, x, y]) => {
    const pre = prog(u, b - 0.3, b), post = prog(u, b, b + 0.6);
    if (pre <= 0 || post >= 1) return;
    const cx = x * w, cy = y * h;
    if (post === 0) { c.fillStyle = `rgba(255,255,255,${0.32 * E.outCubic(pre)})`; c.beginPath(); c.arc(cx, cy, 44 - 8 * E.inCubic(prog(u, b - 0.08, b)), 0, 7); c.fill(); }
    else { const r = 40 + 70 * E.outCubic(post); c.strokeStyle = `rgba(255,255,255,${0.75 * (1 - post)})`; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke(); }
  });
}
function phoneSet() {
  const scene = new THREE.Scene(), cam = G.camera(30);
  scene.environment = G.ENV;
  G.keyLights(scene, { key: 2.0, rim: 3.2, rimColor: 0xffb224, keyColor: 0xf2efe8, fill: 0.25 });
  const phone = new THREE.Group(); scene.add(phone);
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.78, 1.62, 0.085, 8, 0.11),
    new THREE.MeshPhysicalMaterial({ color: 0x1b1c20, metalness: 0.9, roughness: 0.3, clearcoat: 1, envMapIntensity: 1.1 }));
  phone.add(body);
  const scr = G.canvasTexture(780, 1624);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.5), new THREE.MeshBasicMaterial({ map: scr, toneMapped: false }));
  screen.position.z = 0.0435; phone.add(screen);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.5), new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.07, roughness: 0.05, clearcoat: 1, envMapIntensity: 2 }));
  glass.position.z = 0.044; phone.add(glass);
  return { scene, camera: cam, update(t, u) {
    cam.position.set(0, 0, P ? 5.3 : 4.3); cam.lookAt(0, 0, 0);
    const k = springU(u, 7.6, SPRING.gentle);
    const away = E.inCubic(prog(u, 13.6, 14.05));
    const [px, py] = P ? [0, -0.36] : [0.62, -0.15];
    phone.position.set(px + away * (P ? 0 : 0.4), py + (1 - k) * -2.4 + 0.025 * Math.sin(t * 1.5) - away * 0.3, -away * 3.5);
    phone.rotation.set(-0.06 + (1 - k) * 0.55 + away * 0.5, lerp(-1.2, -0.22, k) + 0.035 * Math.sin(t * 1.1) - away * 0.6, 0.025);
    phone.scale.setScalar(P ? 1.3 : 1.3);
    scr.draw((c, w, h) => drawScreen(c, w, h, u));
  } };
}
function sceneApp(ctx, u, t) {
  bg(ctx, P ? 0.5 : 0.68, P ? 0.62 : 0.5, 0.11);
  // faint lattice of dots behind the phone (the network is still there)
  ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = C.ink;
  const r = mulberry32(17);
  for (let i = 0; i < 90; i++) { const x = r() * W, y = r() * H, s = 1 + r() * 2; ctx.beginPath(); ctx.arc(x + Math.sin(t * 0.3 + i) * 6, y, s, 0, 7); ctx.fill(); }
  ctx.restore();
  G.renderSet(ctx, PHONE, t, u);
  const s = FORMAT.safe, size = FORMAT.pick({ '16x9': 112, '9x16': 92 });
  const x = P ? W / 2 : s.x, y = P ? s.y + size * 0.85 : H * 0.42;
  const al = P ? 'center' : 'left';
  if (u < 14.2) {
    const a = E.outCubic(prog(u, 8.3, 8.8)) * (1 - prog(u, 13.8, 14.1));
    ctx.globalAlpha = a;
    text(ctx, 'IN TELEGRAM  ·  ON TON', x, y - size - 30, font(P ? 32 : 30, 500, 'UI'), C.acc, al, 2);
    ctx.globalAlpha = 1;
    rise(ctx, 'Pay in USDT.', x, y, u, 9, { size, weight: 800, color: C.ink, align: al, track: -0.03, out: 13.75, outLen: 0.35 });
    rise(ctx, 'Claim KVRA.', x, y + size * 1.02, u, 12, { size, weight: 800, color: C.acc, align: al, track: -0.03, out: 13.8, outLen: 0.35 });
  }
}

// ---------------------------------------------------------------- S4 launch figures
function tile(ctx, x, y, w, h, u, u0, k, v, sub, bar, vs) {
  const s = springU(u, u0, SPRING.snappy);
  if (s <= 0.001) return;
  const col = E.inCubic(prog(u, 15.4, 15.8));
  ctx.save();
  const cx = x + w / 2, cy = y + h / 2;
  ctx.translate(lerp(cx, W / 2, col), lerp(cy, H * (P ? 0.4 : 0.42), col) + (1 - s) * 60);
  ctx.scale(lerp(1, 0.05, col), lerp(1, 0.05, col));
  ctx.globalAlpha = Math.min(1, s * 1.4) * (1 - col * 0.6);
  ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = 'rgba(20,21,24,0.9)'; rrect(ctx, 0, 0, w, h, 30); ctx.fill();
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; rrect(ctx, 1, 1, w - 2, h - 2, 29); ctx.stroke();
  const pad = 30;
  text(ctx, k, pad, pad + 22, font(22, 500, 'UI'), C.mut, 'left', 2);
  text(ctx, v, pad, pad + 22 + (P ? 84 : 70), font(vs || (P ? 64 : 46), 500, 'UI'), C.ink, 'left', -1);
  if (bar != null) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; rrect(ctx, pad, h - pad - 40, w - pad * 2, 8, 4); ctx.fill();
    ctx.fillStyle = C.acc; rrect(ctx, pad, h - pad - 40, (w - pad * 2) * bar, 8, 4); ctx.fill();
  }
  text(ctx, sub, pad, h - pad, font(22, 500, 'UI'), bar != null ? C.mut : C.acc, 'left');
  ctx.restore();
}
function sceneFigures(ctx, u, t) {
  bg(ctx, 0.5, 0.45, 0.09);
  const s = FORMAT.safe;
  const roll = E.outCubic(prog(u, 14, 15.2));
  const raised = 18_412_640 * (0.55 + 0.45 * roll) + Math.floor(prog(u, 15.2, 16) * 4) * 250;
  // the countdown ticks with the film's clock: 50d 02h 33m, seconds running down
  const secs = 50 * 86400 + 2 * 3600 + 33 * 60 + 20 - Math.floor(M.TS(u) - M.TS(14));
  const d = Math.floor(secs / 86400), hh = Math.floor((secs % 86400) / 3600), mm = Math.floor((secs % 3600) / 60), ss = secs % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  const tiles = [
    ['RAISED', '$' + Math.round(raised).toLocaleString('en-US'), '73.7% of $25M cap', 0.737 * roll],
    ['PARTICIPANTS', Math.round(48217 * (0.6 + 0.4 * roll)).toLocaleString('en-US'), '+312 today'],
    ['PRESALE PRICE', '0.08 USDT', 'round 2 of 3'],
    ['TOKEN LAUNCH', `${d}d ${p2(hh)}h ${p2(mm)}m ${p2(ss)}s`, '15 Jan 2027 · 12:00 UTC', null, P ? 64 : 37],
  ];
  if (P) {
    const w = (W - 144 - 24) / 2, h = 290, y0 = H * 0.33;
    tiles.forEach((tl, i) => {
      const big = i === 3;
      const x = big ? s.x : s.x + (i % 2) * (w + 24), y = big ? y0 + 2 * (h + 24) : y0 + Math.floor(i / 2) * (h + 24);
      tile(ctx, x, y, big ? W - 144 : w, h, u, 13.75 + i * 0.25, ...tl);
    });
  } else {
    const w = (s.w - 3 * 24) / 4, h = 270, y = H * 0.5 - h / 2 + 40;
    tiles.forEach((tl, i) => tile(ctx, s.x + i * (w + 24), y, w, h, u, 13.75 + i * 0.25, ...tl));
  }
  const a = E.outCubic(prog(u, 13.85, 14.2)) * (1 - prog(u, 15.5, 15.85));
  ctx.globalAlpha = a;
  const hs = FORMAT.pick({ '16x9': 64, '9x16': 72 });
  text(ctx, 'Presale is live.', s.x, P ? H * 0.3 - 10 : H * 0.5 - 135 - 20, font(hs, 800, 'Display'), C.ink, 'left', -2);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- S5 end card
function mark(ctx, cx, cy, sz, u) {
  const k = springU(u, 15.6, SPRING.bouncy);
  const draw = E.outCubic(prog(u, 15.55, 16.0));
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sz / 28, sz / 28); ctx.translate(-14, -14);
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = C.ink;
  // rounded square traced with a dash that grows
  const per = 4 * 26 - 8 * 8 + 2 * Math.PI * 8;
  ctx.setLineDash([per * draw, per]); rrect(ctx, 1, 1, 26, 26, 8); ctx.stroke(); ctx.setLineDash([]);
  [[9, 19, 0], [19, 9, 0.15]].forEach(([x, y, d]) => {
    const s = springU(u, 15.75 + d, SPRING.bouncy);
    if (s <= 0) return;
    ctx.fillStyle = C.acc; ctx.beginPath(); ctx.arc(x, y, 3 * Math.max(0, s), 0, 7); ctx.fill();
  });
  const l = E.outCubic(prog(u, 15.95, 16.25));
  if (l > 0) { ctx.strokeStyle = C.acc; ctx.beginPath(); ctx.moveTo(11, 17); ctx.lineTo(11 + 6 * l, 17 - 6 * l); ctx.stroke(); }
  // a payment runs the line, on every beat
  if (u > 16.8) {
    const q = (u - 16.8) % 1;
    const px = 9 + 10 * E.inOutCubic(q), py = 19 - 10 * E.inOutCubic(q);
    const g = ctx.createRadialGradient(px, py, 0, px, py, 4); g.addColorStop(0, 'rgba(255,230,180,1)'); g.addColorStop(1, 'rgba(255,178,36,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
  }
  ctx.restore();
  return k;
}
function endCard(ctx, u, t) {
  bg(ctx, 0.5, P ? 0.4 : 0.42, 0.12);
  const msz = FORMAT.pick({ '16x9': 150, '9x16': 190 });
  const cy = H * (P ? 0.36 : 0.32);
  mark(ctx, W / 2, cy, msz, u);
  const wy = cy + msz * 0.5 + FORMAT.pick({ '16x9': 150, '9x16': 190 });
  const ws = FORMAT.pick({ '16x9': 120, '9x16': 132 });
  rise(ctx, 'KELVARA', W / 2, wy, u, 15.92, { size: ws, weight: 700, color: C.ink, align: 'center', track: 0.1, stagger: 0.03 });
  // pill: Presale live · Open in Telegram
  const ps = springU(u, 17.5, SPRING.bouncy);
  if (ps > 0.001) {
    const f = font(FORMAT.pick({ '16x9': 38, '9x16': 42 }), 600, 'Display');
    ctx.font = f;
    const label = 'Presale live  ·  Open in Telegram';
    const tw = ctx.measureText(label).width, ph = FORMAT.pick({ '16x9': 88, '9x16': 98 }), pw = tw + 120;
    const py = wy + FORMAT.pick({ '16x9': 70, '9x16': 90 });
    ctx.save(); ctx.translate(W / 2, py + ph / 2); ctx.scale(ps, ps); ctx.translate(-pw / 2, -ph / 2);
    ctx.fillStyle = C.acc; rrect(ctx, 0, 0, pw, ph, ph / 2); ctx.fill();
    const blink = 0.5 + 0.5 * Math.cos(M.TAU * (u - 17.5) / 1);
    ctx.fillStyle = `rgba(20,16,5,${0.45 + 0.55 * blink})`; ctx.beginPath(); ctx.arc(52, ph / 2, 9, 0, 7); ctx.fill();
    text(ctx, label, 76, ph / 2 + 13, f, C.accInk, 'left');
    ctx.restore();
  }
  const a = E.outCubic(prog(u, 17.75, 18.25));
  if (a > 0) {
    ctx.globalAlpha = a;
    const ly = wy + FORMAT.pick({ '16x9': 230, '9x16': 270 });
    text(ctx, 't.me/KelvaraLaunchBot', W / 2, ly, font(FORMAT.pick({ '16x9': 34, '9x16': 38 }), 500, 'UI'), C.ink, 'center');
    ctx.globalAlpha = a * 0.9;
    text(ctx, 'Concept project by Numinae  ·  not a real token', W / 2, ly + 58, font(FORMAT.pick({ '16x9': 24, '9x16': 26 }), 500, 'UI'), C.mut, 'center');
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- film
M.film({
  fonts: [font(100, 800, 'Display'), font(100, 700, 'Display'), font(100, 600, 'Display'), font(40, 500, 'UI')],
  images: IMAGES,
  hits: HITS,
  // motion blur sub-frames: more on whips, fewer where 3-D is expensive
  samples: (t) => { const u = M.U(t); return u > 13.9 && u < 15.5 ? 1 : (u > 5.2 && u < 5.8) || (u > 6.7 && u < 7.3) || (u > 7.7 && u < 8.1) ? 8 : u < 4 || (u > 7.9 && u < 14.4) ? 3 : 4; },
  async init(ctx, images) {
    IMG = images;
    await G.initGL({ exposure: 1.0 });
    LAT = latticeSet(); PHONE = phoneSet();
    const tp = await fetch('assets/miniapp/taps.json').then((r) => r.json());
    TAPS = [[9, tp.pay.x, tp.pay.y], [10.5, tp.approvePay.x, tp.approvePay.y], [12, tp.claimNow.x, tp.claimNow.y], [12.5, tp.claim.x, tp.claim.y], [13, tp.approveClaim.x, tp.approveClaim.y]];
  },
  draw(ctx, u, t) {
    if (u < 4) sceneLattice(ctx, u, t);
    else if (u < 8) sceneMachines(ctx, u);
    else if (u < 13.85) sceneApp(ctx, u, t);
    else if (u < 16) { sceneFigures(ctx, u, t); if (u > 15.5) mark(ctx, W / 2, H * (P ? 0.36 : 0.32), FORMAT.pick({ '16x9': 150, '9x16': 190 }), u); }
    else endCard(ctx, u, t);
    // 14.0-14.35: the phone pulls away while the figures arrive
    if (u >= 13.85 && u < 14.05) G.renderSet(ctx, PHONE, t, u, { alpha: 1 - E.outCubic(prog(u, 13.85, 14.05)) });
  },
  post(ctx, u, t) { grain(ctx, t, 0.035, 0.32); },
});
