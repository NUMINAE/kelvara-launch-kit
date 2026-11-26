// Shared helpers for the Numinae ads. Pure functions of (ctx, u): no state between frames.
import * as M from './motion.js';
const { W, H, E, prog, clamp, lerp, springU, SPRING, font, layout, glyph, rrect, mulberry32 } = M;

// Pre-blurred copy of an image (made once in init, never per frame).
export function blurred(img, px = 40, scale = 0.25) {
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const x = c.getContext('2d'); x.filter = `blur(${px * scale}px)`;
  x.drawImage(img, -px * scale, -px * scale, c.width + 2 * px * scale, c.height + 2 * px * scale);
  return c;
}

// Cover-fit a picture into a box with a log-space push (constant-rate dolly) and drift.
export function shot(ctx, img, x, y, w, h, u, u0, u1, { z0 = 1.06, z1 = 1.16, fx = 0.5, fy = 0.5, dx = 0, dy = 0, radius = 0 } = {}) {
  const p = clamp((u - u0) / (u1 - u0), 0, 1);
  const zoom = z0 * (z1 / z0) ** p;
  M.cover(ctx, img, x, y, w, h, { fx: clamp(fx + dx * p), fy: clamp(fy + dy * p), zoom, radius });
}

// Words that spring up from behind a baseline mask, glyph by glyph.
export function rise(ctx, str, x, y, u, u0, { size = 120, weight = 700, family = 'Display', color = '#fff', track = -0.03, align = 'left', stagger = 0.025, out = null, outLen = 0.35, cfg = SPRING.snappy } = {}) {
  const f = font(size, weight, family);
  const L = layout(ctx, str, f, track * size);
  const x0 = align === 'center' ? x - L.width / 2 : align === 'right' ? x - L.width : x;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, y - size * 1.25, W, size * 1.25 + size * 0.32); ctx.clip();
  L.glyphs.forEach((g, j) => {
    const k = springU(u, u0 + j * stagger, cfg);
    if (k <= 0.001) return;
    let yy = y + (1 - k) * size * 1.1;
    if (out != null) yy -= E.inCubic(prog(u, out + j * stagger * 0.5, out + outLen + j * stagger * 0.5)) * size * 1.3;
    glyph(ctx, g.ch, x0 + g.cx, yy, f, color);
  });
  ctx.restore();
  return L.width;
}

// A glass card: frosted fill from a blurred backdrop, bevelled edge (bright top-left, warm bottom-right).
export function glass(ctx, x, y, w, h, r, { back = null, tint = 'rgba(255,255,255,0.10)', edgeA = 'rgba(255,255,255,0.9)', edgeB = 'rgba(255,196,107,0.85)', lw = 3 } = {}) {
  ctx.save();
  rrect(ctx, x, y, w, h, r); ctx.clip();
  if (back) ctx.drawImage(back, 0, 0, W, H);
  ctx.fillStyle = tint; ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(255,140,160,0.08)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
  const e = ctx.createLinearGradient(x, y, x + w, y + h);
  e.addColorStop(0, edgeA); e.addColorStop(0.3, 'rgba(255,255,255,0.18)'); e.addColorStop(0.6, 'rgba(255,255,255,0.06)'); e.addColorStop(1, edgeB);
  ctx.save(); ctx.lineWidth = lw; ctx.strokeStyle = e; rrect(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, r - lw / 2); ctx.stroke(); ctx.restore();
}

// Seeded sparks/embers rising: position is a closed-form function of t.
export function embers(ctx, t, { n = 90, seed = 7, x0 = 0, x1 = W, y0 = H, rise = 0.55, color = [255, 160, 60], size = 3, alpha = 1 } = {}) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const r = mulberry32(seed * 1000 + i);
    const life = 1.6 + r() * 2.2, ph = r() * life, x = x0 + r() * (x1 - x0), sp = (0.6 + r()) * rise * H, sw = 20 + r() * 60, s = size * (0.5 + r());
    const a = ((t + ph) % life) / life;
    const px = x + Math.sin((t + ph) * (1.2 + r())) * sw, py = y0 - a * sp;
    const o = Math.sin(Math.PI * a) * alpha;
    ctx.fillStyle = `rgba(${color[0]},${color[1] + Math.round(60 * (1 - a))},${color[2]},${o})`;
    ctx.beginPath(); ctx.arc(px, py, s * (1 - a * 0.6), 0, 7); ctx.fill();
  }
  ctx.restore();
}

// Film grain + vignette, drawn in post (after motion blur).
let GR = null;
export function grain(ctx, t, amt = 0.06, vig = 0.5) {
  if (!GR) {
    GR = []; for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
      const d = x.createImageData(256, 256); const r = mulberry32(99 + k);
      for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      x.putImageData(d, 0, 0); GR.push(c);
    }
  }
  ctx.save(); ctx.globalAlpha = amt; ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(GR[Math.floor(t * 24) % 4], 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
  if (vig > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${vig})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

// Rounded-rect clip reveal from one side; p 0..1.
export function wipeClip(ctx, x, y, w, h, r, p, dir = 'up') {
  const q = E.outQuint(clamp(p));
  rrect(ctx, x, dir === 'up' ? y + h * (1 - q) : y, dir === 'left' ? w * q : w, dir === 'up' ? h * q : h, r); ctx.clip();
}
export { M };
