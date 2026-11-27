// Kelvara launch, 10 s token-launch ad. Pure function of time: window.seek(t) paints frame t.
// 120 bpm, 20 beats (beats.json from audio/score.py). Plan: docs/shotlist.md.
// Concept project by Numinae: an invented brand, every figure simulated.
import * as M from './lib/motion.js';
import * as G from './lib/gl.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rise, shot, grain } from './lib/kit.js';
const { THREE } = G;
const { W, H, FORMAT, E, prog, clamp, lerp, springU, springKeys, font, layout, text, rrect, mulberry32 } = M;
// Calmer than the shared presets: every entrance takes about twice as long to settle.
const SPRING = { snappy: { stiffness: 60, damping: 14 }, bouncy: { stiffness: 60, damping: 9 }, gentle: { stiffness: 30, damping: 11 }, wobbly: { stiffness: 45, damping: 5 } };
const P = FORMAT.portrait;
const C = { bg: '#0b0c0e', bg2: '#111215', ink: '#f2efe8', mut: '#9a9ca1', acc: '#ffb224', accInk: '#141005', line: 'rgba(255,255,255,0.12)' };

// Every accent: [beat, label, sfx, opts]. sfx.mjs voices each one.
// [beat, label, sfx, opts]. Beats are plan beats (u); entries with { film: true } are already film beats (uf).
const HITS = [
  [0, 'Machines', 'blip', { pitch: 'A5' }], [1, 'pay', 'blip', { pitch: 'C6' }], [2, 'machines.', 'pop', { pitch: 'E6' }],
  [4, 'dive into the node', 'swell', { len: 0.8 }], [4, 'drone', 'thud', { pitch: 70, to: 45 }],
  [4.1, 'card 1', 'pop', { pitch: 'E6' }], [5.0, 'whip to charger', 'whoosh', { len: 0.5, from: 900, to: 3200, pan: 0.3 }],
  [5.5, 'card 2', 'pop', { pitch: 'A6' }], [6.35, 'whip to robot', 'whoosh', { len: 0.5, from: 900, to: 3200, pan: -0.3 }],
  [6.9, 'card 3', 'pop', { pitch: 'C6' }],
  [12.75, 'phone lands', 'thud', { film: true }], [13.5, 'tap Join', 'click', { film: true }],
  [13.6, 'Mini App slides up', 'whoosh', { len: 0.4, from: 2500, to: 700, film: true }],
  [15.25, 'tap Pay', 'click', { film: true }], [16.1, 'tap Approve', 'click', { film: true }], [16.7, 'allocated', 'bell', { pitch: 'E6', film: true }],
  [17.5, 'tap Claim now', 'click', { film: true }], [18.25, 'tap Claim', 'click', { film: true }], [19, 'tap Approve', 'click', { film: true }],
  [19.6, 'claimed', 'coins', { film: true }],
  [13.75, 'tile 1', 'tick'], [14, 'tile 2', 'tick'], [14.25, 'tile 3', 'tick'], [14.5, 'tile 4', 'tick'],
  [16, 'end card', 'impact'], [16, 'wordmark', 'bell', { pitch: 'A6' }], [17.5, 'presale pill', 'pop', { pitch: 'E6' }],
];

const IMAGES = {};
for (const n of ['drone', 'charger', 'robot']) IMAGES[n] = `assets/img/${n}-${P ? 'tall' : 'wide'}.png`;
const APP = ['01-buy', '02-approve-pay', '03-progress-pay', '04-receipt-pay', '05-claim', '06-approve-claim', '07-progress-claim', '08-receipt-claim'];
APP.forEach((n) => { IMAGES['app3_' + n] = `assets/miniapp4/${n}.png`; });
IMAGES.chat = 'assets/chat/chat.png';
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
      const k = E.inOutCubic(prog(u, 2.7, 4.0));
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
    rise(ctx, w, x, y0 + i * size * 0.98, u, b - (i === 0 ? 0.3 : 0.1), { size, weight: 800, color: col, track: -0.035, cfg: SPRING.snappy, stagger: 0.045, out: 3.0 + i * 0.1, outLen: 0.75 });
  });
  const a = E.outCubic(prog(u, 1.9, 2.3)) * (1 - prog(u, 3.1, 3.6));
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
  const k = E.inCubic(prog(u, 3.1, 4.0));
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
    const k = springU(u, 3.9, SPRING.gentle);
    M.cover(ctx, IMG.drone, 0, 0, W, H, { fx: o.fx, fy: lerp(0.78, o.fy, k), zoom: lerp(1.9, 1.1, k) * (1 + 0.04 * prog(u, 4, 5.6)) });
  } else {
    shot(ctx, IMG[name], 0, 0, W, H, u, u0, u1, { z0: 1.06, z1: 1.16, fx: o.fx, fy: o.fy, dx: 0.02 });
  }
  // grade: lift the blacks toward the film's graphite, keep the amber
  ctx.fillStyle = 'rgba(11,12,14,0.18)'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
// Where each machine's own amber light sits in its still (0..1), for the card's leader line.
const LIGHT = {
  drone: { wide: [0.512, 0.403], tall: [0.528, 0.377] },
  charger: { wide: [0.445, 0.5], tall: [0.53, 0.45] },
  robot: { wide: [0.53, 0.57], tall: [0.58, 0.62] },
};
const CARD = {
  drone: { from: 'DRONE-12', to: 'CHARGER-04', amt: '0.42 USDT', ms: '388 ms', side: 1 },
  charger: { from: 'VAN-31', to: 'GATE-07', amt: '1.10 USDT', ms: '402 ms', side: 1 },
  robot: { from: 'ROVER-05', to: 'DOCK-11', amt: '0.08 USDT', ms: '371 ms', side: -1 },
};
// screen position of a point in a cover-fitted still (same maths as M.cover)
function coverPoint(img, fx, fy, zoom, nx, ny, dx = 0) {
  const sc = Math.max(W / img.width, H / img.height) * zoom, dw = img.width * sc, dh = img.height * sc;
  return [dx + (W - dw) * fx + nx * dw, (H - dh) * fy + ny * dh];
}
// A payment card tied to the machine by a leader line. It arrives whole (no typing) and holds.
function payCard(ctx, name, u, u0, u1, anchor) {
  const k = springU(u, u0, SPRING.snappy);
  if (k <= 0.001) return;
  const out = E.inOutCubic(prog(u, u1 - 0.3, u1));
  const c = CARD[name];
  const [ax, ay] = anchor;
  const cw = FORMAT.pick({ '16x9': 640, '9x16': 760 }), ch = FORMAT.pick({ '16x9': 236, '9x16': 256 });
  const s = FORMAT.safe;
  let cx, cy;
  if (P) { cx = (W - cw) / 2; cy = s.y + s.h - ch - 40; }
  else { cx = c.side > 0 ? Math.min(ax + 170, W - s.x - cw) : Math.max(ax - 170 - cw, s.x); cy = clamp(ay - ch - 90, s.y + 20, H - s.y - ch); }
  ctx.save();
  ctx.globalAlpha = 1 - out;
  // anchor ring and leader line, drawn from the light outward
  const pulse = (u - u0) % 1;
  ctx.strokeStyle = C.acc; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(ax, ay, 16, 0, 7); ctx.stroke();
  ctx.globalAlpha = (1 - out) * (1 - pulse);
  ctx.beginPath(); ctx.arc(ax, ay, 16 + 34 * E.outCubic(pulse), 0, 7); ctx.stroke();
  ctx.globalAlpha = 1 - out;
  ctx.fillStyle = C.acc; ctx.beginPath(); ctx.arc(ax, ay, 6, 0, 7); ctx.fill();
  const ex = P ? W / 2 : (c.side > 0 ? cx : cx + cw), ey = P ? cy : cy + ch / 2;
  const lk = E.outCubic(clamp(k * 1.2));
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lerp(ax, ex, lk), lerp(ay, ey, lk)); ctx.stroke();
  // the card
  ctx.translate(0, (1 - k) * 40);
  ctx.globalAlpha = (1 - out) * Math.min(1, k * 1.5);
  ctx.fillStyle = 'rgba(11,12,14,0.86)'; rrect(ctx, cx, cy, cw, ch, 30); ctx.fill();
  ctx.strokeStyle = 'rgba(255,178,36,0.5)'; ctx.lineWidth = 2; rrect(ctx, cx + 1, cy + 1, cw - 2, ch - 2, 29); ctx.stroke();
  const px = cx + 36;
  text(ctx, `${c.from}  →  ${c.to}`, px, cy + 58, font(P ? 30 : 28, 500, 'UI'), C.mut, 'left', 1);
  text(ctx, c.amt, px, cy + 58 + (P ? 96 : 88), font(P ? 92 : 84, 800, 'Display'), C.acc, 'left', -2);
  ctx.fillStyle = C.acc; ctx.beginPath(); ctx.arc(px + 8, cy + ch - 42, 7, 0, 7); ctx.fill();
  text(ctx, `paid and settled in ${c.ms}`, px + 28, cy + ch - 32, font(P ? 30 : 28, 500, 'UI'), C.ink, 'left', 0);
  ctx.restore();
}
function cardFor(ctx, name, u, u0, u1, dx) {
  const o = SHOTS[name][P ? 'tall' : 'wide'];
  const [nx, ny] = LIGHT[name][P ? 'tall' : 'wide'];
  // the still's push at this moment (matches still())
  let zoom, fy = o.fy;
  const p = name === 'drone' ? 0 : clamp((u - (name === 'charger' ? 5.0 : 6.35)) / ((name === 'charger' ? 7.05 : 8.2) - (name === 'charger' ? 5.0 : 6.35)));
  if (name === 'drone') { const k = springU(u, 3.9, SPRING.gentle); fy = lerp(0.78, o.fy, k); zoom = lerp(1.9, 1.1, k) * (1 + 0.04 * prog(u, 4, 5.6)); }
  else { zoom = 1.06 * (1.16 / 1.06) ** p; }
  const fx = name === 'drone' ? o.fx : clamp(o.fx + 0.02 * p);
  payCard(ctx, name, u, u0, u1, coverPoint(IMG[name], fx, fy, zoom, nx, ny, dx));
}
function sceneMachines(ctx, u) {
  // drone b4-5.5, whip, charger b5.5-7, whip, robot b7-8 (a whip keeps both shots on screen)
  const w1 = E.inOutCubic(prog(u, 5.0, 5.7)), w2 = E.inOutCubic(prog(u, 6.35, 7.05));
  if (u < 5.7) still(ctx, 'drone', u, 4, 5.7, -w1 * W);
  if (u > 5.0 && u < 7.05) still(ctx, 'charger', u, 5.0, 7.05, (1 - w1) * W - w2 * W);
  if (u > 6.35) still(ctx, 'robot', u, 6.35, 8.2, (1 - w2) * W);
  if (u < 5.5) cardFor(ctx, 'drone', u, 4.1, 5.45, -w1 * W);
  if (u > 5.45 && u < 6.8) cardFor(ctx, 'charger', u, 5.5, 6.75, (1 - w1) * W - w2 * W);
  if (u > 6.85) cardFor(ctx, 'robot', u, 6.9, 7.9, (1 - w2) * W);
  // b7.8-8: the robot's amber band stretches into a line that wipes to the phone
  const k = E.inOutCubic(prog(u, 7.55, 8.0));
  if (k > 0) {
    const y = H * (P ? 0.6 : 0.6), th = lerp(6, H * 1.4, E.inCubic(prog(u, 7.78, 8.0)));
    ctx.fillStyle = C.acc; ctx.fillRect(W / 2 - (W / 2) * k, y - th / 2, W * k, th);
  }
}

// ---------------------------------------------------------------- S3 the Mini App on a phone
function drawScreen(c, w, h, u) {
  let i = 0; APP_AT.forEach((b, k) => { if (u >= b) i = k; });
  c.drawImage(IMG['app_' + APP[i]], 0, 0, w, h);
  const xf = E.inOutCubic(prog(u, APP_AT[i + 1] - 0.2, APP_AT[i + 1]));
  if (i + 1 < APP.length && u > APP_AT[i + 1] - 0.2) { c.globalAlpha = xf; c.drawImage(IMG['app_' + APP[i + 1]], 0, 0, w, h); c.globalAlpha = 1; }
  // touch: a fingertip arrives, presses, and leaves a ring
  TAPS.forEach(([b, x, y]) => {
    const pre = prog(u, b - 0.45, b), post = prog(u, b, b + 0.8);
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
    const k = springU(u, 7.15, SPRING.gentle);
    const away = E.inOutCubic(prog(u, 13.45, 14.05));
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
    const a = E.outCubic(prog(u, 8.2, 9.0)) * (1 - prog(u, 13.4, 13.9));
    ctx.globalAlpha = a;
    text(ctx, 'IN TELEGRAM  ·  ON TON', x, y - size - 30, font(P ? 32 : 30, 500, 'UI'), C.acc, al, 2);
    ctx.globalAlpha = 1;
    rise(ctx, 'Pay in USDT.', x, y, u, 8.75, { size, weight: 800, color: C.ink, align: al, track: -0.03, stagger: 0.04, out: 13.4, outLen: 0.6, cfg: SPRING.snappy });
    rise(ctx, 'Claim KVRA.', x, y + size * 1.02, u, 11.75, { size, weight: 800, color: C.acc, align: al, track: -0.03, stagger: 0.04, out: 13.45, outLen: 0.6, cfg: SPRING.snappy });
  }
}


// ---------------------------------------------------------------- S3 the Mini App, inside Telegram (2-D, flat-on phone)
// Keyed to FILM beats (uf). The screen shows the real Mini App, captured in presentation mode (?present=1),
// after the Kelvara bot's chat. Taps land where the real buttons are (assets/miniapp4/taps.json).
const SCR = [['chat', 12.5], ['01-buy', 14.25], ['02-approve-pay', 15.4], ['03-progress-pay', 16.2], ['04-receipt-pay', 16.7],
  ['05-claim', 17.65], ['06-approve-claim', 18.4], ['07-progress-claim', 19.1], ['08-receipt-claim', 19.6]];
let TAPS2 = [];
const STEPS = [['Open the bot', 't.me/KelvaraLaunchBot', 12.5], ['Pay in USDT', '250 USDT  →  3,125 KVRA', 14.25], ['Claim KVRA', 'minted to your wallet', 17.5]];
// iPhone-style handset, drawn flat-on: titanium band, thin even black border, Dynamic Island, iOS status bar.
const PB = () => (P ? 24 : 19);               // frame + border per side
function phoneBox() {
  const B = PB();
  if (P) { const h = 1240, w = h * 0.48 + 2 * B; return { x: (W - w) / 2, y: 520, w, h: h + 2 * B }; }
  const h = 930, w = h * 0.48 + 2 * B; return { x: 1330 - w / 2, y: 74, w, h: h + 2 * B };
}
function tgHeader(c, x, y, w, hh) {
  c.fillStyle = '#15161a'; c.fillRect(x, y, w, hh);
  c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x, y + hh - 1, w, 1);
  const fs = hh * 0.36;
  text(c, 'Close', x + hh * 0.42, y + hh * 0.62, `500 ${fs}px system-ui, sans-serif`, '#ffb224', 'left');
  text(c, 'Kelvara', x + w / 2, y + hh * 0.62, `600 ${fs * 1.05}px system-ui, sans-serif`, '#f2efe8', 'center');
  c.fillStyle = '#9a9ca1'; [-1, 0, 1].forEach((d) => { c.beginPath(); c.arc(x + w - hh * 0.6 + d * fs * 0.42, y + hh * 0.5, fs * 0.09, 0, 7); c.fill(); });
}
function screenAt(c, x, y, w, h, uf) {
  let i = 0; SCR.forEach(([, b], k) => { if (uf >= b) i = k; });
  const sb = h * 0.062;   // iOS status bar
  const hh = h * 0.058;   // Telegram's Mini App header
  const ay = y + sb + hh, ah = h - sb - hh;
  const fit = () => ({ dx: x, dw: w, dh: ah });   // captured at exactly this viewport (390 x 715)
  const app = (name, alpha = 1, dy = 0) => {
    const im = IMG['app3_' + name];
    c.save(); c.globalAlpha = alpha; c.translate(0, dy);
    c.drawImage(im, x, ay, w, ah);
    tgHeader(c, x, y + sb, w, hh);
    c.restore();
  };
  if (uf < 14.3) c.drawImage(IMG.chat, x, y, w, h);
  if (uf >= 13.6 && i <= 1) {
    const e = E.inOutCubic(prog(uf, 13.6, 14.25));
    c.save(); c.fillStyle = `rgba(0,0,0,${0.45 * e})`; c.fillRect(x, y, w, h); c.restore();
    c.save(); c.beginPath(); c.roundRect(x, y + sb + (1 - e) * (h - sb), w, h, [w * 0.05, w * 0.05, 0, 0]); c.clip();
    app('01-buy', 1, (1 - e) * (h - sb)); c.restore();
  } else if (i >= 1) {
    app(SCR[i][0]);
    const nx = SCR[i + 1];
    if (nx) { const k = E.inOutCubic(prog(uf, nx[1] - 0.18, nx[1])); if (k > 0) app(nx[0], k); }
  }
  // status bar sits on Telegram's dark header colour
  if (i >= 1 || uf >= 14.25) { c.fillStyle = '#15161a'; c.fillRect(x, y, w, sb); }
  statusBar(c, x, y, w, sb);
  // touches: a fingertip arrives, presses, leaves a ring
  TAPS2.forEach(([b, tx, ty, onChat]) => {
    const rb = FAST(b), pre = prog(RNOW, rb - 0.9, rb), post = prog(RNOW, rb, rb + 0.8);
    if (pre <= 0 || post >= 1) return;
    const f = fit();
    const px = onChat ? x + tx * w : f.dx + tx * f.dw, py = onChat ? y + ty * h : ay + ty * f.dh;
    const r0 = w * 0.06;
    if (post === 0) { c.fillStyle = `rgba(255,255,255,${0.35 * E.outCubic(pre)})`; c.beginPath(); c.arc(px, py, r0 * (1 - 0.18 * E.inCubic(prog(RNOW, rb - 0.2, rb))), 0, 7); c.fill(); }
    else { c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - post)})`; c.lineWidth = w * 0.008; c.beginPath(); c.arc(px, py, r0 + w * 0.09 * E.outCubic(post), 0, 7); c.stroke(); }
  });
  // home indicator
  c.fillStyle = 'rgba(255,255,255,0.86)'; rrect(c, x + w * 0.32, y + h - h * 0.014, w * 0.36, h * 0.0062, h * 0.0031); c.fill();
}
function statusBar(c, x, y, w, sb) {
  const cy = y + sb * 0.56, ink = '#f5f5f7', fs = sb * 0.36;
  text(c, '9:41', x + w * 0.155, cy + fs * 0.36, `600 ${fs}px "DM Sans", system-ui, sans-serif`, ink, 'center');
  const s = fs / 20; let rx = x + w * 0.9;
  // battery
  c.save(); c.strokeStyle = 'rgba(245,245,247,0.45)'; c.lineWidth = 1.3 * s;
  rrect(c, rx - 26 * s, cy - 6.5 * s, 25 * s, 13 * s, 4 * s); c.stroke();
  c.fillStyle = ink; rrect(c, rx - 24 * s, cy - 4.5 * s, 21 * s * 0.82, 9 * s, 2.4 * s); c.fill();
  c.fillStyle = 'rgba(245,245,247,0.45)'; rrect(c, rx + 0.5 * s, cy - 2.5 * s, 2 * s, 5 * s, 1 * s); c.fill();
  rx -= 34 * s;
  // wi-fi
  c.strokeStyle = ink; c.lineCap = 'round'; c.lineWidth = 2.1 * s;
  const wy = cy + 5.5 * s;
  [11, 7.2].forEach((r) => { c.beginPath(); c.arc(rx - 8 * s, wy, r * s, -Math.PI * 0.76, -Math.PI * 0.24); c.stroke(); });
  c.fillStyle = ink; c.beginPath(); c.moveTo(rx - 8 * s, wy + 0.5 * s); c.arc(rx - 8 * s, wy, 3.6 * s, -Math.PI * 0.76, -Math.PI * 0.24); c.closePath(); c.fill();
  rx -= 25 * s;
  // signal
  [4, 6.5, 9, 11.5].forEach((bh, k) => { rrect(c, rx - 18 * s + k * 4.8 * s, cy + 5.5 * s - bh * s, 3.2 * s, bh * s, 1 * s); c.fill(); });
  c.restore();
}
function metal(ctx, x0, x1, base) {
  // brushed titanium across the band: bright chamfers, darker flats
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, base[0]); g.addColorStop(0.04, base[2]); g.addColorStop(0.1, base[1]); g.addColorStop(0.5, base[0]);
  g.addColorStop(0.9, base[1]); g.addColorStop(0.96, base[2]); g.addColorStop(1, base[0]);
  return g;
}
const TI = ['#2b2c30', '#3d3e43', '#8c8d93'];   // black titanium: flat, mid, chamfer highlight
function drawPhone(ctx, uf, t, box) {
  const { x, y, w, h } = box, B = PB(), F = B * 0.34;          // F = metal band, the rest is black border
  const sx = x + B, sy = y + B, sw = w - 2 * B, sh = h - 2 * B;
  const SR = sw * 0.14, R = SR + B;
  // shadow
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 110; ctx.shadowOffsetY = 50;
  ctx.fillStyle = '#0a0a0c'; rrect(ctx, x, y, w, h, R); ctx.fill(); ctx.restore();
  // buttons (behind the band): action + volume on the left, side button on the right
  const btn = (bx, by, bw, bh) => { ctx.fillStyle = metal(ctx, bx, bx + bw, TI); rrect(ctx, bx, by, bw, bh, bw * 0.45); ctx.fill(); };
  const bt = B * 0.32;
  btn(x - bt, y + h * 0.15, bt + 4, h * 0.042);
  btn(x - bt, y + h * 0.225, bt + 4, h * 0.075);
  btn(x - bt, y + h * 0.315, bt + 4, h * 0.075);
  btn(x + w - 4, y + h * 0.245, bt + 4, h * 0.11);
  // titanium band
  ctx.fillStyle = metal(ctx, x, x + w, TI); rrect(ctx, x, y, w, h, R); ctx.fill();
  const v = ctx.createLinearGradient(0, y, 0, y + h);
  v.addColorStop(0, 'rgba(255,255,255,0.18)'); v.addColorStop(0.12, 'rgba(255,255,255,0)'); v.addColorStop(0.88, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v; rrect(ctx, x, y, w, h, R); ctx.fill();
  // outer chamfer catches the light
  ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,0.38)'; rrect(ctx, x + 0.8, y + 0.8, w - 1.6, h - 1.6, R - 0.8); ctx.stroke();
  // antenna lines
  ctx.fillStyle = 'rgba(12,12,14,0.85)';
  [[x + R * 0.55, y, 3, F + 1], [x + w - R * 0.55 - 3, y, 3, F + 1], [x + R * 0.55, y + h - F - 1, 3, F + 1], [x + w - R * 0.55 - 3, y + h - F - 1, 3, F + 1],
    [x, y + h * 0.085, F + 1, 3], [x + w - F - 1, y + h * 0.085, F + 1, 3]].forEach(([ax, ay, aw, ah]) => ctx.fillRect(ax, ay, aw, ah));
  // inner chamfer, then the black glass border
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.2; rrect(ctx, x + F, y + F, w - 2 * F, h - 2 * F, R - F); ctx.stroke();
  ctx.fillStyle = '#030304'; rrect(ctx, x + F + 0.8, y + F + 0.8, w - 2 * F - 1.6, h - 2 * F - 1.6, R - F); ctx.fill();
  // screen
  ctx.save(); rrect(ctx, sx, sy, sw, sh, SR); ctx.clip();
  screenAt(ctx, sx, sy, sw, sh, uf);
  // Dynamic Island
  const iw = sw * 0.315, ih = sh * 0.04, ix = sx + (sw - iw) / 2, iy = sy + sh * 0.0135;
  ctx.fillStyle = '#000'; rrect(ctx, ix, iy, iw, ih, ih / 2); ctx.fill();
  const lx = ix + iw - ih * 0.62, ly = iy + ih / 2;
  const lg = ctx.createRadialGradient(lx - ih * 0.06, ly - ih * 0.06, 0, lx, ly, ih * 0.24);
  lg.addColorStop(0, '#2a3347'); lg.addColorStop(0.5, '#0c0f16'); lg.addColorStop(1, '#000');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, ih * 0.24, 0, 7); ctx.fill();
  // glass: one soft diagonal reflection
  const gl = ctx.createLinearGradient(sx, sy, sx + sw * 0.9, sy + sh * 0.6);
  gl.addColorStop(0, 'rgba(255,255,255,0.07)'); gl.addColorStop(0.32, 'rgba(255,255,255,0.025)'); gl.addColorStop(0.33, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();
  // warm rim light from the scene on the right edge
  const rim = ctx.createLinearGradient(0, y, 0, y + h);
  rim.addColorStop(0.2, 'rgba(255,178,36,0)'); rim.addColorStop(0.5, 'rgba(255,178,36,0.35)'); rim.addColorStop(0.8, 'rgba(255,178,36,0)');
  ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w - 1, y + R); ctx.lineTo(x + w - 1, y + h - R); ctx.stroke();
}
function stepRail(ctx, uf) {
  const cur = uf < 14.25 ? 0 : uf < 17.5 ? 1 : 2;
  const fin = uf > 19.6;
  if (P) {
    // portrait: the current step only, above the phone
    const s = FORMAT.safe;
    STEPS.forEach(([label, sub, b], i) => {
      const a = E.outCubic(prog(uf, b, b + 0.5)) * (i < 2 ? 1 - prog(uf, STEPS[i + 1][2] - 0.25, STEPS[i + 1][2]) : 1);
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 30);
      text(ctx, `STEP ${i + 1} OF 3`, W / 2, s.y + 20, font(30, 500, 'UI'), C.acc, 'center', 3);
      text(ctx, label, W / 2, s.y + 118, font(84, 800, 'Display'), C.ink, 'center', -2);
      text(ctx, sub, W / 2, s.y + 178, font(32, 500, 'UI'), C.mut, 'center');
      ctx.restore();
    });
    return;
  }
  const x = FORMAT.safe.x, y0 = 300;
  const ia = E.outCubic(prog(uf, 12.6, 13.2));
  ctx.save(); ctx.globalAlpha = ia;
  text(ctx, 'IN TELEGRAM  ·  ON TON', x, y0 - 130, font(30, 500, 'UI'), C.acc, 'left', 3);
  text(ctx, 'Join in three taps.', x, y0 - 50, font(80, 800, 'Display'), C.ink, 'left', -2);
  ctx.restore();
  const gap = 170;
  STEPS.forEach(([label, sub, b], i) => {
    const y = y0 + 90 + i * gap, cy = y - 18;
    const on = i === cur, done = i < cur || (i === 2 && fin);
    const a = E.outCubic(prog(uf, 12.7 + i * 0.25, 13.3 + i * 0.25));
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a * (on || done ? 1 : 0.38); ctx.translate((1 - a) * -30, 0);
    // rail between circles
    if (i < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 34, cy + 40, 4, gap - 80);
      const f = clamp(prog(uf, STEPS[i + 1][2] - 0.6, STEPS[i + 1][2]));
      ctx.fillStyle = C.acc; ctx.fillRect(x + 34, cy + 40, 4, (gap - 80) * f);
    }
    ctx.beginPath(); ctx.arc(x + 36, cy, 36, 0, 7);
    if (on || done) { ctx.fillStyle = C.acc; ctx.fill(); } else { ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2.5; ctx.stroke(); }
    if (done) { ctx.strokeStyle = C.accInk; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x + 22, cy + 1); ctx.lineTo(x + 32, cy + 12); ctx.lineTo(x + 51, cy - 10); ctx.stroke(); }
    else text(ctx, String(i + 1), x + 36, cy + 12, font(34, 600, 'UI'), on ? C.accInk : C.ink, 'center');
    text(ctx, label, x + 100, y, font(54, 700, 'Display'), C.ink, 'left', -1);
    text(ctx, sub, x + 102, y + 48, font(28, 500, 'UI'), on ? C.acc : C.mut, 'left');
    ctx.restore();
  });
}
function sceneApp2(ctx, uf, t) {
  bg(ctx, P ? 0.5 : 0.7, P ? 0.6 : 0.5, 0.13);
  ctx.save(); ctx.fillStyle = C.ink;
  const r = mulberry32(17);
  for (let i = 0; i < 120; i++) { const x = r() * W, y = r() * H, sz = 1 + r() * 2.2; ctx.globalAlpha = 0.1 + 0.12 * r(); ctx.beginPath(); ctx.arc(x + Math.sin(t * 0.25 + i) * 8, y + Math.cos(t * 0.2 + i) * 6, sz, 0, 7); ctx.fill(); }
  ctx.restore();
  const exit = E.inOutCubic(prog(uf, 21.15, 21.75));
  ctx.save(); ctx.globalAlpha = 1 - exit;
  stepRail(ctx, uf);
  // camera on the phone: rises in, floats, pushes in on each number that matters
  const box = phoneBox();
  const rise = E.outCubic(prog(uf, 12.2, 12.95));
  const [z, fx, fy] = springKeys(uf, [[12, [1, 0.5, 0.5]], [14.4, [1.42, 0.5, 0.3]], [15.0, [1.2, 0.5, 0.92]], [15.9, [1, 0.5, 0.5]],
    [16.65, [1.5, 0.5, 0.33]], [17.3, [1, 0.5, 0.5]], [19.65, [1.5, 0.5, 0.34]], [20.6, [1, 0.5, 0.5]]], SPRING.gentle);
  const zx = box.x + box.w * fx, zy = box.y + box.h * fy;
  // portrait: the phone is already large, so push in less and never let it rise into the step title
  const zz = P ? 1 + (z - 1) * 0.35 : z;
  const keep = P ? Math.max(0, 470 - (zy - (zy - box.y) * zz)) : 0;
  ctx.translate(0, (1 - rise) * H * 0.7 + Math.sin(t * 1.3) * 6 + exit * 60 + keep);
  M.zoomAbout(ctx, zz * (1 - 0.08 * exit), zx, zy);
  drawPhone(ctx, uf, t, box);
  ctx.restore();
}

// ---------------------------------------------------------------- S4 launch figures
function tile(ctx, x, y, w, h, u, u0, k, v, sub, bar, vs) {
  const s = springU(u, u0, SPRING.snappy);
  if (s <= 0.001) return;
  const col = E.inOutCubic(prog(u, 15.1, 15.8));
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
  const secs = 50 * 86400 + 2 * 3600 + 33 * 60 + 20 - Math.floor(M.TS(RNOW) - M.TS(FAST(UNWARP(14))));
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
  const a = E.outCubic(prog(u, 13.85, 14.4)) * (1 - prog(u, 15.2, 15.7));
  ctx.globalAlpha = a;
  const hs = FORMAT.pick({ '16x9': 64, '9x16': 72 });
  text(ctx, 'Presale is live.', s.x, P ? H * 0.3 - 10 : H * 0.5 - 135 - 20, font(hs, 800, 'Display'), C.ink, 'left', -2);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- S5 end card
function mark(ctx, cx, cy, sz, u) {
  const k = springU(u, 15.6, SPRING.bouncy);
  const draw = E.inOutCubic(prog(u, 15.4, 16.2));
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
  const l = E.inOutCubic(prog(u, 15.9, 16.5));
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
  rise(ctx, 'KELVARA', W / 2, wy, u, 15.85, { size: ws, weight: 700, color: C.ink, align: 'center', track: 0.1, stagger: 0.06, cfg: SPRING.snappy });
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
  const a = E.outCubic(prog(u, 17.6, 18.5));
  if (a > 0) {
    ctx.globalAlpha = a;
    const ly = wy + FORMAT.pick({ '16x9': 230, '9x16': 270 });
    text(ctx, 't.me/KelvaraLaunchBot', W / 2, ly, font(FORMAT.pick({ '16x9': 34, '9x16': 38 }), 500, 'UI'), C.ink, 'center');
    ctx.globalAlpha = a * 0.9;
    text(ctx, 'Concept project by Numinae  ·  not a real token', W / 2, ly + 58, font(FORMAT.pick({ '16x9': 24, '9x16': 26 }), 500, 'UI'), C.mut, 'center');
    ctx.globalAlpha = 1;
  }
}


// ---------------------------------------------------------------- pacing
// The film runs 15 s / 30 beats. Scenes are written on a 20-beat plan; WARP maps a film beat to
// that plan, piecewise-linear, so every shot holds longer and the app's receipts stay readable.
const KNOTS = [[0, 0], [5, 4], [12.5, 8],
  [21.6, 13.6], [21.75, 13.75], [23.25, 14.5], [24.4, 15.4], [25, 16], [26.5, 17.5], [30, 20]];
function pw(x, a, b) {
  if (x <= KNOTS[0][a]) return KNOTS[0][b] + (x - KNOTS[0][a]);
  for (let i = 1; i < KNOTS.length; i++) {
    const [p, q] = [KNOTS[i - 1], KNOTS[i]];
    if (x <= q[a]) return p[b] + ((x - p[a]) / (q[a] - p[a])) * (q[b] - p[b]);
  }
  const L = KNOTS[KNOTS.length - 1]; return L[b] + (x - L[a]);
}
const WARP = (u) => pw(u, 0, 1);      // film beat -> plan beat
const UNWARP = (v) => pw(v, 1, 0);    // plan beat -> film beat

// Real beats on the 120 bpm grid -> film beats (uf). The film's motion is written in film beats, so a long
// span of real beats over a short span of film beats is a hold: each Mini App screen gets time to be read,
// while taps and transitions keep their pace. Mirrored in audio/score.py (HOLDS).
const HOLDS = [[0, 0], [6, 2.9], [10, 3.75], [12, 5],               // opening: headline holds ~2 s, then the dive
  [19.5, 12.5],                                                    // machines, as approved
  [20.5, 12.95], [23.5, 13.05], [24.7, 13.6], [26, 14.25],          // phone lands · chat held · tap · Mini App slides up
  [30, 14.8], [31.4, 15.4], [34.8, 15.65], [36.2, 16.25],           // Buy held · tap Pay · Confirm held · tap Approve
  [38, 16.55], [38.6, 16.75], [42, 17.05], [43.4, 17.7],            // Settling held · receipt held · tap Claim now
  [45.8, 17.8], [47.2, 18.45], [49.6, 18.55], [51, 19.15],          // Claim held · tap · Confirm claim held · tap
  [52.6, 19.45], [53.2, 19.7], [57.2, 21.15], [58.5, 21.75],        // Claiming held · claimed held · phone leaves
  [61.5, 23.25], [64.5, 24.4], [65.5, 25],                       // figures: tiles in at half speed, all four held
  [70.5, 30]];
const SLOW = (r) => { const K = HOLDS; if (r <= 0) return r;
  for (let i = 1; i < K.length; i++) if (r <= K[i][0]) return K[i - 1][1] + (r - K[i - 1][0]) / (K[i][0] - K[i - 1][0]) * (K[i][1] - K[i - 1][1]);
  const L = K[K.length - 1]; return L[1] + (r - L[0]); };
const FAST = (f) => { const K = HOLDS; if (f <= 0) return f;
  for (let i = 1; i < K.length; i++) if (f <= K[i][1]) return K[i - 1][0] + (f - K[i - 1][1]) / (K[i][1] - K[i - 1][1]) * (K[i][0] - K[i - 1][0]);
  const L = K[K.length - 1]; return L[0] + (f - L[1]); };
let RNOW = 0;   // the real beat being drawn (taps are timed in real beats so they never crawl through a hold)

// ---------------------------------------------------------------- film
M.film({
  fonts: [font(100, 800, 'Display'), font(100, 700, 'Display'), font(100, 600, 'Display'), font(40, 500, 'UI')],
  images: IMAGES,
  hits: HITS.map(([b, l, f, o = {}]) => { const { film, ...rest } = o; return [Math.round(FAST(film ? b : UNWARP(b)) * 1000) / 1000, l, f, rest]; }),
  // motion blur sub-frames: more on whips, fewer where 3-D is expensive
  samples: (t) => { const u = WARP(SLOW(M.U(t))); return u > 13.9 && u < 15.5 ? 1 : (u > 5.2 && u < 5.8) || (u > 6.7 && u < 7.3) || (u > 7.7 && u < 8.1) ? 8 : u < 4 || (u > 7.9 && u < 14.4) ? 3 : 4; },
  async init(ctx, images) {
    IMG = images;
    await G.initGL({ exposure: 1.0 });
    LAT = latticeSet(); PHONE = phoneSet();
    const tp = await fetch('assets/miniapp/taps.json').then((r) => r.json());
    const t3 = await fetch('assets/miniapp4/taps.json').then((r) => r.json()), tc = await fetch('assets/chat/taps.json').then((r) => r.json());
    TAPS2 = [[13.5, tc.open.x, tc.open.y, true], [15.25, t3.pay.x, t3.pay.y], [16.1, t3.approvePay.x, t3.approvePay.y], [17.5, t3.claimNow.x, t3.claimNow.y], [18.25, t3.claim.x, t3.claim.y], [19, t3.approveClaim.x, t3.approveClaim.y]];
    TAPS = [[9, tp.pay.x, tp.pay.y], [10.5, tp.approvePay.x, tp.approvePay.y], [12, tp.claimNow.x, tp.claimNow.y], [12.5, tp.claim.x, tp.claim.y], [13, tp.approveClaim.x, tp.approveClaim.y]];
  },
  draw(ctx, r, rt) {
    RNOW = r;
    const uf = SLOW(r), t = M.TS(uf), u = WARP(uf);
    if (u < 4) sceneLattice(ctx, u, t);
    else if (uf < 12.5) sceneMachines(ctx, u);
    else if (uf < 21.75) sceneApp2(ctx, uf, t);
    else if (u < 16) { sceneFigures(ctx, u, t); if (u > 15.5) mark(ctx, W / 2, H * (P ? 0.36 : 0.32), FORMAT.pick({ '16x9': 150, '9x16': 190 }), u); }
    else endCard(ctx, u, t);
    // 14.0-14.35: the phone pulls away while the figures arrive
  },
  post(ctx, u, t) { grain(ctx, t, 0.035, 0.32); },
});
